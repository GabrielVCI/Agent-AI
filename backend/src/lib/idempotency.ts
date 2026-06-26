import { createHash } from "crypto";
import { prisma } from "../config/prisma.js";
import { getRedisClient } from "../config/redis.js";

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24h
const REDIS_PREFIX = "idempotency:";

export function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function checkIdempotency(
  key: string,
  scope: string,
  tenantId?: string
): Promise<{ exists: boolean; statusCode?: number; responseBody?: unknown }> {
  const redis = getRedisClient();
  const redisKey = `${REDIS_PREFIX}${scope}:${key}`;

  // Redis es solo una caché: si está caído, degradamos a la verificación en DB
  // en lugar de romper el flujo (importante para el webhook de WhatsApp).
  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      const data = JSON.parse(cached);
      return { exists: true, statusCode: data.statusCode, responseBody: data.responseBody };
    }
  } catch {
    // Redis no disponible -> continuamos con la fuente de verdad (DB).
  }

  const record = await prisma.idempotencyKey.findUnique({
    where: { key_scope: { key, scope } },
  });

  if (record && record.expiresAt > new Date()) {
    // Re-populate cache (best-effort; ignoramos si Redis está caído).
    await redis
      .set(
        redisKey,
        JSON.stringify({ statusCode: record.statusCode, responseBody: record.responseBody }),
        "EX",
        IDEMPOTENCY_TTL_SECONDS
      )
      .catch(() => {});
    return {
      exists: true,
      statusCode: record.statusCode ?? undefined,
      responseBody: record.responseBody,
    };
  }

  return { exists: false };
}

export async function saveIdempotency(
  key: string,
  scope: string,
  statusCode: number,
  responseBody: unknown,
  tenantId?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000);
  const redis = getRedisClient();
  const redisKey = `${REDIS_PREFIX}${scope}:${key}`;

  await Promise.all([
    prisma.idempotencyKey
      .upsert({
        where: { key_scope: { key, scope } },
        update: { statusCode, responseBody: responseBody as any, expiresAt },
        create: {
          key,
          scope,
          tenantId,
          statusCode,
          responseBody: responseBody as any,
          expiresAt,
        },
      })
      .catch(() => {}),
    redis
      .set(redisKey, JSON.stringify({ statusCode, responseBody }), "EX", IDEMPOTENCY_TTL_SECONDS)
      .catch(() => {}),
  ]);
}
