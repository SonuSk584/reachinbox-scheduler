import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { senders } from '../db/schema';
import { logger } from '../utils/logger';
import { redis } from './rateLimiter';
import { getConnection, sendSlackMessage } from './slackService';

const HOUR_MS = 3_600_000;

export interface RateLimitHit {
  senderId: string;
  senderEmail: string;
  limit: number;
  /** The current hourly window (hours since 1970). */
  window: number;
  /** true if an email was actually pushed back; false if the limit was only just filled. */
  overflowed: boolean;
}

/** Slack renders this in each reader's own timezone. */
const slackTime = (ms: number) => `<!date^${Math.floor(ms / 1000)}^{date_short_pretty} at {time}|${new Date(ms).toISOString()}>`;

/**
 * Called when a sender fills its hourly limit. Posts ONE Slack message per sender per hour (with
 * 1000 queued emails an alert per email would be spam).
 *
 *  - Not connected to Slack: nothing happens, no error, and the once-per-hour slot is NOT used up,
 *    so if they connect a minute later the very next event notifies them (no restart or redeploy).
 *  - Slack unreachable: the slot is released so the next event tries again.
 */
export async function notifyRateLimitHit(hit: RateLimitHit) {
  const [sender] = await db.select({ userId: senders.userId }).from(senders).where(eq(senders.id, hit.senderId));
  if (!sender) return;

  const connection = await getConnection(sender.userId);
  if (!connection) return;

  const key = `rl:{${hit.senderId}}:notified:${hit.window}`;
  if (!(await redis.set(key, '1', 'EX', 7200, 'NX'))) return; // already told them this hour

  const resetAt = (hit.window + 1) * HOUR_MS;
  const what = hit.overflowed
    ? 'New emails from this sender are being rescheduled, and sending resumes'
    : 'That was the last email allowed this hour; further emails will be rescheduled, and sending resumes';
  const text =
    `:warning: *Hourly sending limit reached* for \`${hit.senderEmail}\` (${hit.limit}/hour).\n` +
    `${what} at ${slackTime(resetAt)}. Nothing is lost: every email will still be sent.`;

  if (await sendSlackMessage(connection, text)) {
    logger.info(`Slack alert sent for ${hit.senderEmail} (limit ${hit.limit}/hour)`);
  } else {
    await redis.del(key);
  }
}
