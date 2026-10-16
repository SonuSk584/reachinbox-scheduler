import { Queue } from 'bullmq';
import { env } from '../config/env';
import { createRedisConnection } from './connection';

export const EMAIL_QUEUE_NAME = 'email-send';

export interface EmailJobData {
  emailId: string;
  /**
   * Epoch ms of the send slot this job has already reserved in Redis. Persisted on the job so a
   * restart, stall or re-delivery reuses the reservation instead of consuming a second slot.
   */
  slotAt?: number;
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: env.JOB_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

const CHUNK = 500;

/**
 * Enqueue one delayed job per email.
 *
 * IDEMPOTENCY (layer 1): jobId === emails.id. BullMQ ignores an add() whose jobId
 * already exists, so the same email can never be queued twice.
 */
export async function enqueueEmails(rows: { id: string; scheduledAt: Date }[]) {
  const now = Date.now();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await emailQueue.addBulk(
      slice.map((r) => ({
        name: 'send',
        data: { emailId: r.id },
        opts: { jobId: r.id, delay: Math.max(0, r.scheduledAt.getTime() - now) },
      })),
    );
  }
}
