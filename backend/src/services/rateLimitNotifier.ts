import { logger } from '../utils/logger';
import { redis } from './rateLimiter';

export interface RateLimitHit {
  senderId: string;
  senderEmail: string;
  limit: number;
  /** Epoch ms when the deferred email will now go out. */
  deferredUntil: number | null;
}

/**
 * Called whenever an email is pushed back by the hourly limit.
 * Deduplicated so each sender triggers ONE notification per hour, not one per deferred email
 * (with 1000 queued emails that would otherwise be 800+ messages).
 *
 * Phase 6 plugs the real Slack message in at the marked spot.
 */
export async function notifyRateLimitHit(hit: RateLimitHit) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const firstThisHour = await redis.set(`rl:{${hit.senderId}}:notified:${hour}`, '1', 'EX', 7200, 'NX');
  if (!firstThisHour) return;

  const until = hit.deferredUntil ? new Date(hit.deferredUntil).toISOString() : 'a later hour';
  logger.warn(
    `Hourly limit reached for sender ${hit.senderEmail} (${hit.limit}/hour). Further emails are deferred, next at ${until}`,
  );

  // Phase 6: send the Slack notification here.
}
