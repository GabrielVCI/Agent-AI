/**
 * Dobles de los dos servicios externos del flujo de conversación: OpenAI y la
 * Graph API de Meta. Ninguna prueba que los cargue puede salir a internet.
 *
 * Cómo interceptan, sin tocar código de producción:
 *
 *   · OpenAI — el SDK captura `globalThis.fetch` al construir el cliente
 *     (`this.fetch = options.fetch ?? getDefaultFetch()`), y el cliente de
 *     `src/config/openai.ts` es un singleton perezoso. Basta con sustituir
 *     `fetch` ANTES de la primera llamada al runtime.
 *   · Meta — `meta-whatsapp.service.ts` usa la instancia por defecto de axios,
 *     así que `axios.defaults.adapter` recibe cada envío.
 *
 * Cualquier otra URL lanza: si una prueba llega a un host externo, es un bug de
 * la prueba (misma regla que `.env.test.example`).
 *
 * Todo lo interceptado queda registrado para que la prueba afirme sobre ello:
 * con qué modelo y qué prompt se llamó a la IA, a quién se envió qué texto por
 * WhatsApp y con qué token.
 */
import axios, { AxiosHeaders, type AxiosAdapter } from "axios";

import type { AgentDecision } from "../../src/types/agent.types.js";

/** Texto que "responde la IA" por defecto. Único y fácil de buscar. */
export const MOCK_AI_REPLY = "__mock_ai__ Hola, soy el asistente de prueba.";

export type OpenAiCall = {
  model: string;
  /** Contenido completo del mensaje `system` (incluye el basePrompt del agente). */
  system: string;
  /** Payload del mensaje `user`, ya parseado. */
  user: {
    customerName?: string;
    currentMessage?: string;
    conversationHistory?: Array<{ direction: string; senderType: string; content: string }>;
  };
};

export type MetaCall = {
  url: string;
  to: string;
  type: string;
  text: string | null;
  /** Cabecera Authorization completa, p. ej. `Bearer <token>`. */
  authorization: string;
};

export const openAiCalls: OpenAiCall[] = [];
export const metaCalls: MetaCall[] = [];

const DEFAULT_DECISION: AgentDecision = {
  intent: "GREETING",
  replyText: MOCK_AI_REPLY,
  productRequests: [],
  appointmentRequest: { customerName: "", serviceText: "", dateTimeText: "", isoDateTime: "" },
  actions: [{ type: "NONE", payload: {} }],
  requiresHuman: false,
  confidence: 0.9,
  conversationIntent: "GREETING",
  outcome: "PRODUCTIVE",
};

let queuedDecisions: Partial<AgentDecision>[] = [];

/** La PRÓXIMA respuesta de la IA será esta (se consume una vez). */
export function queueAiDecision(overrides: Partial<AgentDecision>): void {
  queuedDecisions.push(overrides);
}

/** Vacía los registros entre pruebas. */
export function resetExternalCalls(): void {
  openAiCalls.length = 0;
  metaCalls.length = 0;
  queuedDecisions = [];
}

function chatCompletion(model: string, decision: AgentDecision) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(decision), refusal: null },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
  };
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Instala los dobles. Devuelve la función que los retira (para el `after()`).
 */
export function installExternalMocks(): () => void {
  const realFetch = globalThis.fetch;
  const realAdapter = axios.defaults.adapter;

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = urlOf(input);
    if (!url.startsWith("https://api.openai.com/")) {
      throw new Error(`[external-mocks] red externa bloqueada en pruebas: ${url}`);
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    const userRaw = body.messages.find((m) => m.role === "user")?.content ?? "{}";
    openAiCalls.push({ model: body.model, system, user: JSON.parse(userRaw) });

    const decision = { ...DEFAULT_DECISION, ...(queuedDecisions.shift() ?? {}) };
    return new Response(JSON.stringify(chatCompletion(body.model, decision)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? "";
    if (!url.startsWith("https://graph.facebook.com/")) {
      throw new Error(`[external-mocks] red externa bloqueada en pruebas: ${url}`);
    }
    const data =
      typeof config.data === "string" ? (JSON.parse(config.data) as Record<string, unknown>) : {};
    const text = (data.text as { body?: string } | undefined)?.body ?? null;

    metaCalls.push({
      url,
      to: String(data.to ?? ""),
      type: String(data.type ?? ""),
      text,
      authorization: String(AxiosHeaders.from(config.headers).get("Authorization") ?? ""),
    });

    return {
      data: { messaging_product: "whatsapp", messages: [{ id: `wamid.mock-${metaCalls.length}` }] },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  axios.defaults.adapter = adapter;

  return () => {
    globalThis.fetch = realFetch;
    axios.defaults.adapter = realAdapter;
  };
}
