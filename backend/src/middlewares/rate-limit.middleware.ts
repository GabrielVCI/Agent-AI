import rateLimit from "express-rate-limit";
import { getRedisClient } from "../config/redis.js";
import type { Request } from "express";

function redisStore(prefix: string) {
  return {
    async increment(key: string) {
      try {
        const redis = getRedisClient();
        const fullKey = `${prefix}:${key}`;
        const current = await redis.incr(fullKey);
        if (current === 1) {
          await redis.expire(fullKey, 60);
        }
        const ttl = await redis.ttl(fullKey);
        return {
          totalHits: current,
          resetTime: new Date(Date.now() + ttl * 1000),
        };
      } catch {
        // Redis no disponible — no limitar
        return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
      }
    },
    async decrement(key: string) {
      try {
        const redis = getRedisClient();
        await redis.decr(`${prefix}:${key}`);
      } catch { /* Redis no disponible */ }
    },
    async resetKey(key: string) {
      try {
        const redis = getRedisClient();
        await redis.del(`${prefix}:${key}`);
      } catch { /* Redis no disponible */ }
    },
  };
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos. Intenta en 15 minutos." },
  store: redisStore("rl:auth") as any,
  skip: () => process.env.NODE_ENV === "test",
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Límite de solicitudes alcanzado." },
  keyGenerator: (req: Request) => req.user?.tenantId ?? "anonymous",
  store: redisStore("rl:api") as any,
  skip: () => process.env.NODE_ENV === "test",
});

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Límite de webhooks alcanzado." },
  store: redisStore("rl:webhook") as any,
  skip: () => process.env.NODE_ENV === "test",
});
