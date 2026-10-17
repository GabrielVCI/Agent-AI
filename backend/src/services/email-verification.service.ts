import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { generateToken, hashToken } from "../lib/crypto.js";
import { AppError } from "../middlewares/error.middleware.js";
import { findUserByEmail } from "./user-lookup.service.js";
import {
  sendWelcomeVerificationEmail,
  sendImplementationNextStepEmail,
} from "./email.service.js";

/**
 * Verificación de correo (flujo comercial premium).
 *
 * Seguridad (mismo patrón que PasswordResetToken):
 * - Solo se guarda el hash sha256 del token; el token plano viaja únicamente
 *   en el link del correo.
 * - Expira en 48h y es de un solo uso (usedAt). Al emitir uno nuevo se
 *   invalidan los anteriores (un solo token activo por usuario).
 * - Respuestas genéricas en el reenvío público: no se revela si el correo existe.
 */

const VERIFICATION_TOKEN_TTL_HOURS = 48;
/** Anti-spam de reenvío además del rate limit HTTP: 1 correo por minuto. */
const RESEND_MIN_INTERVAL_MS = 60 * 1000;

export function buildVerificationUrl(token: string): string {
  return `${env.FRONTEND_URL}/verify-email?token=${token}`;
}

/**
 * Emite un token nuevo (invalidando los anteriores) y envía el correo de
 * bienvenida/verificación. No lanza si el correo no sale: el registro nunca
 * se rompe por falta de SMTP.
 */
export async function issueVerificationEmail(user: {
  id: string;
  tenantId?: string | null;
  name: string;
  email: string;
}): Promise<{ sent: boolean }> {
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3600 * 1000);

  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: { userId: user.id, tenantId: user.tenantId ?? null, tokenHash, expiresAt },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationSentAt: new Date() },
    }),
  ]);

  // Nombre del negocio (si ya completó el onboarding) para personalizar el correo
  const tenant = user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true },
      })
    : null;

  const result = await sendWelcomeVerificationEmail({
    to: user.email,
    firstName: user.name,
    businessName: tenant?.name ?? null,
    verificationUrl: buildVerificationUrl(token),
  });

  return { sent: result.sent };
}

/**
 * Reenvío. Acepta email (flujo público) o userId (usuario autenticado).
 * SIEMPRE resuelve sin revelar si el correo existe o ya está verificado.
 */
export async function resendVerificationEmail(input: {
  email?: string;
  userId?: string;
}): Promise<void> {
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : input.email
      ? await findUserByEmail(input.email)
      : null;

  if (!user || user.status === "DISABLED" || user.emailVerifiedAt) {
    logger.info(
      "[EMAIL VERIFY] reenvío para cuenta no elegible (no se revela al cliente)"
    );
    return;
  }

  if (
    user.emailVerificationSentAt &&
    Date.now() - user.emailVerificationSentAt.getTime() < RESEND_MIN_INTERVAL_MS
  ) {
    logger.info(`[EMAIL VERIFY] reenvío ignorado por intervalo mínimo userId=${user.id}`);
    return;
  }

  await issueVerificationEmail(user);
}

/**
 * Consume el token: marca User.emailVerifiedAt, sincroniza el tenant
 * (emailVerifiedAt + transición EMAIL_PENDING → IMPLEMENTATION_PENDING) y
 * envía el correo de siguiente paso (implementación).
 */
export async function verifyEmailWithToken(token: string): Promise<{ alreadyVerified: boolean }> {
  if (!token || token.length < 32) {
    throw new AppError("El enlace de verificación no es válido o ya expiró.", 400);
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { tenant: true } } },
  });

  if (!record || record.expiresAt <= new Date()) {
    throw new AppError("El enlace de verificación no es válido o ya expiró.", 400);
  }
  if (record.usedAt) {
    // Token ya consumido: si el usuario quedó verificado, es un doble clic
    // inofensivo; cualquier otro caso se trata como inválido.
    if (record.user.emailVerifiedAt) return { alreadyVerified: true };
    throw new AppError("El enlace de verificación no es válido o ya expiró.", 400);
  }

  const user = record.user;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    });

    if (!user.emailVerifiedAt) {
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
    }

    // Tenant ya creado (verificó después del onboarding): sincronizar estado
    // comercial. Solo transiciona estados previos a la implementación; jamás
    // pisa un tenant ya ACTIVE/SUSPENDED/etc.
    if (user.tenant) {
      const lifecycle = user.tenant.lifecycleStatus;
      await tx.tenant.update({
        where: { id: user.tenant.id },
        data: {
          emailVerifiedAt: user.tenant.emailVerifiedAt ?? now,
          ...(lifecycle === "REGISTERED" || lifecycle === "EMAIL_PENDING"
            ? { lifecycleStatus: "IMPLEMENTATION_PENDING" }
            : {}),
        },
      });
    }
  });

  logger.info(`[EMAIL VERIFY] correo verificado userId=${user.id}`);

  // Correo 2 (siguiente paso) — fuera de la transacción; nunca rompe el flujo
  await sendImplementationNextStepEmail({
    to: user.email,
    firstName: user.name,
    businessName: user.tenant?.name ?? null,
  });

  return { alreadyVerified: false };
}
