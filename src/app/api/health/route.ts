import { prisma } from "@/lib/db/prisma";
import { json } from "@/lib/http";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
    const pong = await redis.ping();
    await redis.quit();
    if (pong !== "PONG") throw new Error("redis");
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
