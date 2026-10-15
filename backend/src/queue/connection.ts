import IORedis from 'ioredis';
import { env } from '../config/env';

// BullMQ workers require maxRetriesPerRequest = null (blocking commands).
export const createRedisConnection = () =>
  new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
