import { DelayedError, Job, Worker } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { batches, emails, senders } from '../db/schema';
import { createRedisConnection } from '../queue/connection';
import { EMAIL_QUEUE_NAME, type EmailJobData } from '../queue/emailQueue';
import { sendMail } from '../services/mailer';
import { acquireSendSlot, sleep } from '../services/rateLimiter';
import { notifyRateLimitHit } from '../services/rateLimitNotifier';
import { logger } from '../utils/logger';

const HOUR_MS = 3_600_000;

/** Park this job until `at` (epoch ms) without consuming a retry attempt, and show the new time in the UI. */
async function deferJob(job: Job<EmailJobData>, token: string | undefined, emailId: string, at: number): Promise<never> {
  await db
    .update(emails)
    .set({ scheduledAt: new Date(at), updatedAt: new Date() })
    .where(and(eq(emails.id, emailId), eq(emails.status, 'scheduled')));
  await job.moveToDelayed(at, token);
  throw new DelayedError(); // tells BullMQ "I moved this job myself": not a failure, not a retry
}

export async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;

  const [row] = await db
    .select({
      status: emails.status,
      senderId: emails.senderId,
      senderEmail: senders.email,
      hourlyLimit: batches.hourlyLimit,
    })
    .from(emails)
    .innerJoin(batches, eq(emails.batchId, batches.id))
    .innerJoin(senders, eq(emails.senderId, senders.id))
    .where(eq(emails.id, emailId));

  if (!row || row.status !== 'scheduled') {
    logger.warn(`Skipping ${emailId}: already claimed/sent (idempotency guard)`);
    return { skipped: true };
  }

  // ---- RATE LIMIT + MIN DELAY: reserve a send slot for this sender (atomic, in Redis) ----
  let slotAt = job.data.slotAt; // already reserved on an earlier pass (parked job waking up, restart, stall)
  if (slotAt === undefined) {
    const limit = row.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    const slot = await acquireSendSlot(row.senderId, limit);

    if (slot.hitHourlyLimit) {
      await notifyRateLimitHit({ senderId: row.senderId, senderEmail: row.senderEmail, limit, deferredUntil: slot.slotAt });
    }
    if (slot.slotAt === null) {
      // Every window inside the horizon is full. Never drop: look again in an hour.
      return deferJob(job, token, emailId, Date.now() + HOUR_MS);
    }
    slotAt = slot.slotAt;
    await job.updateData({ emailId, slotAt }); // persist the reservation so it is never counted twice
  }

  const wait = slotAt - Date.now();
  if (wait > env.INLINE_WAIT_MAX_MS) {
    // Far away (next hour, or a long backlog): park as a delayed job rather than hold a worker slot.
    return deferJob(job, token, emailId, slotAt);
  }
  if (wait > 0) await sleep(wait); // short wait: this is what spaces sends by the minimum delay

  if (job.data.slotAt !== undefined) await job.updateData({ emailId }); // reservation used; a retry must book a new slot

  // ---- IDEMPOTENCY (layer 2): atomic claim. Only ONE worker can flip scheduled -> sending. ----
  const [claim] = await db
    .update(emails)
    .set({ status: 'sending', attempts: sql`${emails.attempts} + 1`, error: null, updatedAt: new Date() })
    .where(and(eq(emails.id, emailId), eq(emails.status, 'scheduled')));

  if (claim.affectedRows === 0) {
    logger.warn(`Skipping ${emailId}: already claimed/sent (idempotency guard)`);
    return { skipped: true };
  }

  const [claimed] = await db.select().from(emails).where(eq(emails.id, emailId));
  const [sender] = await db.select().from(senders).where(eq(senders.id, claimed.senderId));
  const [batch] = await db.select().from(batches).where(eq(batches.id, claimed.batchId));

  let result: { messageId: string; previewUrl: string | null };
  try {
    result = await sendMail(sender, { to: claimed.toEmail, subject: batch.subject, html: batch.body });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    // Not final: put back to 'scheduled' so the BullMQ retry can claim it again.
    await db
      .update(emails)
      .set({ status: isFinalAttempt ? 'failed' : 'scheduled', error: message, updatedAt: new Date() })
      .where(eq(emails.id, emailId));
    throw err; // lets BullMQ apply backoff / mark job failed
  }

  // Outside the try: if this DB write fails the row stays 'sending' and is never re-sent.
  await db
    .update(emails)
    .set({
      status: 'sent',
      sentAt: new Date(),
      messageId: result.messageId,
      previewUrl: result.previewUrl,
      updatedAt: new Date(),
    })
    .where(eq(emails.id, emailId));

  logger.info(`Sent ${emailId} -> ${claimed.toEmail}`);
  return { sent: true };
}

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedisConnection(),
    concurrency: env.WORKER_CONCURRENCY,
  });

  worker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed: ${err.message}`));
  worker.on('error', (err) => logger.error('Worker error', err.message));
  logger.info(
    `Email worker started (concurrency=${env.WORKER_CONCURRENCY}, min delay=${env.MIN_DELAY_BETWEEN_SENDS_MS}ms, ` +
      `default limit=${env.MAX_EMAILS_PER_HOUR_PER_SENDER}/hour per sender)`,
  );
  return worker;
}
