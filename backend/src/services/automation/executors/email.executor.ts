/**
 * Executor SEND_EMAIL. Reutiliza el servicio de correo existente (Resend/SMTP)
 * y su layout de marca; no crea otro proveedor ni toca la API key.
 */
import { prisma } from "../../../config/prisma.js";
import { sendEmail } from "../../email.service.js";
import { renderBrandEmail, renderPlainText } from "../../../templates/emails/email-layout.js";
import { AutomationActionError } from "../automation-errors.js";
import { buildRenderVariables, renderTemplate } from "../automation-render.js";
import type { AutomationExecutor, ExecutorContext, ExecutorResult } from "./executor.types.js";
import type { SendEmailConfig } from "../automation.types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailExecutor: AutomationExecutor = {
  validateConfig(config): string | null {
    const { subject, template } = config as unknown as SendEmailConfig;
    if (typeof subject !== "string" || subject.trim().length < 3) {
      return "El correo necesita un asunto de al menos 3 caracteres";
    }
    if (typeof template !== "string" || template.trim().length < 5) {
      return "El correo necesita un cuerpo de al menos 5 caracteres";
    }
    if (subject.length > 150) return "El asunto no puede superar 150 caracteres";
    return null;
  },

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const config = context.actionConfig as unknown as SendEmailConfig;
    const { job, tenant } = context;

    if (tenant.status !== "ACTIVE") {
      throw AutomationActionError.nonRetryable(
        "TENANT_INACTIVE",
        "La empresa no está activa: no se envían automatizaciones"
      );
    }

    let destination = context.payload.customerEmail;
    let customerName = context.payload.customerName ?? null;

    if (job.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: job.customerId, tenantId: job.tenantId },
        select: { email: true, name: true },
      });
      if (!customer) {
        throw AutomationActionError.nonRetryable("CUSTOMER_NOT_FOUND", "El contacto ya no existe");
      }
      destination = customer.email ?? destination;
      customerName = customer.name ?? customerName;
    }

    if (typeof destination !== "string" || !EMAIL_RE.test(destination)) {
      throw AutomationActionError.nonRetryable(
        "MISSING_EMAIL",
        "El contacto no tiene un correo válido"
      );
    }

    const variables = buildRenderVariables({
      customerName: typeof customerName === "string" ? customerName : null,
      businessName: tenant.name,
      timezone: tenant.timezone,
      eventPayload: context.payload.eventPayload,
    });

    const subject = renderTemplate(config.subject, variables).trim();
    const body = renderTemplate(config.template, variables).trim();
    if (!subject || !body) {
      throw AutomationActionError.nonRetryable(
        "EMPTY_MESSAGE",
        "La plantilla generó un correo vacío"
      );
    }

    const paragraphs = body.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br />"));
    const greeting = variables.nombre ? `Hola ${variables.nombre},` : "Hola,";

    const result = await sendEmail({
      to: destination,
      subject,
      html: renderBrandEmail({
        previewText: subject,
        title: subject,
        greeting,
        paragraphs,
      }),
      text: renderPlainText({ title: subject, greeting, paragraphs }),
    });

    if (!result.sent) {
      // PREVIEW_DEV: sin proveedor en desarrollo el correo se "previsualiza".
      if (result.reason === "PREVIEW_DEV") {
        return { summary: "Correo en modo preview (proveedor no configurado en desarrollo)" };
      }
      if (result.reason === "NOT_CONFIGURED") {
        throw AutomationActionError.nonRetryable(
          "EMAIL_PROVIDER_NOT_CONFIGURED",
          "El proveedor de correo no está configurado"
        );
      }
      // PROVIDER_ERROR / SEND_FAILED: puede ser transitorio → reintentar.
      throw AutomationActionError.retryable(
        "EMAIL_SEND_FAILED",
        "El proveedor de correo no aceptó el envío"
      );
    }

    return { summary: `Correo enviado a ${destination.replace(/^(.).*(@.*)$/, "$1***$2")}` };
  },
};
