import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { generateToken, hashToken } from "../lib/crypto.js";
import { hashPassword, logoutAllSessions } from "./auth.service.js";
import { AppError } from "../middlewares/error.middleware.js";

/**
 * Recuperación de contraseña (Parte G).
 *
 * Seguridad:
 * - El token plano nunca se guarda: solo su hash sha256 (mismo patrón que las
 *   sesiones). Un dump de la BD no permite resetear contraseñas.
 * - Respuesta SIEMPRE genérica: no se revela si el correo existe.
 * - Un solo token activo por usuario (los anteriores se invalidan), expira en
 *   60 minutos y es de un solo uso (usedAt).
 * - Al resetear se revocan TODAS las sesiones del usuario.
 * - Sin proveedor de correo configurado, el link se registra en logs SOLO en
 *   desarrollo; en producción se registra el evento sin el token.
 */

const RESET_TOKEN_TTL_MINUTES = 60;

export function buildResetUrl(token: string): string {
  return `${env.FRONTEND_URL}/reset-password?token=${token}`;
}

/**
 * Genera el token de reset si el correo existe. Devuelve siempre void: el
 * controller responde genérico sin importar el resultado.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Correo inexistente o cuenta deshabilitada: mismo silencio hacia afuera.
  if (!user || user.status === "DISABLED") {
    logger.info(`[PASSWORD RESET] solicitud para correo no elegible (no se revela al cliente)`);
    return;
  }

  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    // Invalida cualquier token anterior sin usar (un solo reset activo)
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);

  const resetUrl = buildResetUrl(token);

  // Punto de integración del proveedor de correo (Resend/SMTP/SES). Mientras
  // no exista, el flujo es utilizable en desarrollo vía logs.
  if (env.NODE_ENV !== "production") {
    logger.info(`[PASSWORD RESET] link de recuperación (solo dev): ${resetUrl}`);
  } else {
    logger.warn(
      `[PASSWORD RESET] token generado para userId=${user.id} pero no hay proveedor de correo configurado: el usuario no recibirá el link`
    );
  }
}

/** Valida un token (para que el frontend muestre el formulario o el error). */
export async function validateResetToken(token: string): Promise<{ valid: boolean }> {
  if (!token || token.length < 32) return { valid: false };
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  const valid = Boolean(record && !record.usedAt && record.expiresAt > new Date());
  return { valid };
}

const STRONG_PASSWORD_MESSAGE =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número";

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/** Consume el token y fija la nueva contraseña, revocando todas las sesiones. */
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (!isStrongPassword(newPassword)) {
    throw new AppError(STRONG_PASSWORD_MESSAGE, 400);
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError("El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.", 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
  ]);

  // Cierre de todas las sesiones activas (DB + cache Redis): si alguien tenía
  // la cuenta abierta con la contraseña vieja, queda fuera.
  await logoutAllSessions(record.userId);

  logger.info(`[PASSWORD RESET] contraseña actualizada para userId=${record.userId}`);
}
