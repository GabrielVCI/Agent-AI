import { Prisma } from "@prisma/client";
import {
  findOrCreateActiveConversation,
  findOrCreateCustomer,
  getConversationHistory,
  saveInboundMessage,
  saveOutboundAgentMessage,
  updateConversationLastMessage,
} from "./conversation.service.js";
import { findOrCreateQuoteForConversation } from "./quote.service.js";
import { runSalesAgent, saveAgentLog } from "./agent.service.js";
import { executeAgentActions } from "./agent-action.service.js";
import { recordAiUsage } from "./ai/ai-usage.service.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type {
  IncomingWhatsappInput,
  WhatsappIncomingResponse,
} from "../types/whatsapp.types.js";

export async function resolveAgentByPhoneNumberId(
  phoneNumberId: string
): Promise<{ tenantId: string; agentId: string; agent: any } | null> {
  const agent = await prisma.agent.findFirst({
    where: {
      whatsappPhoneNumberId: phoneNumberId,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
    },
    include: { tenant: true },
  });

  if (!agent) return null;

  return {
    tenantId: agent.tenantId,
    agentId: agent.id,
    agent,
  };
}

export async function handleIncomingWhatsappMessage(
  input: IncomingWhatsappInput & { tenantId: string; agentId?: string; agentConfig?: any }
): Promise<WhatsappIncomingResponse> {
  const { tenantId, agentId } = input;

  const customer = await findOrCreateCustomer({
    tenantId,
    phone: input.phone,
    customerName: input.customerName,
  });

  const { conversation, created } = await findOrCreateActiveConversation({
    tenantId,
    customerId: customer.id,
    agentId: agentId ?? undefined,
    whatsappPhone: input.phone,
    customerName: input.customerName,
  });

  logger.info(
    `[WHATSAPP WEBHOOK] conversación ${created ? "creada" : "encontrada"}: ${conversation.id} (estado: ${conversation.status})`
  );

  // If conversation is HUMAN_ACTIVE, don't let the bot respond
  if (conversation.status === "HUMAN_ACTIVE") {
    logger.info(`[WHATSAPP WEBHOOK] modo humano, no responde: ${conversation.id}`);
    await saveInboundMessage({
      tenantId,
      conversationId: conversation.id,
      textContent: input.message,
      whatsappMessageId: input.messageId,
      metadata: {
        source: "whatsapp",
        timestamp: input.timestamp,
        rawCustomerName: input.customerName,
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      replyText: "",
      actions: [],
      customerId: customer.id,
      conversationId: conversation.id,
      quoteId: null,
      pdfUrl: null,
      pdfPath: null,
      pdfFilename: null,
      requiresHuman: true,
      skipReply: true,
    };
  }

  await saveInboundMessage({
    tenantId,
    conversationId: conversation.id,
    textContent: input.message,
    whatsappMessageId: input.messageId,
    metadata: {
      source: "whatsapp",
      timestamp: input.timestamp,
      rawCustomerName: input.customerName,
    } as Prisma.InputJsonValue,
  });

  const quote = await findOrCreateQuoteForConversation({
    tenantId,
    customerId: customer.id,
    conversationId: conversation.id,
    agentId: agentId ?? undefined,
  });

  const history = await getConversationHistory(conversation.id);

  const runResult = await runSalesAgent({
    customerName: customer.name,
    message: input.message,
    quoteNumber: quote.quoteNumber,
    conversationHistory: history.map((m) => ({
      direction: m.direction,
      senderType: m.senderType,
      content: m.textContent ?? "",
    })),
    agentConfig: input.agentConfig
      ? {
          systemPrompt: input.agentConfig.systemPrompt,
          tone: input.agentConfig.tone,
          openAiModel: input.agentConfig.openAiModel,
          industry: input.agentConfig.tenant?.industry,
          businessName: input.agentConfig.tenant?.name,
        }
      : undefined,
  });

  const decision = runResult.decision;

  logger.info(
    `[WHATSAPP WEBHOOK] respuesta IA generada (intent: ${decision.intent}, modelo: ${runResult.model}, ok: ${runResult.success}, requiereHumano: ${decision.requiresHuman})`
  );

  await recordAiUsage({
    tenantId,
    agentId: agentId ?? null,
    conversationId: conversation.id,
    operation: "AGENT_REPLY",
    model: runResult.model,
    usage: runResult.usage,
    success: runResult.success,
    errorMessage: runResult.errorMessage,
  });

  await saveAgentLog({
    tenantId,
    agentId: agentId ?? undefined,
    conversationId: conversation.id,
    userInput: input.message,
    decision,
  });

  const actionResult = await executeAgentActions({
    decision,
    quoteId: quote.id,
    conversationId: conversation.id,
    tenantId,
  });

  await saveOutboundAgentMessage({
    tenantId,
    conversationId: conversation.id,
    textContent: actionResult.replyText,
    metadata: {
      source: "ai-agent",
      quoteId: quote.id,
      decision: decision as any,
      actionResult: actionResult as any,
    } as Prisma.InputJsonValue,
  });

  await updateConversationLastMessage({
    conversationId: conversation.id,
    preview: actionResult.replyText.slice(0, 120),
    requiresHuman: decision.requiresHuman,
  });

  return {
    success: true,
    replyText: actionResult.replyText,
    actions: decision.actions,
    customerId: customer.id,
    conversationId: conversation.id,
    quoteId: quote.id,
    pdfUrl: actionResult.pdfUrl,
    pdfPath: actionResult.pdfPath,
    pdfFilename: actionResult.pdfFilename,
    requiresHuman: decision.requiresHuman,
    skipReply: false,
  };
}
