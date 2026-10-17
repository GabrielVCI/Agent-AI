/**
 * Executor CREATE_INTERNAL_NOTIFICATION.
 *
 * "Notificación interna" en Sendwary = mensaje SYSTEM dentro de la conversación
 * del contacto (mismo mecanismo que ya usan los eventos de citas). El cliente
 * NO lo recibe por WhatsApp: solo lo ve el equipo en el inbox. No se inventa
 * un sistema de notificaciones nuevo.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma.js";
import { AutomationActionError } from "../automation-errors.js";
import { buildRenderVariables, renderTemplate } from "../automation-render.js";
import { invalidateDashboardCache } from "../../dashboard.service.js";
import type { AutomationExecutor, ExecutorContext, ExecutorResult } from "./executor.types.js";
import type { CreateInternalNotificationConfig } from "../automation.types.js";

export const internalNotificationExecutor: AutomationExecutor = {
  validateConfig(config): string | null {
    const { template } = config as unknown as CreateInternalNotificationConfig;
    if (typeof template !== "string" || template.trim().length < 3) {
      return "La nota interna necesita al menos 3 caracteres";
    }
    if (template.length > 1000) return "La nota interna no puede superar 1000 caracteres";
    return null;
  },

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const config = context.actionConfig as unknown as CreateInternalNotificationConfig;
    const { job, tenant } = context;

    // Conversación destino: la indicada por el evento (verificando tenant) o la
    // última conversación del contacto.
    const conversationId =
      typeof context.payload.conversationId === "string" ? context.payload.conversationId : null;

    const conversation = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, tenantId: job.tenantId },
          select: { id: true },
        })
      : job.customerId
        ? await prisma.conversation.findFirst({
            where: { tenantId: job.tenantId, customerId: job.customerId },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          })
        : null;

    if (!conversation) {
      throw AutomationActionError.nonRetryable(
        "NO_CONVERSATION",
        "No hay conversación donde registrar la nota interna"
      );
    }

    let customerName: string | null = null;
    if (job.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: job.customerId, tenantId: job.tenantId },
        select: { name: true },
      });
      customerName = customer?.name ?? null;
    }

    const text = renderTemplate(
      config.template,
      buildRenderVariables({
        customerName,
        businessName: tenant.name,
        timezone: tenant.timezone,
        eventPayload: context.payload.eventPayload,
      })
    ).trim();

    if (!text) {
      throw AutomationActionError.nonRetryable(
        "EMPTY_MESSAGE",
        "La plantilla generó una nota vacía"
      );
    }

    await prisma.message.create({
      data: {
        tenantId: job.tenantId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        senderType: "SYSTEM",
        messageType: "TEXT",
        textContent: text,
        metadata: {
          source: "automation",
          automationJobId: job.id,
          automationRuleId: job.automationRuleId,
          internalOnly: true,
        } as Prisma.InputJsonValue,
      },
    });
    void invalidateDashboardCache(job.tenantId);

    return { summary: "Nota interna registrada en la conversación" };
  },
};
