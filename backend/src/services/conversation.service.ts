import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { invalidateDashboardCache } from "./dashboard.service.js";

/**
 * Alta de contactos: la implementación vive en el Maestro de Clientes
 * (services/customer/customer.service.ts), que es la ÚNICA fuente de verdad
 * — normaliza el teléfono a E.164, deduplica contra la unique constraint del
 * tenant y emite CUSTOMER_CREATED al motor.
 *
 * Se reexporta desde aquí porque WhatsApp, llamadas y citas ya importaban
 * `findOrCreateCustomer` de este módulo: el contrato no cambia.
 */
export { findOrCreateCustomer } from "./customer/customer.service.js";

export async function findOrCreateActiveConversation(input: {
  tenantId: string;
  customerId: string;
  agentId?: string;
  whatsappPhone?: string;
  customerName?: string;
}) {
  // Buscar-o-crear SERIALIZADO por cliente (falla F5). Un cliente nuevo que
  // manda 2-3 mensajes seguidos genera webhooks casi simultáneos, cada uno con
  // su propio messageId (la idempotencia no los agrupa): sin la barrera, todos
  // veían "no hay conversación activa" y cada uno creaba la suya.
  //
  // Lock consultivo de TRANSACCIÓN: se libera solo al terminar la transacción,
  // así que es compatible con PgBouncer en transaction mode. No se usa un
  // índice único parcial porque hay bases con duplicados activos previos.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`conv:${input.tenantId}:${input.customerId}`}, 0))`;

    const existing = await tx.conversation.findFirst({
      where: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        status: { in: ["BOT_ACTIVE", "HUMAN_ACTIVE", "OPEN"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existing) return { conversation: existing, created: false };

    const conversation = await tx.conversation.create({
      data: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        agentId: input.agentId ?? null,
        whatsappPhone: input.whatsappPhone ?? null,
        customerName: input.customerName ?? null,
        status: "BOT_ACTIVE",
        lastMessageAt: new Date(),
      },
    });
    return { conversation, created: true };
  });

  // El dashboard cuenta conversaciones: invalidar su cache (fire-and-forget)
  if (result.created) void invalidateDashboardCache(input.tenantId);

  return result;
}

export async function saveInboundMessage(input: {
  tenantId: string;
  conversationId: string;
  // textContent es opcional: los mensajes no-texto (audio/imagen/documento) se
  // guardan sin contenido y con su messageType real para mantener trazabilidad.
  textContent?: string | null;
  messageType?: "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "TEMPLATE";
  // Texto transcrito de un audio (ElevenLabs/Whisper); solo mensajes AUDIO.
  transcriptionText?: string | null;
  whatsappMessageId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const message = await prisma.message.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      messageType: input.messageType ?? "TEXT",
      textContent: input.textContent ?? null,
      transcriptionText: input.transcriptionText ?? null,
      whatsappMessageId: input.whatsappMessageId,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });

  // Actividad: marca de último inbound + última actividad del contacto
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      lastInboundAt: new Date(),
      customer: { update: { lastActivityAt: new Date() } },
    },
  });

  void invalidateDashboardCache(input.tenantId);
  return message;
}

export async function saveOutboundAgentMessage(input: {
  tenantId: string;
  conversationId: string;
  textContent: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const message = await prisma.message.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      senderType: "AGENT",
      messageType: "TEXT",
      textContent: input.textContent,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastOutboundAt: new Date() },
  });
  void invalidateDashboardCache(input.tenantId);
  return message;
}

export async function saveHumanMessage(input: {
  tenantId: string;
  conversationId: string;
  textContent: string;
}) {
  const message = await prisma.message.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      senderType: "HUMAN",
      messageType: "TEXT",
      textContent: input.textContent,
    },
  });
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastOutboundAt: new Date() },
  });
  void invalidateDashboardCache(input.tenantId);
  return message;
}

export async function updateConversationLastMessage(input: {
  conversationId: string;
  preview?: string;
  requiresHuman?: boolean;
}) {
  const newStatus = input.requiresHuman ? "HUMAN_ACTIVE" : undefined;

  return prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: input.preview,
      ...(newStatus ? { status: newStatus } : {}),
    },
  });
}

/**
 * Los ÚLTIMOS `limit` mensajes de la conversación, en orden cronológico.
 *
 * Se piden en orden descendente y se invierten: con `asc` + `take` se obtenían
 * los MÁS ANTIGUOS, y en un hilo largo ni el Inbox mostraba lo último ni la IA
 * recibía como contexto lo que el cliente acababa de decir (falla F3).
 */
export async function getConversationHistory(conversationId: string, limit = 20) {
  const latest = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return latest.reverse();
}

export async function takeoverConversation(input: {
  tenantId: string;
  conversationId: string;
  userId: string;
  reason?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
  });

  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { status: "HUMAN_ACTIVE", assignedToUserId: input.userId },
    }),
    prisma.humanHandoff.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        reason: input.reason ?? "Intervención manual",
        status: "ASSIGNED",
        assignedTo: input.userId,
      },
    }),
  ]);
  void invalidateDashboardCache(input.tenantId);
}

export async function releaseConversationToAgent(input: {
  tenantId: string;
  conversationId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
  });

  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { status: "BOT_ACTIVE", assignedToUserId: null },
    }),
    prisma.humanHandoff.updateMany({
      where: {
        conversationId: input.conversationId,
        status: { in: ["OPEN", "ASSIGNED"] },
      },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    }),
  ]);
  void invalidateDashboardCache(input.tenantId);
}

/**
 * Asigna la conversación a un usuario del tenant para atención humana.
 * Deja mensaje de sistema y pasa a HUMAN_ACTIVE (la IA se pausa).
 */
export async function assignConversation(input: {
  tenantId: string;
  conversationId: string;
  targetUserId: string;
  byUserId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
  });
  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  const target = await prisma.user.findFirst({
    where: { id: input.targetUserId, tenantId: input.tenantId, status: { not: "DISABLED" } },
    select: { id: true, name: true },
  });
  if (!target) throw new AppError("El usuario indicado no pertenece a esta empresa", 400);

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { status: "HUMAN_ACTIVE", assignedToUserId: target.id },
    }),
    prisma.humanHandoff.updateMany({
      where: { conversationId: input.conversationId, status: "OPEN" },
      data: { status: "ASSIGNED", assignedTo: target.id },
    }),
    prisma.message.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        direction: "OUTBOUND",
        senderType: "SYSTEM",
        messageType: "TEXT",
        textContent: `👤 Conversación asignada a ${target.name}`,
      },
    }),
  ]);

  return target;
}

/** Quita la asignación (la conversación conserva su estado actual). */
export async function unassignConversation(input: {
  tenantId: string;
  conversationId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
  });
  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { assignedToUserId: null },
  });
}

export async function closeConversation(input: {
  tenantId: string;
  conversationId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
  });

  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  const updated = await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { status: "CLOSED" },
  });
  void invalidateDashboardCache(input.tenantId);
  return updated;
}
