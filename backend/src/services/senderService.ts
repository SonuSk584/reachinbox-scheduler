import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { senders } from '../db/schema';
import { logger } from '../utils/logger';
import { createEtherealAccount } from './mailer';

/** Create a fresh Ethereal (fake SMTP) inbox and store it as one of the user's senders. */
export async function createEtherealSender(userId: string) {
  const acc = await createEtherealAccount();
  const id = randomUUID();
  const name = acc.email.split('@')[0];
  await db.insert(senders).values({ id, userId, name, ...acc });
  return { id, email: acc.email, name };
}

/**
 * New users get one sender automatically, so the From field is never empty on first use.
 * Fire-and-forget: if Ethereal is unreachable, login still works and they can add one in Compose.
 */
export function ensureDefaultSender(userId: string) {
  void createEtherealSender(userId).catch((err) =>
    logger.warn(`Could not create a default sender for new user: ${err instanceof Error ? err.message : err}`),
  );
}
