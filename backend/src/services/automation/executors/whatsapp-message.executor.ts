/**
 * Executor SEND_WHATSAPP_MESSAGE.
 *
 * REUTILIZA la integración oficial existente (WhatsApp Business Platform /
 * Cloud API): no crea ningún camino paralelo, no usa WhatsApp Web ni bots no
 * oficiales.
 *
 * Reglas de seguridad multi-tenant (críticas):
 *  - el phoneNumberId usado debe pertenecer a una WhatsAppIntegration DEL
 *    MISMO tenant del job; si pertenece a otro, el job falla como
 *    NON_RETRYABLE y no se envía nada;
 *  - el token se resuelve con el servicio oficial (descifrado por tenant) y
 *    jamás se persiste ni se loguea;
 *  - el fallback global solo se acepta cuando ALLOW_GLOBAL_META_TOKEN_FALLBACK
 *    está encendido (dev/demo), igual que en el webhook.
 */
import { prisma } from "../../../config/prisma.js";
import { logger } from "../../../config/logger.js";
import { sendWhatsappTextMessage } from "../../meta-whatsapp.service.js";
import { resolveSendCredentials } from "../../whatsapp-integration.service.js";
import {
  findOrCreateActiveConversation,
  saveOutboundAgentMessage,
  updateConversationLastMessage,
} from "../../conversation.service.js";
import { bumpUsage, checkAiAllowance } from "../../billing.service.js";
import { AutomationActionError } from "../automation-errors.js";
import { buildRenderVariables, renderTemplate } from "../automation-render.js";
import type { AutomationExecutor, ExecutorContext, ExecutorResult } from "./executor.types.js";
import type { SendWhatsAppMessageConfig } from "../automation.types.js";

/**
 * Resuelve credenciales VERIFICANDO que el número sea del tenant.
 * `resolveSendCredentials` por sí solo resuelve por phoneNumberId sin conocer
 * el tenant: aquí se antepone la comprobación de pertenencia.
 */
async function resolveTenantCredentials(tenantId: string, phoneNumberId: string) {
  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { phoneNumberId },
    select: { tenantId: true, status: true },
  });

  if (integration && integration.tenantId !== tenantId) {
    // Nunca debería pasar (el agente es del tenant); si pasa, es un bug grave.
    logger.error(
      `automation.executor.whatsapp.cross_tenant tenantId=${tenantId} phoneNumberId=${phoneNumberId} owner=${integration.tenantId}`
    );
    throw AutomationActionError.nonRetryable(
      "CROSS_TENANT_INTEGRATION",
      "El número de WhatsApp no pertenece a esta empresa"
    );
  }

  const credentials = await resolveSendCredentials(phoneNumberId);
  if (!credentials) {
    throw AutomationActionError.nonRetryable(
      "WHATSAPP_NOT_CONNECTED",
      "La integración de WhatsApp no está conectada para este número"
    );
  }
  return credentials;
}

export const whatsappMessageExecutor: AutomationExecutor = {
  validateConfig(config): string | null {
    const template = (config as unknown as SendWhatsAppMessageConfig).template;
    if (typeof template !== "string" || template.trim().length < 5) {
      return "El mensaje de WhatsApp necesita una plantilla de al menos 5 caracteres";
    }
    if (template.length > 1000) return "El mensaje no puede superar 1000 caracteres";
    return null;
  },

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const config = context.actionConfig as unknown as SendWhatsAppMessageConfig;
    const { job, tenant } = context;

    if (tenant.status !== "ACTIVE") {
      throw AutomationActionError.nonRetryable(
        "TENANT_INACTIVE",
        "La empresa no está activa: no se envían automatizaciones"
      );
    }

    if (!job.customerId) {
      throw AutomationActionError.nonRetryable(
        "MISSING_CUSTOMER",
        "El job no tiene contacto asociado"
      );
    }

    const customer = await prisma.customer.findFirst({
      where: { id: job.customerId, tenantId: job.tenantId },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) {
      throw AutomationActionError.nonRetryable(
        "CUSTOMER_NOT_FOUND",
        "El contacto ya no existe"
      );
    }

    // Agente emisor: el del evento si sigue siendo del tenant, si no el primer
    // agente activo con número de WhatsApp conectado.
    const preferredAgentId = context.payload.agentId;
    const agent =
      (typeof preferredAgentId === "string"
        ? await prisma.agent.findFirst({
            where: {
              id: preferredAgentId,
              tenantId: job.tenantId,
              status: "ACTIVE",
              whatsappPhoneNumberId: { not: null },
            },
          })
        : null) ??
      (await prisma.agent.findFirst({
        where: {
          tenantId: job.tenantId,
          status: "ACTIVE",
          whatsappPhoneNumberId: { not: null },
        },
        orderBy: { createdAt: "asc" },
      }));

    if (!agent?.whatsappPhoneNumberId) {
      throw AutomationActionError.nonRetryable(
        "NO_WHATSAPP_AGENT",
        "La empresa no tiene un agente con número de WhatsApp conectado"
      );
    }

    // Conversación: se reutiliza la activa del contacto (o se crea) para que
    // el mensaje quede en el inbox como cualquier otro.
    const { conversation } = await findOrCreateActiveConversation({
      tenantId: job.tenantId,
      customerId: customer.id,
      agentId: agent.id,
      whatsappPhone: customer.phone,
      customerName: customer.name ?? undefined,
    });

    // Modo humano: el operador está atendiendo. Por defecto NO interrumpimos.
    if (config.skipWhenHumanActive !== false && conversation.status === "HUMAN_ACTIVE") {
      return {
        summary: "Omitido: la conversación está siendo atendida por una persona",
        skipped: true,
      };
    }
    if (conversation.status === "CLOSED") {
      return { summary: "Omitido: la conversación está cerrada", skipped: true };
    }

    // Consumo del plan: una automatización cuenta como mensaje del mes.
    const allowance = await checkAiAllowance(job.tenantId);
    if (!allowance.allowed) {
      throw AutomationActionError.nonRetryable(
        `BILLING_${allowance.reason}`,
        `No se envía la automatización: ${allowance.detail}`
      );
    }

    const text = renderTemplate(
      config.template,
      buildRenderVariables({
        customerName: customer.name,
        businessName: tenant.name,
        timezone: tenant.timezone,
        eventPayload: context.payload.eventPayload,
      })
    ).trim();

    if (!text) {
      throw AutomationActionError.nonRetryable(
        "EMPTY_MESSAGE",
        "La plantilla generó un mensaje vacío"
      );
    }

    const credentials = await resolveTenantCredentials(job.tenantId, agent.whatsappPhoneNumberId);

    // Llamada externa FUERA de cualquier transacción (patrón del módulo).
    await sendWhatsappTextMessage({
      to: customer.phone,
      text,
      phoneNumberId: agent.whatsappPhoneNumberId,
      credentials,
    });

    await saveOutboundAgentMessage({
      tenantId: job.tenantId,
      conversationId: conversation.id,
      textContent: text,
      metadata: {
        source: "automation",
        automationJobId: job.id,
        automationRuleId: job.automationRuleId,
        eventType: job.eventType,
      },
    });
    await updateConversationLastMessage({
      conversationId: conversation.id,
      preview: text.slice(0, 120),
    });
    await bumpUsage(job.tenantId, { outboundMessages: 1 });

    return { summary: `WhatsApp enviado a ${customer.phone.slice(-4).padStart(6, "•")}` };
  },
};
