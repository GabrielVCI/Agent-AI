import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { getRedisClient } from "../config/redis.js";
import { logger } from "../config/logger.js";

/**
 * Rate limiting de Sendwary.
 *
 * - Store: Redis si REDIS_URL responde (multi-instancia/producción); si Redis
 *   cae, degrada a "no limitar" en esa petición (fail-open) para no tumbar el
 *   servicio por una dependencia auxiliar. En dev sin Redis se comporta igual.
 * - Clave: userId+tenantId cuando la petición está autenticada; IP en caso
 *   contrario (con `trust proxy` activo la IP real llega desde Railway/proxy).
 * - OPTIONS (CORS preflight) y NODE_ENV=test nunca se limitan.
 * - Todo configurable por env (RATE_LIMIT_*); RATE_LIMIT_ENABLED=false apaga
 *   todos los limiters (p. ej. para pruebas de carga controladas).
 */

const WINDOW_15_MIN = env.RATE_LIMIT_GLOBAL_WINDOW_MS;
const WINDOW_1_HOUR = 60 * 60 * 1000;
const WINDOW_5_MIN = 5 * 60 * 1000;

/**
 * Store híbrido: Redis (compartido entre instancias, producción) con fallback
 * a memoria local cuando Redis no está disponible (dev sin Redis, o blip en
 * producción — se degrada a límite por instancia, nunca a "sin límite").
 */
function hybridStore(prefix: string, windowMs: number) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const memory = new Map<string, { count: number; resetAt: number }>();

  const memoryIncrement = (key: string) => {
    const now = Date.now();
    const entry = memory.get(key);
    if (!entry || entry.resetAt <= now) {
      memory.set(key, { count: 1, resetAt: now + windowMs });
      // Limpieza oportunista para que el Map no crezca sin control
      if (memory.size > 10_000) {
        for (const [k, v] of memory) {
          if (v.resetAt <= now) memory.delete(k);
        }
      }
      return { totalHits: 1, resetTime: new Date(now + windowMs) };
    }
    entry.count += 1;
    return { totalHits: entry.count, resetTime: new Date(entry.resetAt) };
  };

  return {
    async increment(key: string) {
      try {
        const redis = getRedisClient();
        const fullKey = `${prefix}:${key}`;
        const current = await redis.incr(fullKey);
        if (current === 1) {
          await redis.expire(fullKey, windowSeconds);
        }
        const ttl = await redis.ttl(fullKey);
        return {
          totalHits: current,
          resetTime: new Date(Date.now() + Math.max(ttl, 0) * 1000),
        };
      } catch {
        return memoryIncrement(key);
      }
    },
    async decrement(key: string) {
      try {
        await getRedisClient().decr(`${prefix}:${key}`);
      } catch {
        const entry = memory.get(key);
        if (entry && entry.count > 0) entry.count -= 1;
      }
    },
    async resetKey(key: string) {
      try {
        await getRedisClient().del(`${prefix}:${key}`);
      } catch {
        memory.delete(key);
      }
    },
  };
}

/** userId+tenantId si hay sesión; IP real como fallback. */
function keyByUserOrIp(req: Request): string {
  if (req.user) {
    return `u:${req.user.id}:${req.user.tenantId ?? "-"}`;
  }
  return `ip:${req.ip ?? "unknown"}`;
}

function keyByIp(req: Request): string {
  return `ip:${req.ip ?? "unknown"}`;
}

/** Respuesta 429 estándar (sin detalles internos) + log de auditoría. */
function onLimitReached(name: string) {
  return (req: Request, res: Response) => {
    // Nunca loguear cookies ni tokens: solo ruta, actor e IP
    logger.warn(
      `[RATE LIMIT] exceeded limiter=${name} route=${req.method} ${req.originalUrl} user=${req.user?.id ?? "-"} tenant=${req.user?.tenantId ?? "-"} ip=${req.ip}`
    );
    res.status(429).json({
      success: false,
      error: "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
      message: "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
      code: "RATE_LIMIT_EXCEEDED",
    });
  };
}

function makeLimiter(options: {
  name: string;
  windowMs: number;
  max: number;
  keyBy?: "user" | "ip";
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyBy === "ip" ? keyByIp : keyByUserOrIp,
    handler: onLimitReached(options.name),
    store: hybridStore(`rl:${options.name}`, options.windowMs) as never,
    skip: (req) =>
      !env.RATE_LIMIT_ENABLED ||
      env.NODE_ENV === "test" ||
      req.method === "OPTIONS",
  });
}

// ─── Limiters por grupo ──────────────────────────────────────────────────────

/** Paraguas de todo /api: 300 req / 15 min por usuario+tenant (o IP anónima). */
export const globalRateLimit = makeLimiter({
  name: "global",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_GLOBAL_MAX,
});

/** Login: estricto por IP (protege contra fuerza bruta de credenciales). */
export const authRateLimit = makeLimiter({
  name: "auth",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_AUTH_MAX,
  keyBy: "ip",
});

/** Registro de cuentas: aún más estricto (5/hora por IP). */
export const registerRateLimit = makeLimiter({
  name: "register",
  windowMs: WINDOW_1_HOUR,
  max: env.RATE_LIMIT_REGISTER_MAX,
  keyBy: "ip",
});

/** Flujo OAuth (redirects de Google): moderado para no romper reintentos. */
export const oauthRateLimit = makeLimiter({
  name: "oauth",
  windowMs: WINDOW_15_MIN,
  max: 30,
  keyBy: "ip",
});

/** Endpoints que disparan OpenAI (prueba de agente): por usuario/tenant. */
export const aiRateLimit = makeLimiter({
  name: "ai",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_AI_MAX,
});

/** Panel SUPER_ADMIN. */
export const adminRateLimit = makeLimiter({
  name: "admin",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_ADMIN_MAX,
});

/** Acciones admin sensibles (crear cliente, cambiar plan/suscripción). */
export const adminSensitiveRateLimit = makeLimiter({
  name: "admin-sensitive",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_ADMIN_SENSITIVE_MAX,
});

/**
 * Webhooks externos (Meta/ElevenLabs/LemonSqueezy): límite alto y separado
 * (1000 / 5 min por IP) para no bloquear tráfico legítimo del proveedor; la
 * autenticidad la garantiza la firma/verify-token de cada webhook.
 */
export const webhookRateLimit = makeLimiter({
  name: "webhook",
  windowMs: WINDOW_5_MIN,
  max: env.RATE_LIMIT_WEBHOOK_MAX,
  keyBy: "ip",
});

/** Checkout de pago. */
export const billingRateLimit = makeLimiter({
  name: "billing",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_BILLING_MAX,
});

/** Creación/edición de documentos de conocimiento (payloads grandes). */
export const uploadRateLimit = makeLimiter({
  name: "upload",
  windowMs: WINDOW_15_MIN,
  max: env.RATE_LIMIT_UPLOAD_MAX,
});