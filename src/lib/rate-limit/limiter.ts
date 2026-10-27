import Redis from "ioredis";
import { getEnv } from "@/lib/env";

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type MemoryBucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, MemoryBucket>();

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false });
  }
  return redis;
}

const LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
if current > tonumber(ARGV[2]) then
  return {0, redis.call("TTL", KEYS[1])}
end
return {1, 0}
`;

function memoryCountersEnabled(): boolean {
  return getEnv().NODE_ENV === "test" && process.env.RATE_LIMIT_MEMORY === "true";
}

export async function consumeLimit(key: string, limit: number, windowSeconds: number): Promise<LimitResult> {
  const env = getEnv();
  if (memoryCountersEnabled()) {
    return consumeMemory(key, limit, windowSeconds);
  }
  try {
    const result = (await getRedis().eval(LIMIT_SCRIPT, 1, `rl:${key}`, String(windowSeconds), String(limit))) as [
      number,
      number,
    ];
    if (result[0] === 1) return { ok: true };
    return { ok: false, retryAfterSeconds: Math.max(1, Number(result[1]) || windowSeconds) };
  } catch (error) {
    if (env.NODE_ENV === "production") {
      throw error;
    }
    return consumeMemory(key, limit, windowSeconds);
  }
}

export async function incrementCounter(key: string, windowSeconds: number): Promise<number> {
  if (memoryCountersEnabled()) {
    consumeMemory(key, Number.MAX_SAFE_INTEGER, windowSeconds);
    return memoryBuckets.get(key)?.count ?? 1;
  }
  try {
    const redisKey = `cnt:${key}`;
    const value = await getRedis().incr(redisKey);
    if (value === 1) await getRedis().expire(redisKey, windowSeconds);
    return value;
  } catch (error) {
    if (getEnv().NODE_ENV === "production") throw error;
    const bucket = consumeMemory(key, Number.MAX_SAFE_INTEGER, windowSeconds);
    void bucket;
    const current = memoryBuckets.get(key);
    return current?.count ?? 1;
  }
}

export async function readCounter(key: string): Promise<number> {
  if (memoryCountersEnabled()) return memoryBuckets.get(key)?.count ?? 0;
  try {
    const value = await getRedis().get(`cnt:${key}`);
    return value ? Number(value) : 0;
  } catch (error) {
    if (getEnv().NODE_ENV === "production") throw error;
    return memoryBuckets.get(key)?.count ?? 0;
  }
}

export async function clearCounter(key: string): Promise<void> {
  memoryBuckets.delete(key);
  if (memoryCountersEnabled()) return;
  try {
    await getRedis().del(`cnt:${key}`);
  } catch (error) {
    if (getEnv().NODE_ENV === "production") throw error;
  }
}

function consumeMemory(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

export function resetMemoryLimits(): void {
  memoryBuckets.clear();
}
