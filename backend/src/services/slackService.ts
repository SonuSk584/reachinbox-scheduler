import { randomBytes, randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db/client';
import { slackConnections, type SlackConnection } from '../db/schema';
import { HttpError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { redis } from './rateLimiter';

/**
 * Slack integration. A user connects their workspace with OAuth and picks a channel on Slack's
 * consent screen; Slack hands back an "incoming webhook" URL for that channel, which we store per
 * user and post alerts to. Nothing is hardcoded and nothing needs a redeploy: the connection is
 * looked up in MySQL each time an alert is raised.
 */

export const isSlackConfigured = () =>
  Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `slack_state:${state}`;

/**
 * Step 1: the URL that sends the user to Slack. The callback comes back through a public HTTPS
 * address (ngrok) on a different host, so the browser's session cookie will NOT be there. Instead
 * `state` is a random value we remember in Redis, mapped to the user who started the flow.
 */
export async function createAuthUrl(userId: string): Promise<string> {
  const state = randomBytes(24).toString('base64url');
  await redis.set(stateKey(state), userId, 'EX', STATE_TTL_SECONDS);
  const url = new URL(env.SLACK_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID!,
    scope: 'incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI!,
    state,
  }).toString();
  return url.toString();
}

/** Returns the user who started this flow and deletes the state, so a callback can only be used once. */
export async function consumeState(state: string): Promise<string | null> {
  return redis.getdel(stateKey(state));
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: { url: string; channel?: string; channel_id?: string };
}

/** Step 2: trade the one-time code for the webhook (server to server, using the client secret). */
export async function exchangeCode(code: string): Promise<SlackOAuthResponse> {
  const res = await fetch(env.SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      client_secret: env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI!,
    }),
  });
  const data = (await res.json().catch(() => ({ ok: false }))) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook?.url) {
    logger.error(`Slack OAuth failed: ${data.error ?? res.status}`);
    throw new HttpError(401, 'Slack rejected the connection');
  }
  return data;
}

/** One connection per user: connecting again (e.g. to pick another channel) replaces the old one. */
export async function saveConnection(userId: string, data: SlackOAuthResponse) {
  const hook = data.incoming_webhook!;
  const values = {
    teamId: data.team?.id ?? null,
    teamName: data.team?.name ?? null,
    channelId: hook.channel_id ?? null,
    channel: hook.channel ?? null,
    webhookUrl: hook.url,
  };
  await db
    .insert(slackConnections)
    .values({ id: randomUUID(), userId, ...values })
    .onDuplicateKeyUpdate({ set: values });
}

export async function getConnection(userId: string): Promise<SlackConnection | undefined> {
  const [row] = await db.select().from(slackConnections).where(eq(slackConnections.userId, userId));
  return row;
}

export async function disconnect(userId: string) {
  await db.delete(slackConnections).where(eq(slackConnections.userId, userId));
}

/**
 * Post a message to the user's channel. Never throws: returns false on any failure so callers
 * (the email worker) cannot be broken by Slack. If Slack says the webhook no longer exists
 * (the app was removed from the workspace), the stale connection is dropped.
 */
export async function sendSlackMessage(connection: SlackConnection, text: string): Promise<boolean> {
  try {
    const res = await fetch(connection.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return true;

    if (res.status === 404 || res.status === 410) {
      logger.warn(`Slack webhook for user ${connection.userId} no longer exists (HTTP ${res.status}); disconnecting`);
      await disconnect(connection.userId);
    } else {
      logger.warn(`Slack rejected the message: HTTP ${res.status}`);
    }
    return false;
  } catch (err) {
    logger.warn(`Could not reach Slack: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
