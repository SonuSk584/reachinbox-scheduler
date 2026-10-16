import type { Redis } from 'ioredis';
import { env } from '../config/env';
import { createRedisConnection } from '../queue/connection';

const HOUR_MS = 3_600_000;

/**
 * SLOT RESERVATION: the single mechanism behind both the minimum delay and the hourly limit.
 *
 * Each sender has a timeline pointer, "the earliest moment its next email may go out"
 * (rl:{sender}:next). Asking for a slot, atomically inside Redis:
 *   1. slot = max(now, pointer)               -> enforces the minimum gap between sends
 *   2. if the hourly window containing `slot` is already full, slot jumps to the start of the
 *      next window and we check again          -> enforces the hourly limit
 *   3. count the slot against that window, move the pointer to slot + gap
 *
 * Because every worker asks the same Redis script, the answer is correct across any number of
 * workers/instances, and slots are handed out strictly in the order requests arrive (FIFO), which
 * is what preserves email order when the limit overflows. Nothing is ever dropped: an email that
 * does not fit this hour simply receives a slot in a later hour.
 *
 * Keys share the hash tag {senderId} so they live on one slot if Redis Cluster is ever used.
 * Time comes from Redis (TIME), so all workers agree even if their own clocks differ.
 */
const ACQUIRE_SLOT_LUA = `
local HOUR = 3600000
local gap = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local countPrefix = ARGV[3]
local maxWindows = tonumber(ARGV[4])

local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)

local nextFree = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = math.max(now, nextFree)
local limited = 0

for i = 1, maxWindows do
  local w = math.floor(slot / HOUR)
  local countKey = countPrefix .. w
  local used = tonumber(redis.call('GET', countKey) or '0')
  if used < limit then
    used = redis.call('INCR', countKey)
    if used == 1 then
      redis.call('PEXPIRE', countKey, (w + 1) * HOUR - now + HOUR)
    end
    redis.call('SET', KEYS[1], slot + gap, 'PX', math.max(slot + gap - now, 0) + HOUR)
    return { slot, w, used, limited, now }
  end
  limited = 1
  slot = (w + 1) * HOUR
end

return { -1, 0, 0, 1, now }
`;

type SlotRedis = Redis & {
  acquireSendSlot(key: string, ...args: Array<string | number>): Promise<number[]>;
};

export const redis = createRedisConnection() as SlotRedis;
redis.defineCommand('acquireSendSlot', { numberOfKeys: 1, lua: ACQUIRE_SLOT_LUA });

export interface SlotResult {
  /** Epoch ms when the email may be sent, or null if every window inside the horizon is full. */
  slotAt: number | null;
  /** Hourly window index (epoch hour) the slot was counted against. */
  window: number;
  /** How many sends this window now holds, including this one. */
  usedInWindow: number;
  /** True if the hourly cap pushed this email later than it would otherwise have gone. */
  hitHourlyLimit: boolean;
  nowMs: number;
}

export async function acquireSendSlot(senderId: string, hourlyLimit: number): Promise<SlotResult> {
  const [slot, window, used, limited, now] = await redis.acquireSendSlot(
    `rl:{${senderId}}:next`,
    env.MIN_DELAY_BETWEEN_SENDS_MS,
    hourlyLimit,
    `rl:{${senderId}}:w:`,
    env.RATE_LIMIT_HORIZON_HOURS,
  );
  return {
    slotAt: slot === -1 ? null : slot,
    window,
    usedInWindow: used,
    hitHourlyLimit: limited === 1,
    nowMs: now,
  };
}

export const windowStartMs = (window: number) => window * HOUR_MS;
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
