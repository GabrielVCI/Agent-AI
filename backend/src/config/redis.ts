import { Redis } from "ioredis";
import { env } from "./env.js";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 0,      // fail fast — no reintentar comandos individuales
      enableOfflineQueue: false,     // rechazar comandos inmediatamente si está offline
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        // backoff exponencial, máx 30s, para no spamear el log
        return Math.min(times * 2000, 30000);
      },
    });

    let lastErrorMsg: string | null = null;

    redisClient.on("error", (err: Error) => {
      if (err.message !== lastErrorMsg) {
        console.warn("[Redis] No disponible:", err.message);
        lastErrorMsg = err.message;
      }
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected");
      lastErrorMsg = null;
    });
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
