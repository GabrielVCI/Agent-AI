import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";

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

  return { conversation, created: true };
}

export async function saveInboundMessage(input: {
  tenantId: string;
  conversationId: string;
  textContent: string;
  whatsappMessageId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.message.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      messageType: "TEXT",
      textContent: input.textContent,
      whatsappMessageId: input.whatsappMessageId,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}

export async function saveOutboundAgentMessage(input: {
  tenantId: string;
  conversationId: string;
  textContent: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.message.create({
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
}

export async function saveHumanMessage(input: {
  tenantId: string;
  conversationId: string;
  textContent: string;
}) {
  return prisma.message.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      senderType: "HUMAN",
      messageType: "TEXT",
      textContent: input.textContent,
    },
  });
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
}

export async function closeConversation(input: {
  tenantId: string;
  conversationId: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
  });

  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  return prisma.conversation.update({
    where: { id: input.conversationId },
    data: { status: "CLOSED" },
  });
}
