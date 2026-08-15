import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { invalidateDashboardCache } from "./dashboard.service.js";

export async function findOrCreateCustomer(input: {
  tenantId: string;
  phone: string;
  customerName?: string;
}) {
  return prisma.customer.upsert({
    where: {
      tenantId_phone: { tenantId: input.tenantId, phone: input.phone },
    },
    update: {
      name: input.customerName ?? undefined,
    },
    create: {
      tenantId: input.tenantId,
      phone: input.phone,
      name: input.customerName ?? "Cliente",
    },
  });
}

export async function findOrCreateActiveConversation(input: {
  tenantId: string;
  customerId: string;
  agentId?: string;
  whatsappPhone?: string;
  customerName?: string;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      status: { in: ["BOT_ACTIVE", "HUMAN_ACTIVE", "OPEN"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) return { conversation: existing, created: false };

  const conversation = await prisma.conversation.create({
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

  // El dashboard cuenta conversaciones: invalidar su cache (fire-and-forget)
  void invalidateDashboardCache(input.tenantId);

  return { conversation, created: true };
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

export async function getConversationHistory(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
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
