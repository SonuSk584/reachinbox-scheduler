import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { users } from '../db/schema';
import { getSessionUserId, SESSION_COOKIE } from '../services/session';
import { readCookie } from '../utils/cookies';
import { HttpError } from './errorHandler';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

let devUserId: string | undefined;

async function getDevUserId() {
  if (devUserId) return devUserId;
  const email = 'dev@reachinbox.local';
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return (devUserId = existing.id);
  const id = randomUUID();
  await db.insert(users).values({ id, email, name: 'Dev User' });
  return (devUserId = id);
}

/**
 * Puts the logged-in user's id on `req.userId`, or responds 401.
 *  - AUTH_MODE=google: looks the session cookie up in Redis
 *  - AUTH_MODE=dev:    skips login and acts as a local dev user (development only)
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    if (env.AUTH_MODE === 'dev') {
      req.userId = await getDevUserId();
      return next();
    }
    const sessionId = readCookie(req, SESSION_COOKIE);
    const userId = sessionId ? await getSessionUserId(sessionId) : null;
    if (!userId) throw new HttpError(401, 'Not authenticated');
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
