import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { emails } from '../db/schema';
import { emailQueue, enqueueEmails } from '../queue/emailQueue';
import { logger } from '../utils/logger';

const PAGE = 500;

/**
 * Runs once at worker boot. MySQL is the source of truth, Redis is the timer.
 * This repairs any drift between them (e.g. Redis was wiped, or an API call saved
 * rows but crashed before enqueueing). It never creates duplicates: enqueue uses
 * jobId === emails.id, and we only enqueue rows that have no job.
 */
export async function reconcile() {
  // 1) A crash mid-send leaves a row in 'sending'. We can't know whether SMTP accepted
  //    it, so we choose at-most-once: mark failed instead of risking a duplicate send.
  const staleBefore = new Date(Date.now() - env.STALE_SENDING_MINUTES * 60_000);
  const [stale] = await db
    .update(emails)
    .set({
      status: 'failed',
      error: 'Worker crashed mid-send; not retried to avoid a duplicate email',
      updatedAt: new Date(),
    })
    .where(and(eq(emails.status, 'sending'), lt(emails.updatedAt, staleBefore)));
  if (stale.affectedRows) logger.warn(`Reconcile: marked ${stale.affectedRows} stale 'sending' rows as failed`);

  // 2) Re-enqueue 'scheduled' rows that have no BullMQ job (keyset pagination by id).
  let lastId = '';
  let checked = 0;
  let restored = 0;
  for (;;) {
    const rows = await db
      .select({ id: emails.id, scheduledAt: emails.scheduledAt })
      .from(emails)
      .where(and(eq(emails.status, 'scheduled'), gt(emails.id, lastId)))
      .orderBy(asc(emails.id))
      .limit(PAGE);
    if (rows.length === 0) break;

    const jobs = await Promise.all(rows.map((r) => emailQueue.getJob(r.id)));
    const missing = rows.filter((_, i) => !jobs[i]);
    if (missing.length) {
      await enqueueEmails(missing); // overdue rows get delay 0 and send immediately
      restored += missing.length;
    }
    checked += rows.length;
    lastId = rows[rows.length - 1].id;
  }
  logger.info(`Reconcile done: checked ${checked} scheduled rows, re-enqueued ${restored}`);
}
