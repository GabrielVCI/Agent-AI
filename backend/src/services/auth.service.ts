import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { getRedisClient } from "../config/redis.js";
import { env } from "../config/env.js";
import { generateToken, hashToken } from "../lib/crypto.js";
import { AppError } from "../middlewares/error.middleware.js";
import type { AuthenticatedUser, SessionCachePayload } from "../types/auth.types.js";

const SESSION_PREFIX = "session:";

function sessionKey(tokenHash: string): string {
  return `${SESSION_PREFIX}${tokenHash}`;
}

function buildCachePayload(user: {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: string;
  status: string;
}): SessionCachePayload {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role as SessionCachePayload["role"],
    status: user.status as SessionCachePayload["status"],
  };
}

export async function loginUser(
  email: string,
  password: string,
  meta: { userAgent?: string; ipAddress?: string }
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.status === "DISABLED") {
    throw new AppError("Credenciales inválidas", 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Credenciales inválidas", 401);
  }

  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash: tokenHash,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  const payload = buildCachePayload(user);
  try {
    await getRedisClient().set(
      sessionKey(tokenHash),
      JSON.stringify(payload),
      "EX",
      env.SESSION_TTL_SECONDS
    );
  } catch {
    // Redis no disponible — la sesión se resolverá desde DB
  }

  const authUser: AuthenticatedUser = {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role as AuthenticatedUser["role"],
    status: user.status as AuthenticatedUser["status"],
  };

  return { token, user: authUser };
}

export async function resolveSession(token: string): Promise<AuthenticatedUser | null> {
  const tokenHash = hashToken(token);
  const redis = getRedisClient();

  // Fast path: Redis cache (opcional — si falla, cae a DB)
  try {
    const cached = await redis.get(sessionKey(tokenHash));
    if (cached) {
      const payload = JSON.parse(cached) as SessionCachePayload;
      return {
        id: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        status: payload.status,
      };
    }
  } catch {
    // Redis no disponible — continuar con DB
  }

  // DB fallback
  const session = await prisma.session.findUnique({
    where: { sessionTokenHash: tokenHash },
    include: { user: true },
  });

  // --- [DEBUG-AUTH] temporal (quitar luego: grep "[DEBUG-AUTH]") ---
  const dbg = env.NODE_ENV !== "production";

  if (!session) {
    if (dbg) console.log("[AUTH RESOLVE] sesión NO encontrada en DB para ese token");
    return null;
  }
  if (session.revokedAt) {
    if (dbg) console.log("[AUTH RESOLVE] sesión REVOCADA en", session.revokedAt.toISOString());
    return null;
  }
  if (session.expiresAt < new Date()) {
    if (dbg) console.log("[AUTH RESOLVE] sesión EXPIRADA en", session.expiresAt.toISOString());
    return null;
  }
  if (session.user.status === "DISABLED") {
    if (dbg) console.log("[AUTH RESOLVE] usuario DESHABILITADO:", session.user.email);
    return null;
  }
  if (dbg) console.log("[AUTH RESOLVE] sesión válida (DB) | user:", session.user.email, "| role:", session.user.role, "| tenantId:", session.user.tenantId);

  // Re-populate cache (opcional — si Redis no está disponible se salta)
  const payload = buildCachePayload(session.user);
  const remainingTtl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  if (remainingTtl > 0) {
    try {
      await redis.set(sessionKey(tokenHash), JSON.stringify(payload), "EX", remainingTtl);
    } catch {
      // Redis no disponible
    }
  }

  return {
    id: session.user.id,
    tenantId: session.user.tenantId,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as AuthenticatedUser["role"],
    status: session.user.status as AuthenticatedUser["status"],
  };
}

export async function logoutSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const redis = getRedisClient();

  await prisma.session.updateMany({
    where: { sessionTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  try {
    await redis.del(sessionKey(tokenHash));
  } catch {
    // Redis no disponible — sesión ya revocada en DB
  }
}

export async function logoutAllSessions(userId: string): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    select: { sessionTokenHash: true },
  });

  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    for (const s of sessions) {
      pipeline.del(sessionKey(s.sessionTokenHash));
    }
    await pipeline.exec();
  } catch {
    // Redis no disponible — sesiones ya revocadas en DB
  }
}

export async function listActiveSessions(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
