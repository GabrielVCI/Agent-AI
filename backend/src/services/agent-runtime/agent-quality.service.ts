import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AGENT_RESPONSES } from "./agent-responses.js";
import type {
  AgentDecision,
  ConversationIntent,
  ConversationOutcome,
} from "../../types/agent.types.js";

/**
 * Control de calidad y de gasto del runtime IA.
 *
 * Dos etapas:
 *  1. PRECHECK (sin tokens): detecta por reglas casos obvios — número
 *     equivocado explícito, spam/insultos reincidentes — y corta ANTES de
 *     llamar a OpenAI.
 *  2. POST-DECISIÓN: usa la clasificación del modelo (conversationIntent /
 *     outcome) para aplicar la política de conversaciones improductivas:
 *     off-topic se redirige UNA vez, spam no se contesta dos veces, número
 *     equivocado se cierra, y muchas vueltas sin avance escalan a humano.
 *
 * El estado vive en conversation.metadata.qualityState (sin migración).
 */

// Tokens promedio de una vuelta completa del runtime (prompt+contexto+salida);
// solo para estimar el ahorro cuando el precheck evita llamar al modelo.
const ESTIMATED_TOKENS_PER_TURN = 1800;

export interface QualityState {
  offTopicCount: number;
  spamStrikes: number;
  unproductiveTurns: number;
  lastOutcome?: string;
}

const EMPTY_STATE: QualityState = { offTopicCount: 0, spamStrikes: 0, unproductiveTurns: 0 };

export type PrecheckResult =
  | { action: "PROCEED" }
  | {
      action: "SKIP_MODEL";
      conversationIntent: ConversationIntent;
      outcome: ConversationOutcome;
      /** "" = no responder nada (silencio deliberado). */
      replyText: string;
      closeConversation: boolean;
      requiresHuman: boolean;
      costControlReason: string;
      tokensSavedEstimate: number;
    };

export interface QualityVerdict {
  /** Texto final a enviar ("" = no responder). */
  replyText: string;
  outcome: ConversationOutcome;
  conversationIntent: ConversationIntent;
  requiresHuman: boolean;
  closeConversation: boolean;
  productive: boolean;
  costControlReason: string | null;
  newState: QualityState;
}

// ─── Patrones (conservadores a propósito: ante duda, dejar pasar al modelo) ──

const WRONG_NUMBER_PATTERNS = [
  /n[uú]mero equivocado/i,
  /me equivoqu[eé] de n[uú]mero/i,
  /mensaje equivocado/i,
  /no era para (ti|usted|este n[uú]mero)/i,
  /te equivocaste de n[uú]mero/i,
  /est[aá]s? equivocado de n[uú]mero/i,
];

const SPAM_PATTERNS = [
  /gana(r)? dinero (r[aá]pido|f[aá]cil|desde casa)/i,
  /invierte en (cripto|bitcoin|forex)/i,
  /has sido seleccionad[oa]/i,
  /felicidades[!,. ]+ganaste/i,
  /pr[eé]stamos? (r[aá]pidos?|sin bur[oó])/i,
];

const INSULT_PATTERNS = [
  /\b(idiota|est[uú]pido|imb[eé]cil|basura|mierda|maldito|cabr[oó]n|pendejo)\b/i,
];

export function loadQualityState(metadata: Prisma.JsonValue | null | undefined): QualityState {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { ...EMPTY_STATE };
  const raw = (metadata as Record<string, unknown>).qualityState;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_STATE };
  const s = raw as Record<string, unknown>;
  return {
    offTopicCount: typeof s.offTopicCount === "number" ? s.offTopicCount : 0,
    spamStrikes: typeof s.spamStrikes === "number" ? s.spamStrikes : 0,
    unproductiveTurns: typeof s.unproductiveTurns === "number" ? s.unproductiveTurns : 0,
    lastOutcome: typeof s.lastOutcome === "string" ? s.lastOutcome : undefined,
  };
}

/**
 * Etapa 1 — precheck por reglas ANTES de llamar al modelo. Solo corta en
 * casos inequívocos; todo lo ambiguo sigue al modelo (que clasifica mejor).
 */
export function precheckCustomerMessage(text: string, state: QualityState): PrecheckResult {
  const trimmed = text.trim();

  if (WRONG_NUMBER_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      action: "SKIP_MODEL",
      conversationIntent: "WRONG_NUMBER",
      outcome: "WRONG_NUMBER",
      replyText: AGENT_RESPONSES.wrongNumber,
      closeConversation: true,
      requiresHuman: false,
      costControlReason: "WRONG_NUMBER_DETECTED",
      tokensSavedEstimate: ESTIMATED_TOKENS_PER_TURN,
    };
  }

  const isSpam = SPAM_PATTERNS.some((p) => p.test(trimmed));
  const isInsult = INSULT_PATTERNS.some((p) => p.test(trimmed));

  // Spam reincidente o insultos repetidos: silencio total, cero gasto.
  if ((isSpam || isInsult) && state.spamStrikes >= 1) {
    return {
      action: "SKIP_MODEL",
      conversationIntent: isSpam ? "SPAM" : "COMPLAINT",
      outcome: "SPAM",
      replyText: "",
      closeConversation: true,
      requiresHuman: false,
      costControlReason: "SPAM_REPEATED_SILENCED",
      tokensSavedEstimate: ESTIMATED_TOKENS_PER_TURN,
    };
  }

  // Primer spam claro: respuesta mínima sin tocar el modelo.
  if (isSpam) {
    return {
      action: "SKIP_MODEL",
      conversationIntent: "SPAM",
      outcome: "SPAM",
      replyText: "",
      closeConversation: false,
      requiresHuman: false,
      costControlReason: "SPAM_DETECTED",
      tokensSavedEstimate: ESTIMATED_TOKENS_PER_TURN,
    };
  }

  // Primer insulto: cliente molesto → escalar a humano sin gastar modelo.
  if (isInsult) {
    return {
      action: "SKIP_MODEL",
      conversationIntent: "COMPLAINT",
      outcome: "NEEDS_HUMAN",
      replyText: AGENT_RESPONSES.humanRequested,
      closeConversation: false,
      requiresHuman: true,
      costControlReason: "INSULT_ESCALATED",
      tokensSavedEstimate: ESTIMATED_TOKENS_PER_TURN,
    };
  }

  return { action: "PROCEED" };
}

/** Deriva el outcome cuando el modelo no lo dio (fallbacks legados). */
function deriveOutcome(decision: AgentDecision): ConversationOutcome {
  if (decision.outcome) return decision.outcome;
  if (decision.requiresHuman || decision.intent === "HUMAN_HANDOFF") return "NEEDS_HUMAN";
  if (decision.intent === "UNKNOWN") return "NEEDS_INFO";
  return "PRODUCTIVE";
}

const PRODUCTIVE_OUTCOMES: ConversationOutcome[] = ["PRODUCTIVE", "COMPLETED"];

/** Vueltas sin avance antes de escalar a humano (Parte C.4). */
const MAX_UNPRODUCTIVE_TURNS = 4;

/**
 * Etapa 2 — aplica la política de conversaciones improductivas sobre la
 * decisión del modelo y actualiza los contadores de la conversación.
 */
export function evaluateDecisionQuality(input: {
  decision: AgentDecision;
  state: QualityState;
  businessName: string;
}): QualityVerdict {
  const { decision, state } = input;
  const conversationIntent: ConversationIntent = decision.conversationIntent ?? "UNKNOWN";
  let outcome = deriveOutcome(decision);
  let replyText = decision.replyText;
  let requiresHuman = decision.requiresHuman;
  let closeConversation = false;
  let costControlReason: string | null = null;

  const newState: QualityState = { ...state };

  switch (conversationIntent) {
    case "WRONG_NUMBER":
      replyText = AGENT_RESPONSES.wrongNumber;
      outcome = "WRONG_NUMBER";
      closeConversation = true;
      requiresHuman = false;
      costControlReason = "WRONG_NUMBER_CLASSIFIED";
      break;

    case "SPAM":
      newState.spamStrikes = state.spamStrikes + 1;
      outcome = "SPAM";
      requiresHuman = false;
      if (state.spamStrikes >= 1) {
        replyText = "";
        closeConversation = true;
        costControlReason = "SPAM_REPEATED_SILENCED";
      } else {
        // Respuesta mínima una sola vez; si insiste, silencio.
        replyText = decision.replyText?.trim() || "";
        costControlReason = "SPAM_CLASSIFIED";
      }
      break;

    case "OFF_TOPIC":
      newState.offTopicCount = state.offTopicCount + 1;
      outcome = "NOT_RELATED";
      if (state.offTopicCount >= 1) {
        // Segunda vez fuera de tema: cerrar amable y dejar de gastar.
        replyText = AGENT_RESPONSES.offTopicClose;
        closeConversation = true;
        costControlReason = "OFF_TOPIC_REPEATED_CLOSED";
      } else {
        replyText = AGENT_RESPONSES.offTopic(input.businessName);
        costControlReason = "OFF_TOPIC_REDIRECTED";
      }
      break;

    default:
      break;
  }

  // Conteo de vueltas sin avance: si el turno no fue productivo ni terminal,
  // acumula; demasiadas vueltas → escalar a humano con mensaje amable.
  const terminal = closeConversation || requiresHuman;
  if (!terminal) {
    if (PRODUCTIVE_OUTCOMES.includes(outcome)) {
      newState.unproductiveTurns = 0;
    } else {
      newState.unproductiveTurns = state.unproductiveTurns + 1;
      if (newState.unproductiveTurns >= MAX_UNPRODUCTIVE_TURNS) {
        replyText = AGENT_RESPONSES.stuckEscalation;
        requiresHuman = true;
        outcome = "NEEDS_HUMAN";
        costControlReason = costControlReason ?? "STUCK_CONVERSATION_ESCALATED";
        newState.unproductiveTurns = 0;
      }
    }
  }
  newState.lastOutcome = outcome;

  return {
    replyText,
    outcome,
    conversationIntent,
    requiresHuman,
    closeConversation,
    productive: PRODUCTIVE_OUTCOMES.includes(outcome),
    costControlReason,
    newState,
  };
}

/**
 * Métricas de calidad del turno (Parte E). Se guardan en
 * conversation.metadata.qualityMetrics (último turno) — sin migración.
 */
export interface QualityMetrics {
  conversationIntent: ConversationIntent;
  outcome: ConversationOutcome;
  confidence: number;
  productive: boolean;
  requiresHuman: boolean;
  costControlReason: string | null;
  tokensSavedEstimate: number;
  appointmentCreated: boolean;
  quoteGenerated: boolean;
  catalogMatched: boolean;
  channel: string;
  at: string;
}

/**
 * Persiste el estado de calidad (y las métricas del turno, si vienen) en
 * conversation.metadata en una sola escritura. Tolerante a fallos: nunca
 * interrumpe la respuesta al cliente.
 */
export async function saveQualityState(
  conversationId: string,
  state: QualityState,
  metrics?: QualityMetrics
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const meta =
      conversation?.metadata &&
      typeof conversation.metadata === "object" &&
      !Array.isArray(conversation.metadata)
        ? { ...(conversation.metadata as Record<string, unknown>) }
        : {};
    meta.qualityState = { ...state };
    if (metrics) meta.qualityMetrics = { ...metrics };
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { metadata: meta as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.warn(`[QUALITY] no se pudo guardar qualityState (${conversationId}): ${String(err)}`);
  }
}

/** Cierra la conversación por control de calidad (tolerante a fallos). */
export async function closeConversationByQuality(
  conversationId: string,
  reason: string
): Promise<void> {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "CLOSED" },
    });
    logger.info(`[QUALITY] conversación cerrada por control de gasto (${reason}): ${conversationId}`);
  } catch (err) {
    logger.warn(`[QUALITY] no se pudo cerrar conversación ${conversationId}: ${String(err)}`);
  }
}
