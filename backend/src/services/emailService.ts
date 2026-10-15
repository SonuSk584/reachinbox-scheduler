import { randomUUID } from 'crypto';
import { and, asc, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { batches, emails, senders, type EmailStatus } from '../db/schema';
import { enqueueEmails } from '../queue/emailQueue';
import { HttpError } from '../middleware/errorHandler';

export interface ScheduleInput {
  senderId: string;
  subject: string;
  body: string;
  leads: string[];
  startTime?: Date;
  delaySeconds: number;
  hourlyLimit?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INSERT_CHUNK = 500;

export function normalizeLeads(raw: string[]) {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const item of raw) {
    const e = item.trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) { invalid++; continue; }
    if (seen.has(e)) { duplicates++; continue; }
    seen.add(e);
    valid.push(e);
  }
  return { valid, invalid, duplicates };
}

export async function scheduleBatch(userId: string, input: ScheduleInput) {
  const [sender] = await db
    .select({ id: senders.id })
    .from(senders)
    .where(and(eq(senders.id, input.senderId), eq(senders.userId, userId)));
  if (!sender) throw new HttpError(404, 'Sender not found');

  const { valid, invalid, duplicates } = normalizeLeads(input.leads);
  if (valid.length === 0) throw new HttpError(400, 'No valid email addresses found in leads');

  const start = input.startTime && input.startTime.getTime() > Date.now() ? input.startTime : new Date();
  const stepMs = input.delaySeconds * 1000;

  // 1) Persist first (source of truth). Batch + all emails commit atomically.
  //    MySQL has no RETURNING, so ids are generated here and we already know them.
  const batchId = randomUUID();
  const inserted: { id: string; scheduledAt: Date }[] = valid.map((_, i) => ({
    id: randomUUID(),
    scheduledAt: new Date(start.getTime() + i * stepMs),
  }));

  await db.transaction(async (tx) => {
    await tx.insert(batches).values({
      id: batchId,
      userId,
      senderId: input.senderId,
      subject: input.subject,
      body: input.body,
      startTime: start,
      delaySeconds: input.delaySeconds,
      hourlyLimit: input.hourlyLimit ?? null,
    });

    for (let i = 0; i < valid.length; i += INSERT_CHUNK) {
      await tx.insert(emails).values(
        valid.slice(i, i + INSERT_CHUNK).map((toEmail, j) => ({
          id: inserted[i + j].id,
          batchId,
          userId,
          senderId: input.senderId,
          seq: i + j,
          toEmail,
          scheduledAt: inserted[i + j].scheduledAt,
        })),
      );
    }
  });

  // 2) Then enqueue. If this fails the rows still exist as 'scheduled' and the
  //    worker's boot-time reconcile() will enqueue them - nothing is lost.
  await enqueueEmails(inserted);

  return {
    batchId,
    scheduled: valid.length,
    invalid,
    duplicates,
    firstSendAt: inserted[0].scheduledAt,
    lastSendAt: inserted[inserted.length - 1].scheduledAt,
  };
}

export type ListKind = 'scheduled' | 'sent';
const KIND_STATUSES: Record<ListKind, EmailStatus[]> = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed'],
};

export async function listEmails(userId: string, kind: ListKind, page: number, limit: number, q?: string) {
  // Simple substring search for now. Phase 4 swaps this for Elasticsearch behind the same `q` param.
  const term = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const where = and(
    eq(emails.userId, userId),
    inArray(emails.status, KIND_STATUSES[kind]),
    term ? or(like(emails.toEmail, term), like(batches.subject, term)) : undefined,
  );

  const items = await db
    .select({
      id: emails.id,
      toEmail: emails.toEmail,
      subject: batches.subject,
      snippet: sql<string>`LEFT(TRIM(REGEXP_REPLACE(${batches.body}, '<[^>]*>', ' ')), 120)`,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      updatedAt: emails.updatedAt,
      previewUrl: emails.previewUrl,
      error: emails.error,
    })
    .from(emails)
    .innerJoin(batches, eq(emails.batchId, batches.id))
    .where(where)
    .orderBy(kind === 'scheduled' ? asc(emails.scheduledAt) : desc(emails.updatedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ total }] = await db
    .select({ total: count() })
    .from(emails)
    .innerJoin(batches, eq(emails.batchId, batches.id))
    .where(where);
  return { items, page, limit, total };
}

export async function getCounts(userId: string) {
  const rows = await db
    .select({ status: emails.status, n: count() })
    .from(emails)
    .where(eq(emails.userId, userId))
    .groupBy(emails.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<EmailStatus, number>>;
  return {
    scheduled: (by.scheduled ?? 0) + (by.sending ?? 0),
    sent: by.sent ?? 0,
    failed: by.failed ?? 0,
  };
}

export async function getEmail(userId: string, id: string) {
  const [row] = await db
    .select({
      id: emails.id,
      toEmail: emails.toEmail,
      subject: batches.subject,
      body: batches.body,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      previewUrl: emails.previewUrl,
      error: emails.error,
      senderEmail: senders.email,
      senderName: senders.name,
    })
    .from(emails)
    .innerJoin(batches, eq(emails.batchId, batches.id))
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .where(and(eq(emails.id, id), eq(emails.userId, userId)));
  if (!row) throw new HttpError(404, 'Email not found');
  return row;
}
