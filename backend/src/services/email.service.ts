import { Resend } from "resend";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";
import { buildWelcomeVerificationEmail } from "../templates/emails/welcome-verification.email.js";
import { buildImplementationNextStepEmail } from "../templates/emails/implementation-next-step.email.js";
import { buildPasswordResetEmail } from "../templates/emails/password-reset.email.js";
import { buildImplementationPaymentReminderEmail } from "../templates/emails/implementation-payment-reminder.email.js";

/**
 * Email transaccional de Sendwary.
 *
 * Proveedor principal: **Resend** (`RESEND_APIKEY` — ese es el nombre real de
 * la variable en este proyecto, NO `RESEND_API_KEY` como en la doc de Resend).
 * SMTP queda soportado como alternativa (`EMAIL_PROVIDER=smtp`).
 *
 * Reglas:
 * - Todo envío ocurre en el backend. La API key jamás se expone al frontend
 *   ni se escribe en logs.
 * - Sin proveedor configurado en development: se loguea un preview SEGURO
 *   (destinatario, asunto y URL de acción) y el flujo llamador no se rompe.
 * - Sin proveedor en producción: el envío falla de forma controlada
 *   (EMAIL_PROVIDER_NOT_CONFIGURED) y quien llama decide si eso es fatal.
 * - Los templates viven en templates/emails/ y devuelven HTML + texto plano.
 */

export type EmailProvider = "resend" | "smtp" | "log";

/** Remitente efectivo: EMAIL_FROM y, por compat, SMTP_FROM. */
function fromAddress(): string {
  return env.EMAIL_FROM || env.SMTP_FROM || "Sendwary <no-reply@sendwary.com>";
}

/**
 * Proveedor realmente utilizable ahora mismo. Si el configurado no tiene
 * credenciales, cae a "log" (preview) en vez de fallar al arrancar.
 */
export function resolveEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === "smtp") return env.SMTP_HOST ? "smtp" : "log";
  if (env.EMAIL_PROVIDER === "log") return "log";
  // default: resend
  if (env.RESEND_APIKEY) return "resend";
  // Resend sin key pero con SMTP disponible: usar SMTP antes que perder el correo
  if (env.SMTP_HOST) return "smtp";
  return "log";
}

export function isEmailConfigured(): boolean {
  return resolveEmailProvider() !== "log";
}

// ─── Clientes (lazy: no se instancian si no hay credenciales) ────────────────

let resendClient: Resend | null | undefined;
let smtpTransporter: Transporter | null | undefined;

function getResend(): Resend | null {
  if (resendClient !== undefined) return resendClient;
  resendClient = env.RESEND_APIKEY ? new Resend(env.RESEND_APIKEY) : null;
  return resendClient;
}

function getSmtp(): Transporter | null {
  if (smtpTransporter !== undefined) return smtpTransporter;
  smtpTransporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        ...(env.SMTP_USER && env.SMTP_PASS
          ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
          : {}),
      })
    : null;
  return smtpTransporter;
}

// ─── API pública ─────────────────────────────────────────────────────────────

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** URL de acción (verificación, reset…) — SOLO para el preview de dev. */
  actionUrl?: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: EmailProvider;
  /** id del mensaje en el proveedor (trazabilidad en soporte). */
  messageId?: string | null;
  /** Motivo cuando sent=false (ya en lenguaje seguro, sin secretos). */
  reason?: string;
}

/**
 * Envía un correo. NUNCA lanza: devuelve el resultado para que quien llama
 * decida (el registro, por ejemplo, no debe romperse por un fallo de correo).
 * Usa `sendEmailOrThrow` cuando el fallo sí deba cortar el flujo.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = resolveEmailProvider();

  if (provider === "log") {
    // Preview seguro: nunca incluye la API key ni el HTML completo.
    if (env.NODE_ENV !== "production") {
      logger.info(
        `[EMAIL preview] provider=log to=${input.to} | subject="${input.subject}"${
          input.actionUrl ? ` | actionUrl=${input.actionUrl}` : ""
        }`
      );
      return { sent: false, provider, reason: "PREVIEW_DEV" };
    }
    logger.error(
      `[EMAIL] proveedor no configurado (falta RESEND_APIKEY): correo "${input.subject}" para ${input.to} NO enviado`
    );
    return { sent: false, provider, reason: "NOT_CONFIGURED" };
  }

  try {
    if (provider === "resend") {
      const client = getResend()!;
      const { data, error } = await client.emails.send({
        from: fromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      });

      if (error) {
        // El SDK devuelve el error en el payload, no como excepción.
        logger.error(
          `[EMAIL] Resend rechazó "${input.subject}" para ${input.to}: ${error.name ?? "error"} — ${error.message ?? "sin detalle"}`
        );
        return { sent: false, provider, reason: "PROVIDER_ERROR" };
      }

      logger.info(
        `[EMAIL] enviado vía Resend: "${input.subject}" → ${input.to} (id ${data?.id ?? "?"})`
      );
      return { sent: true, provider, messageId: data?.id ?? null };
    }

    // SMTP
    const smtp = getSmtp()!;
    const info = await smtp.sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    });
    logger.info(`[EMAIL] enviado vía SMTP: "${input.subject}" → ${input.to}`);
    return { sent: true, provider, messageId: info.messageId ?? null };
  } catch (err) {
    // Error seguro: nunca incluye el HTML (podría llevar el token en la URL)
    // ni la API key.
    logger.error(
      `[EMAIL] fallo enviando "${input.subject}" a ${input.to} vía ${provider}: ${safeErrorMessage(err)}`
    );
    return { sent: false, provider, reason: "SEND_FAILED" };
  }
}

/**
 * Igual que sendEmail pero lanza AppError cuando el correo no sale.
 * Para flujos donde no enviar es un fallo real (reenvío pedido por el usuario).
 * En development con proveedor "log" NO lanza: el preview cuenta como éxito.
 */
export async function sendEmailOrThrow(input: SendEmailInput): Promise<SendEmailResult> {
  const result = await sendEmail(input);
  if (result.sent || result.reason === "PREVIEW_DEV") return result;

  throw AppError.fromCode(
    result.reason === "NOT_CONFIGURED" ? "EMAIL_PROVIDER_NOT_CONFIGURED" : "EMAIL_SEND_FAILED",
    {
      internalMessage: `email "${input.subject}" no enviado (provider=${result.provider}, motivo=${result.reason})`,
    }
  );
}

/** Mensaje de error sin secretos: nunca debe filtrar la API key. */
function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const key = env.RESEND_APIKEY;
  return key ? raw.split(key).join("***") : raw;
}

// ─── Correos del producto ────────────────────────────────────────────────────

export async function sendWelcomeVerificationEmail(input: {
  to: string;
  firstName: string;
  businessName?: string | null;
  verificationUrl: string;
}): Promise<SendEmailResult> {
  const { subject, html, text } = buildWelcomeVerificationEmail({
    firstName: input.firstName,
    businessName: input.businessName ?? null,
    verificationUrl: input.verificationUrl,
  });
  return sendEmail({ to: input.to, subject, html, text, actionUrl: input.verificationUrl });
}

export async function sendImplementationNextStepEmail(input: {
  to: string;
  firstName: string;
  businessName?: string | null;
  appUrl?: string;
  planName?: string | null;
  setupFeeText?: string | null;
}): Promise<SendEmailResult> {
  const appUrl = input.appUrl ?? env.FRONTEND_URL;
  const { subject, html, text } = buildImplementationNextStepEmail({
    firstName: input.firstName,
    businessName: input.businessName ?? null,
    appUrl,
    planName: input.planName ?? null,
    setupFeeText: input.setupFeeText ?? null,
  });
  return sendEmail({ to: input.to, subject, html, text, actionUrl: appUrl });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  firstName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): Promise<SendEmailResult> {
  const { subject, html, text } = buildPasswordResetEmail({
    firstName: input.firstName,
    resetUrl: input.resetUrl,
    expiresInMinutes: input.expiresInMinutes,
  });
  return sendEmail({ to: input.to, subject, html, text, actionUrl: input.resetUrl });
}

export async function sendImplementationPaymentReminderEmail(input: {
  to: string;
  firstName: string;
  businessName?: string | null;
  setupFeeText?: string | null;
  appUrl?: string;
}): Promise<SendEmailResult> {
  const appUrl = input.appUrl ?? env.FRONTEND_URL;
  const { subject, html, text } = buildImplementationPaymentReminderEmail({
    firstName: input.firstName,
    businessName: input.businessName ?? null,
    appUrl,
    supportEmail: env.SUPPORT_EMAIL,
    setupFeeText: input.setupFeeText ?? null,
  });
  return sendEmail({ to: input.to, subject, html, text, actionUrl: appUrl });
}
