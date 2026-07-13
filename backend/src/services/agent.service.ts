import { env } from "../config/env.js";
import { getOpenAIClient } from "../config/openai.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type { AgentDecision, AgentRunResult, AiUsage } from "../types/agent.types.js";
import type { TrainingConfig } from "../types/training.types.js";
import { agentDecisionJsonSchema } from "./agent.schema.js";
import { extractUsage } from "./ai/ai-usage.service.js";
import { describeOpenAiError, OPENAI_FAILURE_REPLY } from "./ai/openai-error.js";
import {
  buildAgentSystemPrompt,
  type AgentChannel,
} from "./agent-runtime/agent-prompt.builder.js";
import { AGENT_RESPONSES } from "./agent-runtime/agent-responses.js";

const ZERO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

type ConversationMessageForAgent = {
  direction: string;
  senderType: string;
  content: string;
};

type RunAgentInput = {
  customerName?: string | null;
  message: string;
  quoteNumber?: string | null;
  conversationHistory: ConversationMessageForAgent[];
  agentConfig?: {
    systemPrompt?: string | null;
    tone?: string | null;
    openAiModel?: string | null;
    industry?: string | null;
    businessName?: string | null;
    trainingConfig?: TrainingConfig | null;
  };
  /**
   * Bloque de datos verificados (catálogo, documentos, disponibilidad) que el
   * runtime pre-recupera para este mensaje. Se anexa al system prompt.
   */
  extraContext?: string | null;
  /** Canal real del mensaje (ajusta el prompt: texto, audio transcrito, llamada, prueba). */
  channel?: AgentChannel;
};

const fallbackDecision: AgentDecision = {
  intent: "UNKNOWN",
  replyText:
    "Recibí tu mensaje. En este momento estoy preparando la información para ayudarte.",
  productRequests: [],
  actions: [{ type: "NONE", payload: {} }],
  requiresHuman: false,
  confidence: 0.3,
  conversationIntent: "UNKNOWN",
  outcome: "NEEDS_INFO",
};

/**
 * Motor IA central. Recibe el mensaje del cliente + configuración del agente,
 * llama a OpenAI con salida estructurada validada por JSON schema y devuelve
 * la decisión junto con los metadatos de uso (modelo, tokens, éxito/fallback).
 *
 * Nunca lanza por errores de OpenAI: degrada a una decisión de respaldo para
 * no romper el webhook ni dejar la conversación sin estado.
 */
export async function runSalesAgent(input: RunAgentInput): Promise<AgentRunResult> {
  const client = getOpenAIClient();
  const model = input.agentConfig?.openAiModel || env.OPENAI_DEFAULT_MODEL || env.OPENAI_MODEL;

  // Sin API key: degradamos a reglas básicas para que el entorno local siga vivo.
  if (!client) {
    return {
      decision: buildRuleBasedFallback(input),
      usage: ZERO_USAGE,
      model,
      success: false,
      usedFallback: true,
      errorMessage: "OPENAI_API_KEY no configurada",
    };
  }

  const userPayload = {
    customerName: input.customerName || "Cliente",
    currentMessage: input.message,
    quoteNumber: input.quoteNumber || null,
    conversationHistory: input.conversationHistory.slice(-10).map((m) => ({
      direction: m.direction,
      senderType: m.senderType,
      content: m.content,
    })),
  };

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: env.OPENAI_TEMPERATURE,
      max_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "system",
          content: buildAgentSystemPrompt({
            agentConfig: input.agentConfig,
            extraContext: input.extraContext,
            channel: input.channel,
          }),
        },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: agentDecisionJsonSchema.name,
          schema: agentDecisionJsonSchema.schema,
          strict: agentDecisionJsonSchema.strict,
        },
      },
    });

    const usage = extractUsage(response.usage);
    const outputText = response.choices[0]?.message?.content;

    if (!outputText) {
      return {
        decision: fallbackDecision,
        usage,
        model,
        success: false,
        usedFallback: true,
        errorMessage: "OpenAI no devolvió contenido",
      };
    }

    // JSON inválido del modelo NO tumba la conversación: respuesta textual
    // segura y escalamiento suave (Parte G: el agente nunca se traba).
    let parsed: AgentDecision;
    try {
      parsed = JSON.parse(outputText) as AgentDecision;
    } catch {
      logger.error("❌ IA devolvió JSON inválido; usando respuesta segura");
      return {
        decision: {
          ...fallbackDecision,
          intent: "HUMAN_HANDOFF",
          replyText: AGENT_RESPONSES.emergency,
          requiresHuman: true,
          outcome: "NEEDS_HUMAN",
          actions: [{ type: "HANDOFF", payload: { reason: "Respuesta IA no estructurada" } }],
        },
        usage,
        model,
        success: false,
        usedFallback: true,
        errorMessage: "OpenAI devolvió JSON inválido",
      };
    }

    return {
      decision: normalizeAgentDecision(parsed),
      usage,
      model,
      success: true,
      usedFallback: false,
    };
  } catch (error) {
    const info = describeOpenAiError(error);
    logger.error(`❌ Error ejecutando IA: ${info.logMessage}`);

    // Ante un fallo real de OpenAI sugerimos intervención humana con un
    // mensaje claro al cliente, en lugar de inventar una respuesta.
    return {
      decision: {
        ...fallbackDecision,
        intent: "HUMAN_HANDOFF",
        replyText: OPENAI_FAILURE_REPLY,
        requiresHuman: true,
        outcome: "NEEDS_HUMAN",
        actions: [{ type: "HANDOFF", payload: { reason: "Error procesando con IA" } }],
      },
      usage: ZERO_USAGE,
      model,
      success: false,
      usedFallback: true,
      errorMessage: info.logMessage,
    };
  }
}

function normalizeAgentDecision(decision: AgentDecision): AgentDecision {
  return {
    intent: decision.intent || "UNKNOWN",
    replyText: decision.replyText || fallbackDecision.replyText,
    productRequests: Array.isArray(decision.productRequests)
      ? decision.productRequests.map((p) => ({
          originalText: p.originalText || p.normalizedText || "",
          normalizedText: p.normalizedText || p.originalText || "",
          quantity: typeof p.quantity === "number" && p.quantity > 0 ? p.quantity : 1,
          unit: p.unit || "",
        }))
      : [],
    appointmentRequest: decision.appointmentRequest
      ? {
          customerName: decision.appointmentRequest.customerName || "",
          serviceText: decision.appointmentRequest.serviceText || "",
          dateTimeText: decision.appointmentRequest.dateTimeText || "",
          isoDateTime: decision.appointmentRequest.isoDateTime || "",
        }
      : undefined,
    actions: Array.isArray(decision.actions)
      ? decision.actions.map((a) => ({ type: a.type || "NONE", payload: a.payload || {} }))
      : [{ type: "NONE", payload: {} }],
    requiresHuman: Boolean(decision.requiresHuman),
    confidence: typeof decision.confidence === "number" ? decision.confidence : 0.5,
    conversationIntent: decision.conversationIntent || "UNKNOWN",
    outcome: decision.outcome || "NEEDS_INFO",
  };
}

function buildRuleBasedFallback(input: RunAgentInput): AgentDecision {
  const message = input.message.toLowerCase();

  if (message.includes("hola") || message.includes("buenas")) {
    return {
      intent: "GREETING",
      replyText: `¡Hola ${input.customerName || "Cliente"}! Soy el asistente virtual. ¿En qué puedo ayudarte hoy?`,
      productRequests: [],
      actions: [{ type: "NONE", payload: {} }],
      requiresHuman: false,
      confidence: 0.8,
      conversationIntent: "GREETING",
      outcome: "PRODUCTIVE",
    };
  }

  if (
    message.includes("descuento") ||
    message.includes("credito") ||
    message.includes("humano") ||
    message.includes("vendedor")
  ) {
    return {
      intent: "HUMAN_HANDOFF",
      replyText: "Voy a pasar tu caso a un asesor.",
      productRequests: [],
      actions: [{ type: "HANDOFF", payload: { reason: "Solicitud requiere atención humana" } }],
      requiresHuman: true,
      confidence: 0.8,
      conversationIntent: "HUMAN_REQUEST",
      outcome: "NEEDS_HUMAN",
    };
  }

  return fallbackDecision;
}

export async function saveAgentLog(input: {
  tenantId?: string;
  agentId?: string;
  conversationId?: string;
  userInput: string;
  decision: AgentDecision;
}) {
  await prisma.agentLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      agentId: input.agentId ?? null,
      conversationId: input.conversationId ?? null,
      input: input.userInput,
      output: input.decision as unknown as object,
      intent: input.decision.intent,
      confidence: input.decision.confidence,
      requiresHuman: input.decision.requiresHuman,
    },
  });
}
