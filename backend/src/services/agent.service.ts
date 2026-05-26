import { env } from "../config/env.js";
import { getOpenAIClient } from "../config/openai.js";
import { prisma } from "../config/prisma.js";
import type { AgentDecision } from "../types/agent.types.js";
import { agentDecisionJsonSchema } from "./agent.schema.js";

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
};

const fallbackDecision: AgentDecision = {
  intent: "UNKNOWN",
  replyText:
    "Recibí tu mensaje. En este momento estoy preparando la información para ayudarte con productos y cotizaciones.",
  productRequests: [],
  actions: [
    {
      type: "NONE",
      payload: {}
    }
  ],
  requiresHuman: false,
  confidence: 0.3
};

export async function runSalesAgent(
  input: RunAgentInput
): Promise<AgentDecision> {
  const client = getOpenAIClient();

  if (!client) {
    return buildRuleBasedFallback(input);
  }

  const userPayload = {
    customerName: input.customerName || "Cliente",
    currentMessage: input.message,
    quoteNumber: input.quoteNumber || null,
    conversationHistory: input.conversationHistory.slice(-10).map((message) => ({
      direction: message.direction,
      senderType: message.senderType,
      content: message.content
    }))
  };

  try {
    // 1. Corregido al método oficial chat.completions.create
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      // 2. Cambiado 'input' por 'messages'
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: JSON.stringify(userPayload)
        }
      ],
      // 3. Cambiado 'text.format' por el estándar 'response_format'
      response_format: {
        type: "json_schema",
        json_schema: {
          name: agentDecisionJsonSchema.name,
          schema: agentDecisionJsonSchema.schema,
          strict: agentDecisionJsonSchema.strict
        }
      }
    });

    // 4. Extracción real del contenido del JSON estructurado
    const outputText = response.choices[0].message.content;

    if (!outputText) {
      return fallbackDecision;
    }

    const parsed = JSON.parse(outputText) as AgentDecision;

    return normalizeAgentDecision(parsed);
  } catch (error: any) {
    console.error("❌ Error ejecutando IA:");
    console.error("Mensaje:", error?.message);
    console.error("Status:", error?.status);
    console.error("Code:", error?.code);
    console.error("Type:", error?.type);
    console.error("Response:", error?.response?.data || error);

    return buildRuleBasedFallback(input);
  }
}

function buildSystemPrompt() {
  return `
Eres un agente IA de ventas especializado en ferretería.

Tu trabajo es interpretar mensajes de clientes por WhatsApp y devolver una decisión estructurada.

IMPORTANTE:
- No inventes precios.
- No inventes disponibilidad.
- No digas que un producto existe si no ha sido consultado.
- No calcules totales.
- No generes cotizaciones por tu cuenta.
- Solo extrae intención, productos, cantidades y acciones sugeridas.
- El backend será quien busque productos, calcule precios y genere cotizaciones.

Tono:
- Español dominicano neutro.
- Profesional.
- Breve.
- Claro.
- Estilo WhatsApp.

Correcciones comunes:
- tiner, tinner, tinel => thinner.
- calvanizado => galvanizado.
- llavin llame => llavín Yale.
- yales => Yale.
- disco #7 => disco de corte 7 pulgadas.
- disco #4 => disco de pulir 4 pulgadas.
- soldadura fina => electrodo fino.
- oxido gris plata => óxido gris plata.

Intenciones:
- GREETING: saludo.
- SEARCH_PRODUCT: cliente pregunta por producto.
- ASK_PRICE: cliente pregunta precio.
- ADD_TO_QUOTE: cliente quiere agregar o cotizar producto.
- REMOVE_FROM_QUOTE: cliente quiere quitar producto.
- GENERATE_QUOTE: cliente quiere generar o recibir cotización/PDF.
- ASK_RECOMMENDATION: cliente pide recomendación.
- HUMAN_HANDOFF: cliente pide humano, descuento, crédito, queja o condición especial.
- UNKNOWN: no está claro.

Reglas para productRequests:
- Si el cliente menciona productos, extrae cada producto.
- Si el cliente manda una lista técnica, divide por líneas.
- quantity debe ser número. Si no hay cantidad, usa 1.
- unit debe ser string. Si no sabes la unidad, usa "".
- originalText debe ser el texto del cliente para ese producto.
- normalizedText debe ser tu mejor interpretación corregida.

Reglas para actions:
- Si hay productos: usa ADD_TO_QUOTE o SEARCH_PRODUCT.
- Si pide PDF/cotización final: usa GENERATE_PDF.
- Si pide humano/descuento/crédito: usa HANDOFF.
- Si es saludo: usa NONE.
- payload debe ser objeto, aunque esté vacío.

La respuesta debe ser JSON válido siguiendo el esquema indicado.
`;
}

function normalizeAgentDecision(decision: AgentDecision): AgentDecision {
  return {
    intent: decision.intent || "UNKNOWN",
    replyText: decision.replyText || fallbackDecision.replyText,
    productRequests: Array.isArray(decision.productRequests)
      ? decision.productRequests.map((product) => ({
          originalText: product.originalText || product.normalizedText || "",
          normalizedText: product.normalizedText || product.originalText || "",
          quantity:
            typeof product.quantity === "number" && product.quantity > 0
              ? product.quantity
              : 1,
          unit: product.unit || ""
        }))
      : [],
    actions: Array.isArray(decision.actions)
      ? decision.actions.map((action) => ({
          type: action.type || "NONE",
          payload: action.payload || {}
        }))
      : [
          {
            type: "NONE",
            payload: {}
          }
        ],
    requiresHuman: Boolean(decision.requiresHuman),
    confidence:
      typeof decision.confidence === "number" ? decision.confidence : 0.5
  };
}

function buildRuleBasedFallback(input: RunAgentInput): AgentDecision {
  const message = input.message.toLowerCase();

  if (message.includes("hola") || message.includes("buenas")) {
    return {
      intent: "GREETING",
      replyText: `¡Hola ${input.customerName || "Cliente"}! Soy el asistente virtual de ventas. ¿En qué puedo ayudarte hoy?`,
      productRequests: [],
      actions: [
        {
          type: "NONE",
          payload: {}
        }
      ],
      requiresHuman: false,
      confidence: 0.8
    };
  }

  if (
    message.includes("descuento") ||
    message.includes("credito") ||
    message.includes("crédito") ||
    message.includes("humano") ||
    message.includes("vendedor")
  ) {
    return {
      intent: "HUMAN_HANDOFF",
      replyText:
        "Para ayudarte con esa solicitud, voy a pasar tu caso a un asesor de ventas.",
      productRequests: [],
      actions: [
        {
          type: "HANDOFF",
          payload: {
            reason: "Solicitud requiere atención humana"
          }
        }
      ],
      requiresHuman: true,
      confidence: 0.8
    };
  }

  return fallbackDecision;
}

export async function saveAgentLog(input: {
  conversationId?: string;
  userInput: string;
  decision: AgentDecision;
}) {
  await prisma.agentLog.create({
    data: {
      conversationId: input.conversationId,
      input: input.userInput,
      output: input.decision as unknown as object,
      intent: input.decision.intent,
      confidence: input.decision.confidence,
      requiresHuman: input.decision.requiresHuman
    }
  });
}