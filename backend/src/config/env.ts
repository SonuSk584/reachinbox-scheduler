import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  AUTH_MODE: z.enum(['dev', 'google']).default('dev'),

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

export const env = parsed.data;
