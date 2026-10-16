import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  AUTH_MODE: z.enum(['dev', 'google']).default('dev'),

  // --- Google OAuth (required when AUTH_MODE=google) ---
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Must exactly match an "Authorized redirect URI" in the Google Cloud console.
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:5173/api/auth/google/callback'),
  // Google's endpoints. Only overridden in tests, to point at a stand-in server.
  GOOGLE_AUTH_URL: z.string().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_TOKEN_URL: z.string().default('https://oauth2.googleapis.com/token'),
  GOOGLE_USERINFO_URL: z.string().default('https://openidconnect.googleapis.com/v1/userinfo'),

  // --- Slack OAuth (optional: without these, "Connect Slack" reports that Slack is not configured) ---
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  // Slack requires HTTPS, so in development this is your ngrok address + /api/slack/callback.
  SLACK_REDIRECT_URI: z.string().optional(),
  // Slack's endpoints. Only overridden in tests, to point at a stand-in server.
  SLACK_AUTH_URL: z.string().default('https://slack.com/oauth/v2/authorize'),
  SLACK_TOKEN_URL: z.string().default('https://slack.com/api/oauth.v2.access'),

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // Set true when served over HTTPS so the session cookie is never sent over plain HTTP.
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  STALE_SENDING_MINUTES: z.coerce.number().int().positive().default(5),
  // A job whose send slot is further away than this is parked as a delayed job instead of
  // sleeping inside the worker (sleeping too long would let BullMQ's job lock expire).
  INLINE_WAIT_MAX_MS: z.coerce.number().int().nonnegative().default(10_000),
  // How many hourly windows ahead we are willing to book before parking a job for an hour.
  RATE_LIMIT_HORIZON_HOURS: z.coerce.number().int().positive().default(336),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.AUTH_MODE === 'google' && (!parsed.data.GOOGLE_CLIENT_ID || !parsed.data.GOOGLE_CLIENT_SECRET)) {
  console.error('AUTH_MODE=google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env (or set AUTH_MODE=dev).');
  process.exit(1);
}

export const env = parsed.data;
