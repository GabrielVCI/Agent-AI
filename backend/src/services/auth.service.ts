import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { getRedisClient } from "../config/redis.js";
import { env } from "../config/env.js";
import { generateToken, hashToken } from "../lib/crypto.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";
import { issueVerificationEmail } from "./email-verification.service.js";
import type { AuthenticatedUser, SessionCachePayload } from "../types/auth.types.js";
import { normalizeEmail } from "../utils/email.js";
import { findUserByEmail } from "./user-lookup.service.js";

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

type SessionUser = {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: string;
  status: string;
};

/** Crea la sesión en DB, actualiza lastLoginAt y cachea en Redis. */
async function createSessionForUser(
  user: SessionUser,
  meta: { userAgent?: string; ipAddress?: string }
): Promise<{ token: string; user: AuthenticatedUser }> {
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

export async function loginUser(
  email: string,
  password: string,
  meta: { userAgent?: string; ipAddress?: string }
): Promise<{ token: string; user: AuthenticatedUser }> {
  const user = await findUserByEmail(email);

  // Mensaje idéntico para "no existe", "deshabilitado" y "password mal":
  // no revelamos cuál fue (enumeración de usuarios).
  if (!user || user.status === "DISABLED") {
    throw new AppError("Usuario o clave incorrecta.", 401, {
      code: "INVALID_CREDENTIALS",
      internalMessage: !user ? "login: email no registrado" : "login: usuario DISABLED",
    });
  }

  if (!user.passwordHash) {
    throw new AppError(
      "Esta cuenta se creó con Google. Usa el botón «Continuar con Google».",
      401
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Usuario o clave incorrecta.", 401, {
      code: "INVALID_CREDENTIALS",
      internalMessage: "login: password incorrecto",
    });
  }

  return createSessionForUser(user, meta);
}

export async function registerUser(
  input: { name: string; lastName: string; email: string; password: string },
  meta: { userAgent?: string; ipAddress?: string }
): Promise<{ token: string; user: AuthenticatedUser; verificationEmailSent: boolean }> {
  const email = normalizeEmail(input.email);

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError("Ya existe una cuenta con ese correo", 409);
  }

  const passwordHash = await hashPassword(input.password);

  // Sin tenant al registrarse: el onboarding crea la empresa y lo asocia como OWNER.
  // emailVerifiedAt queda null: el flujo comercial exige verificar el correo.
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      lastName: input.lastName.trim(),
      email,
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
      authProvider: "LOCAL",
    },
  });

  // Correo de bienvenida + verificación. NUNCA rompe el registro: la cuenta ya
  // existe y el usuario puede pedir el reenvío desde la pantalla de verificación
  // (hacer rollback de un registro válido por un fallo de correo sería peor).
  let verificationEmailSent = false;
  try {
    const result = await issueVerificationEmail(user);
    verificationEmailSent = result.sent;
  } catch (err) {
    logger.error(`[REGISTER] no se pudo emitir el correo de verificación: ${String(err)}`);
  }

  const session = await createSessionForUser(user, meta);
  return { ...session, verificationEmailSent };
}

/** Login/creación de cuenta a partir de un perfil de Google verificado (server-side). */
export async function loginWithGoogleProfile(
  profile: {
    googleId: string;
    email: string;
    emailVerified: boolean;
    firstName: string;
    lastName: string | null;
  },
  meta: { userAgent?: string; ipAddress?: string }
): Promise<{ token: string; user: AuthenticatedUser }> {
  if (!profile.emailVerified) {
    throw new AppError("Tu cuenta de Google no tiene el correo verificado", 401);
  }

  let user = await prisma.user.findUnique({ where: { googleId: profile.googleId } });

  if (!user) {
    // Vincular por email si ya existe una cuenta local con ese correo.
    // Google ya verificó el correo (email_verified true, validado arriba):
    // se marca emailVerifiedAt sin exigir el flujo de verificación propio.
    const byEmail = await findUserByEmail(profile.email);
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: profile.firstName,
          lastName: profile.lastName,
          email: normalizeEmail(profile.email),
          googleId: profile.googleId,
          passwordHash: null,
          role: "OWNER",
          status: "ACTIVE",
          authProvider: "GOOGLE",
          emailVerifiedAt: new Date(),
        },
      });
    }
  } else if (!user.emailVerifiedAt) {
    // Cuenta Google existente sin marca (creada antes de la feature)
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  if (user.status === "DISABLED") {
    throw new AppError("Tu cuenta está deshabilitada. Contacta al administrador.", 403);
  }

  return createSessionForUser(user, meta);
}

/**
 * Invalida la copia en Redis de la sesión (p. ej. cuando cambia el tenantId
 * tras el onboarding); la próxima petición se resuelve desde DB.
 */
export async function invalidateSessionCache(token: string): Promise<void> {
  try {
    await getRedisClient().del(sessionKey(hashToken(token)));
  } catch {
    // Redis no disponible — resolveSession ya usa DB como fallback
  }
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
  const dbg = env.NODE_ENV === "development";

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
