/**
 * Executor UPDATE_CUSTOMER_TAG.
 *
 * Sendwary tiene DOS ejes de etiquetado, a propósito:
 *   · ConversationLabel → describe UNA conversación ("Cotización", "Soporte").
 *   · Customer.tags     → describe a la PERSONA ("VIP", "Recurrente"), y es la
 *                         segmentación del Maestro de Clientes (Módulo 1).
 *
 * Este executor aplica la etiqueta en los dos: en la conversación activa (como
 * hacía antes, sin romper nada) y en el cliente, que es lo que después filtra
 * el maestro. Ambas operaciones son idempotentes.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../../config/prisma.js";
import { LABEL_COLORS } from "../../conversation-labels.service.js";
import { addCustomerTags } from "../../customer/customer.service.js";
import { AutomationActionError } from "../automation-errors.js";
import type { AutomationExecutor, ExecutorContext, ExecutorResult } from "./executor.types.js";
import type { UpdateCustomerTagConfig } from "../automation.types.js";

export const customerTagExecutor: AutomationExecutor = {
  validateConfig(config): string | null {
    const { label, color } = config as unknown as UpdateCustomerTagConfig;
    if (typeof label !== "string" || label.trim().length < 2) {
      return "La etiqueta necesita al menos 2 caracteres";
    }
    if (label.length > 40) return "La etiqueta no puede superar 40 caracteres";
    if (color !== undefined && !LABEL_COLORS.includes(color as (typeof LABEL_COLORS)[number])) {
      return `Color de etiqueta inválido. Permitidos: ${LABEL_COLORS.join(", ")}`;
    }
    return null;
  },

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const config = context.actionConfig as unknown as UpdateCustomerTagConfig;
    const { job } = context;
    const name = config.label.trim();

    // 1) Etiqueta del Maestro de Clientes: es la que alimenta la segmentación
    //    y NO depende de que exista una conversación abierta.
    const taggedCustomer = job.customerId
      ? (await addCustomerTags(job.tenantId, job.customerId, [name])).includes(name)
      : false;

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

    // 2) Etiqueta de conversación (contexto del inbox). Si el contacto no
    //    tiene ninguna, la acción NO se considera fallida siempre que el
    //    cliente sí quedara etiquetado: el objetivo del negocio se cumplió.
    if (!conversation) {
      if (taggedCustomer) return { summary: `Etiqueta "${name}" aplicada al cliente` };
      throw AutomationActionError.nonRetryable(
        "NO_CONVERSATION",
        "El contacto no tiene conversación donde aplicar la etiqueta"
      );
    }

    const label = await prisma.conversationLabel.upsert({
      where: { tenantId_name: { tenantId: job.tenantId, name } },
      update: {},
      create: { tenantId: job.tenantId, name, color: config.color ?? "violet" },
    });

    try {
      await prisma.conversationLabelAssignment.create({
        data: { conversationId: conversation.id, labelId: label.id },
      });
    } catch (error) {
      // Ya estaba etiquetada: la acción es idempotente por naturaleza.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      return { summary: `La conversación ya tenía la etiqueta "${name}"` };
    }

    return { summary: `Etiqueta "${name}" aplicada a la conversación` };
  },
};
