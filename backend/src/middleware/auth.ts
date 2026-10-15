import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { users } from '../db/schema';
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
 * Phase 5 replaces the 'google' branch with real session/JWT verification.
 * AUTH_MODE=dev lets us build and test the backend before OAuth exists.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    if (env.AUTH_MODE === 'dev') {
      req.userId = await getDevUserId();
      return next();
    }
    throw new HttpError(401, 'Not authenticated');
  } catch (err) {
    next(err);
  }
}
