import { Prisma } from "@prisma/client"; // 1. Importamos Prisma para usar sus tipos nativos
import {
  findOrCreateActiveConversation,
  findOrCreateCustomer,
  getConversationHistory,
  saveInboundMessage,
  saveOutboundAgentMessage,
  updateConversationLastMessage
} from "./conversation.service.js";
import { findOrCreateQuoteForConversation } from "./quote.service.js";
import { runSalesAgent, saveAgentLog } from "./agent.service.js";
import { executeAgentActions } from "./agent-action.service.js";
import type {
  IncomingWhatsappInput,
  WhatsappIncomingResponse
} from "../types/whatsapp.types.js";

export async function handleIncomingWhatsappMessage(
  input: IncomingWhatsappInput
): Promise<WhatsappIncomingResponse> {
  const customer = await findOrCreateCustomer({
    phone: input.phone,
    customerName: input.customerName
  });

  const conversation = await findOrCreateActiveConversation({
    customerId: customer.id
  });

  // 2. Corregido: Agregamos "as Prisma.InputJsonValue" para que TS valide el objeto JSON
  await saveInboundMessage({
    conversationId: conversation.id,
    content: input.message,
    messageId: input.messageId,
    metadata: {
      source: "whatsapp",
      timestamp: input.timestamp,
      rawCustomerName: input.customerName
    } as Prisma.InputJsonValue
  });

  const quote = await findOrCreateQuoteForConversation({
    customerId: customer.id,
    conversationId: conversation.id
  });

  const history = await getConversationHistory(conversation.id);

  const decision = await runSalesAgent({
    customerName: customer.name,
    message: input.message,
    quoteNumber: quote.quoteNumber,
    conversationHistory: history.map((message) => ({
      direction: message.direction,
      senderType: message.senderType,
      content: message.content
    }))
  });

  await saveAgentLog({
    conversationId: conversation.id,
    userInput: input.message,
    decision
  });

  const actionResult = await executeAgentActions({
    decision,
    quoteId: quote.id,
    conversationId: conversation.id,

  });

  // 3. Corregido: Casteamos el objeto a "Prisma.InputJsonValue"
  await saveOutboundAgentMessage({
    conversationId: conversation.id,
    content: actionResult.replyText,
    metadata: {
      source: "ai-agent",
      quoteId: quote.id,
      decision: decision as any, // Si 'decision' o 'actionResult' tienen tipos complejos de clases, 'as any' o serializarlos previene errores profundos
      actionResult: actionResult as any
    } as Prisma.InputJsonValue
  });

  await updateConversationLastMessage({
    conversationId: conversation.id,
    requiresHuman: decision.requiresHuman
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
    requiresHuman: decision.requiresHuman
  };
}