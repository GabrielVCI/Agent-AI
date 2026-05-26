import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { getConversationHistory } from "../services/conversation.service.js";

const DEMO_BUSINESS_ID = "demo-ferreteria";

const paramsSchema = z.object({
  id: z.string().min(1)
});

export async function listConversationsController(
  _req: Request,
  res: Response
) {
  const conversations = await prisma.conversation.findMany({
    where: {
      businessId: DEMO_BUSINESS_ID
    },
    include: {
      customer: true,
      messages: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      quotes: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  res.json({
    success: true,
    count: conversations.length,
    data: conversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      requiresHuman: conversation.requiresHuman,
      lastMessageAt: conversation.lastMessageAt,
      customer: {
        id: conversation.customer.id,
        name: conversation.customer.name,
        phone: conversation.customer.phone
      },
      lastMessage: conversation.messages[0]
        ? {
            direction: conversation.messages[0].direction,
            senderType: conversation.messages[0].senderType,
            content: conversation.messages[0].content,
            createdAt: conversation.messages[0].createdAt
          }
        : null,
      currentQuote: conversation.quotes[0]
        ? {
            id: conversation.quotes[0].id,
            quoteNumber: conversation.quotes[0].quoteNumber,
            status: conversation.quotes[0].status,
            total: Number(conversation.quotes[0].total.toString())
          }
        : null
    }))
  });
}

export async function getConversationController(req: Request, res: Response) {
  const parsed = paramsSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Parámetros inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: parsed.data.id,
      businessId: DEMO_BUSINESS_ID
    },
    include: {
      customer: true,
      quotes: {
        orderBy: {
          createdAt: "desc"
        },
        include: {
          lines: true
        }
      }
    }
  });

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: "Conversación no encontrada"
    });
  }

  const messages = await getConversationHistory(conversation.id);

  res.json({
    success: true,
    data: {
      id: conversation.id,
      status: conversation.status,
      requiresHuman: conversation.requiresHuman,
      customer: {
        id: conversation.customer.id,
        name: conversation.customer.name,
        phone: conversation.customer.phone
      },
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        senderType: message.senderType,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt
      })),
      quotes: conversation.quotes.map((quote) => ({
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        subtotal: Number(quote.subtotal.toString()),
        taxAmount: Number(quote.taxAmount.toString()),
        total: Number(quote.total.toString()),
        pdfUrl: quote.pdfUrl,
        lines: quote.lines.map((line) => ({
          id: line.id,
          productName: line.productName,
          quantity: Number(line.quantity.toString()),
          unit: line.unit,
          unitPrice: Number(line.unitPrice.toString()),
          subtotal: Number(line.subtotal.toString())
        }))
      }))
    }
  });
}