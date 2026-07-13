import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
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

/**
 * Reserva ATÓMICA de una idempotency key antes de procesar el mensaje.
 *
 * Se apoya en el unique constraint [key, scope] de IdempotencyKey: el primer
 * INSERT gana y cualquier reintento concurrente de Meta choca con P2002 y se
 * reporta como duplicado. Así evitamos la condición de carrera que tenía el
 * patrón check-luego-save (donde dos entregas casi simultáneas podían pasar
 * ambas la verificación antes de guardar).
 *
 * Nunca lanza: si la DB falla por una razón distinta a un duplicado, dejamos
 * pasar el procesamiento (reserved: true) para no perder el mensaje ni romper
 * el webhook.
 */
export async function reserveIdempotency(
  key: string,
  scope: string,
  tenantId?: string
): Promise<{ reserved: boolean }> {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000);
  const redis = getRedisClient();
  const redisKey = `${REDIS_PREFIX}${scope}:${key}`;

  // Atajo: si Redis ya tiene la clave, es un duplicado claro.
  try {
    const cached = await redis.get(redisKey);
    if (cached) return { reserved: false };
  } catch {
    // Redis caído -> seguimos con la fuente de verdad (DB).
  }

  try {
    await prisma.idempotencyKey.create({
      data: {
        key,
        scope,
        tenantId,
        statusCode: null,
        responseBody: { status: "processing" } as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  } catch (error) {
    // Violación del unique [key, scope] => otra entrega ya la reservó.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { reserved: false };
    }
    // Otro error de DB: no bloqueamos el webhook, permitimos procesar.
    return { reserved: true };
  }

  // Best-effort: marcamos en Redis para acelerar duplicados futuros.
  await redis
    .set(redisKey, JSON.stringify({ status: "processing" }), "EX", IDEMPOTENCY_TTL_SECONDS)
    .catch(() => {});

  return { reserved: true };
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
