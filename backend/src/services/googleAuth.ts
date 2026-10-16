import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { users, type User } from '../db/schema';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

/** Standard OAuth 2.0 authorization-code flow against Google. */

export interface GoogleProfile {
  sub: string; // Google's permanent id for the account
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export function assertGoogleConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, 'Google login is not configured on the server');
  }
}

/** Step 1: where to send the user so Google can ask them to sign in. */
export function buildAuthUrl(state: string): string {
  const url = new URL(env.GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state, // echoed back by Google; we check it matches to make sure WE started this login
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

/** Step 2: trade the one-time code Google gave the browser for an access token (server to server). */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch(env.GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    logger.error(`Google token exchange failed: ${data.error ?? res.status} ${data.error_description ?? ''}`);
    throw new HttpError(401, 'Google rejected the sign-in');
  }
  return data.access_token;
}

/** Step 3: ask Google who the signed-in person is. */
export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(env.GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new HttpError(401, 'Could not read your Google profile');
  return (await res.json()) as GoogleProfile;
}

/** Find the user for this Google account, or create one. Returns whether it was just created. */
export async function upsertGoogleUser(profile: GoogleProfile): Promise<{ user: User; isNew: boolean }> {
  const name = profile.name?.trim() || profile.email.split('@')[0];
  const avatarUrl = profile.picture ?? null;

  const [byGoogleId] = await db.select().from(users).where(eq(users.googleId, profile.sub));
  const [byEmail] = byGoogleId ? [] : await db.select().from(users).where(eq(users.email, profile.email));
  const existing = byGoogleId ?? byEmail; // an existing account with this (verified) email is linked, not duplicated

  if (existing) {
    await db.update(users).set({ googleId: profile.sub, name, avatarUrl }).where(eq(users.id, existing.id));
    return { user: { ...existing, googleId: profile.sub, name, avatarUrl }, isNew: false };
  }

  const id = randomUUID();
  await db.insert(users).values({ id, email: profile.email, name, avatarUrl, googleId: profile.sub });
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return { user, isNew: true };
}
