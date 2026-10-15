import { Job, Worker } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { batches, emails, senders } from '../db/schema';
import { createRedisConnection } from '../queue/connection';
import { EMAIL_QUEUE_NAME, type EmailJobData } from '../queue/emailQueue';
import { sendMail } from '../services/mailer';
import { logger } from '../utils/logger';

export async function processEmailJob(job: Job<EmailJobData>) {
  const { emailId } = job.data;

  // IDEMPOTENCY (layer 2): atomic claim. Only ONE worker can flip scheduled -> sending:
  // MySQL evaluates the WHERE + SET as a single atomic row update, so exactly one
  // concurrent UPDATE sees affectedRows = 1. Retries, stalled-job recovery, and
  // duplicate jobs all get 0 and skip.
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
  logger.info(`Email worker started (concurrency=${env.WORKER_CONCURRENCY})`);
  return worker;
}
