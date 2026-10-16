import { Client } from '@elastic/elasticsearch';
import { asc, count, eq, gt, inArray } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { batches, emails, senders, type EmailStatus } from '../db/schema';
import { htmlToText } from '../utils/htmlToText';
import { logger } from '../utils/logger';

/**
 * Elasticsearch makes emails searchable. MySQL stays the source of truth:
 *  - every email is indexed when it is scheduled, and re-indexed whenever its status or time changes
 *  - search asks Elasticsearch WHICH emails match, then loads the real rows from MySQL
 *  - if Elasticsearch is down, indexing and search fail softly and must never break sending
 */

const INDEX = env.ELASTICSEARCH_INDEX;
const client = new Client({ node: env.ELASTICSEARCH_URL, maxRetries: 1, requestTimeout: 5000 });

export interface EmailSearchDoc {
  id: string;
  userId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  senderEmail: string;
  status: EmailStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  updatedAt: Date;
}

// ---------- error handling: log search outages at most once a minute ----------
let lastWarnAt = 0;
export function warnSearchDown(what: string, err: unknown) {
  if (Date.now() - lastWarnAt < 60_000) return;
  lastWarnAt = Date.now();
  logger.warn(`Elasticsearch unavailable (${what}): ${err instanceof Error ? err.message : String(err)}`);
}

// ---------- index setup ----------
let ensuring: Promise<void> | null = null;

export function ensureIndex(): Promise<void> {
  ensuring ??= (async () => {
    if (await client.indices.exists({ index: INDEX })) return;
    try {
      await client.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            status: { type: 'keyword' },
            senderEmail: { type: 'keyword' },
            // text for word search, plus an exact lowercase-able copy for substring (wildcard) search
            toEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            bodyText: { type: 'text' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
      });
      logger.info(`Elasticsearch index "${INDEX}" created`);
    } catch (err) {
      // The API and the worker may race to create it; "already exists" is fine.
      if (!String((err as Error).message).includes('resource_already_exists')) throw err;
    }
  })().catch((err) => {
    ensuring = null; // retry on the next call
    throw err;
  });
  return ensuring;
}

// ---------- indexing ----------
async function loadDocs(ids: string[]): Promise<EmailSearchDoc[]> {
  const rows = await db
    .select({
      id: emails.id,
      userId: emails.userId,
      toEmail: emails.toEmail,
      subject: batches.subject,
      body: batches.body,
      senderEmail: senders.email,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      updatedAt: emails.updatedAt,
    })
    .from(emails)
    .innerJoin(batches, eq(emails.batchId, batches.id))
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .where(inArray(emails.id, ids));
  return rows.map(({ body, ...rest }) => ({ ...rest, bodyText: htmlToText(body).slice(0, 5000) }));
}

const BULK_CHUNK = 500;

/** Index (or re-index) emails by id, reading the current state from MySQL. Safe to call repeatedly. */
export async function indexEmails(ids: string[]) {
  if (ids.length === 0) return;
  await ensureIndex();
  for (let i = 0; i < ids.length; i += BULK_CHUNK) {
    const docs = await loadDocs(ids.slice(i, i + BULK_CHUNK));
    if (docs.length === 0) continue;
    const res = await client.bulk({ operations: docs.flatMap((d) => [{ index: { _index: INDEX, _id: d.id } }, d]) });
    if (res.errors) logger.warn(`Elasticsearch bulk index reported errors for part of a ${docs.length}-email chunk`);
  }
}

/** Fire-and-forget: keeps the index in step without ever slowing down or failing a send. */
export function syncInBackground(ids: string | string[]) {
  void indexEmails(Array.isArray(ids) ? ids : [ids]).catch((err) => warnSearchDown('indexing', err));
}

// ---------- search ----------
export interface SearchResult {
  ids: string[];
  total: number;
}

export async function searchEmailIds(
  userId: string,
  statuses: EmailStatus[],
  q: string,
  kind: 'scheduled' | 'sent',
  page: number,
  limit: number,
): Promise<SearchResult> {
  await ensureIndex();
  const term = q.trim();
  const escaped = term.replace(/[\\*?]/g, '\\$&'); // wildcard metacharacters are literal in a user's search

  const res = await client.search({
    index: INDEX,
    from: (page - 1) * limit,
    size: limit,
    track_total_hits: true,
    _source: false,
    query: {
      bool: {
        filter: [{ term: { userId } }, { terms: { status: statuses } }],
        must: [
          {
            bool: {
              minimum_should_match: 1,
              should: [
                // words in the subject, body or address; the last word may be a prefix ("meet" finds "meeting")
                { multi_match: { query: term, type: 'bool_prefix', fields: ['subject^3', 'bodyText', 'toEmail'] } },
                // any part of the address ("w3" finds "w3@x.com", "example.com" finds every address there)
                { wildcard: { 'toEmail.raw': { value: `*${escaped}*`, case_insensitive: true } } },
              ],
            },
          },
        ],
      },
    },
    sort: kind === 'scheduled' ? [{ scheduledAt: 'asc' }] : [{ updatedAt: 'desc' }],
  });

  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  return { ids: res.hits.hits.map((h) => h._id as string), total };
}

// ---------- rebuild / self-heal ----------
export async function resetIndex() {
  await client.indices.delete({ index: INDEX, ignore_unavailable: true });
  ensuring = null;
  await ensureIndex();
}

/** Re-index every email from MySQL (keyset pagination, so it scales). */
export async function reindexAll(): Promise<number> {
  await ensureIndex();
  let lastId = '';
  let total = 0;
  for (;;) {
    const rows = await db
      .select({ id: emails.id })
      .from(emails)
      .where(gt(emails.id, lastId))
      .orderBy(asc(emails.id))
      .limit(1000);
    if (rows.length === 0) break;
    await indexEmails(rows.map((r) => r.id));
    total += rows.length;
    lastId = rows[rows.length - 1].id;
  }
  await client.indices.refresh({ index: INDEX });
  return total;
}

/** At worker start: if the index and MySQL disagree (index wiped, or ES was down), rebuild it. */
export async function reindexIfDrifted() {
  try {
    await ensureIndex();
    const [{ n }] = await db.select({ n: count() }).from(emails);
    const { count: indexed } = await client.count({ index: INDEX });
    if (indexed === n) return;
    logger.info(`Search index out of sync (${indexed} indexed vs ${n} in MySQL). Rebuilding...`);
    if (indexed > n) await resetIndex(); // stale documents for deleted rows: start clean
    logger.info(`Search index rebuilt: ${await reindexAll()} emails`);
  } catch (err) {
    warnSearchDown('startup check', err);
  }
}
