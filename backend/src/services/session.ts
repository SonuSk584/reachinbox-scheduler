import { randomBytes } from 'crypto';
import IORedis from 'ioredis';
import { env } from '../config/env';

/**
 * Server-side sessions. The browser only holds a random, unguessable session id in an httpOnly
 * cookie; who it belongs to lives in Redis. That means:
 *  - logging out really ends the session (we delete the key), unlike a stateless token
 *  - the cookie reveals nothing and cannot be forged
 *  - sessions expire on their own after SESSION_TTL_DAYS
 */
const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2 });

const TTL_SECONDS = env.SESSION_TTL_DAYS * 24 * 60 * 60;
const key = (id: string) => `sess:${id}`;

export const SESSION_COOKIE = 'sid';

export const sessionCookieOptions = {
  httpOnly: true, // JavaScript on the page can never read it
  sameSite: 'lax' as const, // not sent on cross-site POSTs, which blocks CSRF
  secure: env.COOKIE_SECURE,
  maxAge: TTL_SECONDS * 1000,
  path: '/',
};

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString('base64url'); // 256 bits of randomness
  await redis.set(key(id), userId, 'EX', TTL_SECONDS);
  return id;
}

export const getSessionUserId = (id: string) => redis.get(key(id));

export async function destroySession(id: string) {
  await redis.del(key(id));
}
