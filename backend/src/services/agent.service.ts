import { env } from "../config/env.js";
import { getOpenAIClient } from "../config/openai.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type { AgentDecision, AgentRunResult, AiUsage } from "../types/agent.types.js";
import { agentDecisionJsonSchema } from "./agent.schema.js";
import { extractUsage } from "./ai/ai-usage.service.js";
import { describeOpenAiError, OPENAI_FAILURE_REPLY } from "./ai/openai-error.js";

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
  };
};

const fallbackDecision: AgentDecision = {
  intent: "UNKNOWN",
  replyText:
    "Recibí tu mensaje. En este momento estoy preparando la información para ayudarte.",
  productRequests: [],
  actions: [{ type: "NONE", payload: {} }],
  requiresHuman: false,
  confidence: 0.3,
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
        { role: "system", content: buildSystemPrompt(input.agentConfig) },
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

    const parsed = JSON.parse(outputText) as AgentDecision;
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

function buildSystemPrompt(config?: RunAgentInput["agentConfig"]): string {
  // If the agent has a custom system prompt, use it as-is.
  if (config?.systemPrompt) {
    return config.systemPrompt;
  }

  const businessName = config?.businessName ?? "el negocio";
  const industry = config?.industry ?? "ventas";
  const tone = config?.tone ?? "Profesional. Breve. Estilo WhatsApp.";

  return `
Eres un agente IA de ventas especializado en ${industry} para ${businessName}.

Tu trabajo es interpretar mensajes de clientes por WhatsApp y devolver una decisión estructurada.

IMPORTANTE:
- No inventes precios ni disponibilidad.
- No calcules totales ni generes cotizaciones directamente.
- Solo extrae intención, productos, cantidades y acciones sugeridas.
- El backend busca productos, calcula precios y genera cotizaciones.

Tono: ${tone}

Correcciones comunes de ferretería (si aplica al negocio):
- tiner, tinner => thinner.
- calvanizado => galvanizado.
- disco #7 => disco de corte 7 pulgadas.

Intenciones:
- GREETING: saludo.
- SEARCH_PRODUCT: cliente pregunta por producto.
- ASK_PRICE: cliente pregunta precio.
- ADD_TO_QUOTE: cliente quiere agregar o cotizar producto.
- REMOVE_FROM_QUOTE: cliente quiere quitar producto.
- GENERATE_QUOTE: cliente quiere cotización/PDF.
- ASK_RECOMMENDATION: cliente pide recomendación.
- HUMAN_HANDOFF: cliente pide humano, descuento, crédito o condición especial.
- UNKNOWN: no está claro.

Reglas para productRequests:
- Extrae cada producto mencionado.
- quantity debe ser número (default 1).
- unit debe ser string (vacío si no aplica).
- originalText: texto del cliente para ese producto.
- normalizedText: tu mejor interpretación corregida.

Reglas para actions:
- Si hay productos: ADD_TO_QUOTE o SEARCH_PRODUCT.
- Si pide PDF/cotización: GENERATE_PDF.
- Si pide humano/descuento/crédito: HANDOFF.
- Si es saludo: NONE.
- payload debe ser objeto aunque esté vacío.

Devuelve JSON válido siguiendo el esquema indicado.
`;
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
    actions: Array.isArray(decision.actions)
      ? decision.actions.map((a) => ({ type: a.type || "NONE", payload: a.payload || {} }))
      : [{ type: "NONE", payload: {} }],
    requiresHuman: Boolean(decision.requiresHuman),
    confidence: typeof decision.confidence === "number" ? decision.confidence : 0.5,
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
