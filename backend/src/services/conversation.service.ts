import { Prisma } from "@prisma/client"; // 1. Importamos Prisma para acceder a sus tipos JSON
import { prisma } from "../config/prisma.js";

const DEMO_BUSINESS_ID = "demo-ferreteria";

export async function findOrCreateCustomer(input: {
  phone: string;
  customerName?: string;
}) {
  return prisma.customer.upsert({
    where: {
      businessId_phone: {
        businessId: DEMO_BUSINESS_ID,
        phone: input.phone
      }
    },
    update: {
      name: input.customerName ?? undefined
    },
    create: {
      businessId: DEMO_BUSINESS_ID,
      phone: input.phone,
      name: input.customerName ?? "Cliente"
    }
  });
}

export async function findOrCreateActiveConversation(input: {
  customerId: string;
}) {
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      businessId: DEMO_BUSINESS_ID,
      customerId: input.customerId,
      status: {
        in: ["ACTIVE", "WAITING_HUMAN"]
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  if (existingConversation) {
    return existingConversation;
  }

  return prisma.conversation.create({
    data: {
      businessId: DEMO_BUSINESS_ID,
      customerId: input.customerId,
      status: "ACTIVE",
      lastMessageAt: new Date()
    }
  });
}

// 2. Corregido: Cambiamos Record<string, unknown> por Prisma.InputJsonValue
export async function saveInboundMessage(input: {
  conversationId: string;
  content: string;
  messageId?: string;
  metadata?: Prisma.InputJsonValue; 
}) {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: "INBOUND",
      senderType: "CUSTOMER",
      content: input.content,
      messageId: input.messageId,
      metadata: input.metadata ?? Prisma.JsonNull // Opcional: evita conflictos con nulls de bases de datos
    }
  });
}

// 3. Corregido: Cambiamos Record<string, unknown> por Prisma.InputJsonValue
export async function saveOutboundAgentMessage(input: {
  conversationId: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      senderType: "AGENT",
      content: input.content,
      metadata: input.metadata ?? Prisma.JsonNull
    }
  });
}

export async function updateConversationLastMessage(input: {
  conversationId: string;
  requiresHuman?: boolean;
}) {
  return prisma.conversation.update({
    where: {
      id: input.conversationId
    },
    data: {
      lastMessageAt: new Date(),
      requiresHuman: input.requiresHuman ?? false
    }
  });
}

export async function getConversationHistory(conversationId: string) {
  return prisma.message.findMany({
    where: {
      conversationId
    },
    orderBy: {
      createdAt: "asc"
    },
    take: 20
  });
}