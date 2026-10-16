import { randomBytes, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/errorHandler';
import { assertGoogleConfigured, buildAuthUrl, exchangeCodeForToken, fetchProfile, upsertGoogleUser } from '../services/googleAuth';
import { ensureDefaultSender } from '../services/senderService';
import { createSession, destroySession, SESSION_COOKIE, sessionCookieOptions } from '../services/session';
import { readCookie } from '../utils/cookies';
import { logger } from '../utils/logger';

const router = Router();
const STATE_COOKIE = 'oauth_state';

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 1) The "Login with Google" button lands here. Remember a random `state`, then send the user to Google.
router.get('/google', (_req, res, next) => {
  try {
    assertGoogleConfigured();
    const state = randomBytes(24).toString('base64url');
    res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, maxAge: 10 * 60 * 1000, path: '/' });
    res.redirect(buildAuthUrl(state));
  } catch (err) {
    next(err);
  }
});

// 2) Google sends the user back here with a one-time `code`. Failures go to the login page with a message.
router.get('/google/callback', async (req, res) => {
  const fail = (message: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`);
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const expectedState = readCookie(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { path: '/' }); // single use

    if (error) return fail(error === 'access_denied' ? 'Google sign-in was cancelled' : 'Google sign-in failed');
    // The state must match the one we stored: proves this login was started by our own site (blocks forged callbacks).
    if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
      return fail('Your sign-in session expired. Please try again');
    }

    const profile = await fetchProfile(await exchangeCodeForToken(code));
    if (!profile.email || profile.email_verified !== true) return fail('Your Google email address is not verified');

    const { user, isNew } = await upsertGoogleUser(profile);
    if (isNew) ensureDefaultSender(user.id);

    res.cookie(SESSION_COOKIE, await createSession(user.id), sessionCookieOptions);
    res.redirect(`${env.FRONTEND_URL}/scheduled`);
  } catch (err) {
    logger.error('Google login failed', err instanceof Error ? err.message : err);
    fail('Google sign-in failed. Please try again');
  }
});

// Who am I? The frontend calls this on load to choose between the login page and the dashboard.
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, req.userId));
    if (!user) throw new HttpError(401, 'Not authenticated');
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Logout deletes the session on the server, so a copied cookie stops working too.
router.post('/logout', async (req, res) => {
  const sessionId = readCookie(req, SESSION_COOKIE);
  if (sessionId) await destroySession(sessionId).catch((err) => logger.warn('Could not delete session', err.message));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

export default router;
