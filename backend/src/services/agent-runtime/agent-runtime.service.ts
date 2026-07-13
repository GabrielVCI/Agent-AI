import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { runSalesAgent, saveAgentLog } from "../agent.service.js";
import { executeAgentActions } from "../agent-action.service.js";
import { recordAiUsage } from "../ai/ai-usage.service.js";
import { recordTokenUsage } from "../billing.service.js";
import { buildRuntimeContext } from "./agent-context.service.js";
import type { AgentChannel } from "./agent-prompt.builder.js";
import {
  closeConversationByQuality,
  evaluateDecisionQuality,
  loadQualityState,
  precheckCustomerMessage,
  saveQualityState,
  type QualityMetrics,
  type QualityState,
} from "./agent-quality.service.js";
import type {
  AgentDecision,
  AiUsage,
  ConversationIntent,
  ConversationOutcome,
} from "../../types/agent.types.js";
import type { TrainingConfig } from "../../types/training.types.js";

/**
 * Runtime IA unificado de Sendwary.
 *
 * Un único punto de entrada para TODOS los canales (WhatsApp real y prueba
 * interna del panel):
 *   precheck de calidad SIN tokens (spam/número equivocado obvios se cortan)
 *   → contexto verificado (catálogo + documentos + disponibilidad)
 *   → decisión estructurada del modelo (runSalesAgent, JSON schema estricto)
 *   → veredicto de calidad (off-topic/spam/vueltas sin avance → cortar/escalar)
 *   → ejecución validada de acciones en backend (agent-action.service)
 *   → registro de uso de tokens y métricas de calidad (sin migración).
 *
 * La IA nunca ejecuta nada directamente: solo emite una decisión que el
 * backend valida contra la base de datos antes de actuar.
 */

export interface AgentRuntimeMessage {
  direction: string;
  senderType: string;
  content: string;
}

export interface AgentRuntimeInput {
  tenantId: string;
  agentId?: string | null;
  conversationId?: string | null;
  customerMessage: string;
  customerName?: string | null;
  customerPhone?: string | null;
  source: "WHATSAPP" | "TEST";
  channel?: AgentChannel;
  /** Cotización activa (solo flujo WhatsApp); sin ella se omiten acciones de cotización. */
  quoteId?: string | null;
  quoteNumber?: string | null;
  conversationHistory?: AgentRuntimeMessage[];
  /**
   * Config del agente ya cargada (el webhook la resuelve al rutear el número).
   * Si se omite y hay agentId, el runtime la carga de la BD.
   */
  agentConfig?: {
    systemPrompt?: string | null;
    tone?: string | null;
    openAiModel?: string | null;
    industry?: string | null;
    businessName?: string | null;
    trainingConfig?: TrainingConfig | null;
  } | null;
  /** true = no persistir efectos (prueba interna): las acciones se describen, no se ejecutan. */
  dryRun?: boolean;
}

export interface RuntimeAction {
  type: string;
  executed: boolean;
  detail: string;
}

export interface AgentRuntimeResult {
  replyText: string;
  model: string;
  usage: AiUsage;
  decision: AgentDecision;
  actions: RuntimeAction[];
  requiresHuman: boolean;
  confidence: number;
  success: boolean;
  usedFallback: boolean;
  errorMessage?: string | null;
  // ── Clasificación y control de gasto (Partes B, C y E) ──
  conversationIntent: ConversationIntent;
  outcome: ConversationOutcome;
  productive: boolean;
  costControlReason: string | null;
  tokensSavedEstimate: number;
  /** true = la conversación se cerró (o se cerraría) por control de calidad. */
  closeConversation: boolean;
  /** true = no enviar nada al cliente (silencio deliberado, cero gasto extra). */
  skipReply: boolean;
  appointmentCreated: boolean;
  quoteGenerated: boolean;
  catalogMatched: boolean;
  // Artefactos de acciones (PDF de cotización) para que el canal los envíe
  pdfUrl: string | null;
  pdfPath: string | null;
  pdfFilename: string | null;
}

async function loadAgentConfig(tenantId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, tenantId },
    include: { tenant: true },
  });
  if (!agent) return null;
  return {
    systemPrompt: agent.systemPrompt,
    tone: agent.tone,
    openAiModel: agent.openAiModel,
    industry: agent.tenant?.industry,
    businessName: agent.tenant?.name,
    trainingConfig:
      (agent.tenant?.trainingConfig as unknown as TrainingConfig | null) ?? undefined,
  };
}

/** Descripción legible de lo que la decisión implica (para dry-run y auditoría). */
function describeDecisionActions(decision: AgentDecision, executed: boolean): RuntimeAction[] {
  const actions: RuntimeAction[] = [];

  if (decision.intent === "SEARCH_PRODUCT" || decision.intent === "ASK_PRICE") {
    actions.push({
      type: "SEARCH_CATALOG",
      executed,
      detail: decision.productRequests.map((p) => p.normalizedText).join(", ") || "consulta de catálogo",
    });
  }
  if (decision.intent === "ADD_TO_QUOTE") {
    actions.push({
      type: "ADD_TO_QUOTE",
      executed,
      detail: decision.productRequests
        .map((p) => `${p.quantity} ${p.unit || ""} ${p.normalizedText}`.trim())
        .join(", "),
    });
  }
  if (decision.intent === "GENERATE_QUOTE" || decision.actions.some((a) => a.type === "GENERATE_PDF")) {
    actions.push({ type: "GENERATE_QUOTE_PDF", executed, detail: "cotización en PDF" });
  }
  if (decision.intent === "SCHEDULE_APPOINTMENT") {
    const req = decision.appointmentRequest;
    const parts = [
      req?.customerName && `nombre: ${req.customerName}`,
      req?.serviceText && `servicio: ${req.serviceText}`,
      req?.dateTimeText && `fecha: ${req.dateTimeText}`,
    ].filter(Boolean);
    actions.push({
      type: "CREATE_APPOINTMENT",
      executed,
      detail: parts.length ? parts.join(" | ") : "faltan datos: se pregunta al cliente",
    });
  }
  if (decision.requiresHuman || decision.intent === "HUMAN_HANDOFF") {
    actions.push({ type: "REQUEST_HUMAN", executed, detail: "escalado a asesor humano" });
  }
  if (actions.length === 0) {
    actions.push({
      type: decision.intent === "UNKNOWN" ? "ASK_CLARIFICATION" : "ANSWER",
      executed,
      detail: "respuesta directa con el contexto disponible",
    });
  }
  return actions;
}

const ZERO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/** Razones de precheck que cuentan como strike de spam/insulto. */
const SPAM_STRIKE_REASONS = new Set([
  "SPAM_DETECTED",
  "SPAM_REPEATED_SILENCED",
  "INSULT_ESCALATED",
]);

function buildQualityMetrics(input: {
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
}): QualityMetrics {
  return { ...input, at: new Date().toISOString() };
}

export async function runAgentRuntime(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
  const dryRun = input.dryRun ?? false;
  const channel: AgentChannel =
    input.channel ?? (input.source === "TEST" ? "test" : "whatsapp_text");

  // 0) Estado de calidad de la conversación (metadata JSON, sin migración)
  let qualityState: QualityState = loadQualityState(null);
  if (input.conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { metadata: true },
    });
    qualityState = loadQualityState(conversation?.metadata);
  }

  // 1) PRECHECK sin tokens: número equivocado / spam / insultos obvios se
  //    resuelven por reglas y NO llegan a OpenAI (Parte C: control de gasto).
  const precheck = precheckCustomerMessage(input.customerMessage, qualityState);
  if (precheck.action === "SKIP_MODEL") {
    const newState: QualityState = {
      ...qualityState,
      spamStrikes: SPAM_STRIKE_REASONS.has(precheck.costControlReason)
        ? qualityState.spamStrikes + 1
        : qualityState.spamStrikes,
      lastOutcome: precheck.outcome,
    };
    const productive = false;
    const metrics = buildQualityMetrics({
      conversationIntent: precheck.conversationIntent,
      outcome: precheck.outcome,
      confidence: 1,
      productive,
      requiresHuman: precheck.requiresHuman,
      costControlReason: precheck.costControlReason,
      tokensSavedEstimate: precheck.tokensSavedEstimate,
      appointmentCreated: false,
      quoteGenerated: false,
      catalogMatched: false,
      channel,
    });

    if (!dryRun && input.conversationId) {
      await saveQualityState(input.conversationId, newState, metrics);
      if (precheck.closeConversation) {
        await closeConversationByQuality(input.conversationId, precheck.costControlReason);
      }
    }

    logger.info(
      `[RUNTIME] precheck cortó el turno sin llamar al modelo (${precheck.costControlReason}) tenant=${input.tenantId}`
    );

    // Decisión sintética para trazabilidad (mismo shape que las del modelo).
    const decision: AgentDecision = {
      intent: precheck.requiresHuman ? "HUMAN_HANDOFF" : "UNKNOWN",
      replyText: precheck.replyText,
      productRequests: [],
      actions: precheck.requiresHuman
        ? [{ type: "HANDOFF", payload: { reason: precheck.costControlReason } }]
        : [{ type: "NONE", payload: {} }],
      requiresHuman: precheck.requiresHuman,
      confidence: 1,
      conversationIntent: precheck.conversationIntent,
      outcome: precheck.outcome,
    };

    return {
      replyText: precheck.replyText,
      model: "rule-precheck",
      usage: ZERO_USAGE,
      decision,
      actions: [
        {
          type: "COST_CONTROL",
          executed: !dryRun,
          detail: `corte por reglas (${precheck.costControlReason}), ~${precheck.tokensSavedEstimate} tokens ahorrados`,
        },
      ],
      requiresHuman: precheck.requiresHuman,
      confidence: 1,
      success: true,
      usedFallback: false,
      errorMessage: null,
      conversationIntent: precheck.conversationIntent,
      outcome: precheck.outcome,
      productive,
      costControlReason: precheck.costControlReason,
      tokensSavedEstimate: precheck.tokensSavedEstimate,
      closeConversation: precheck.closeConversation,
      skipReply: precheck.replyText.trim() === "",
      appointmentCreated: false,
      quoteGenerated: false,
      catalogMatched: false,
      pdfUrl: null,
      pdfPath: null,
      pdfFilename: null,
    };
  }

  // 2) Config del agente (preloaded o desde BD)
  let agentConfig = input.agentConfig ?? null;
  if (!agentConfig && input.agentId) {
    agentConfig = await loadAgentConfig(input.tenantId, input.agentId);
  }
  const businessName = agentConfig?.businessName ?? "el negocio";

  // 3) Contexto verificado del negocio para ESTE mensaje
  const { extraContext } = await buildRuntimeContext({
    tenantId: input.tenantId,
    agentId: input.agentId ?? null,
    customerMessage: input.customerMessage,
  });

  // 4) Decisión estructurada del modelo (el canal ajusta el prompt)
  const runResult = await runSalesAgent({
    customerName: input.customerName,
    message: input.customerMessage,
    quoteNumber: input.quoteNumber ?? null,
    conversationHistory: input.conversationHistory ?? [],
    agentConfig: agentConfig ?? undefined,
    extraContext,
    channel,
  });

  const decision = runResult.decision;

  // 5) Veredicto de calidad: aplica la política de conversaciones
  //    improductivas sobre la clasificación del modelo (Parte C).
  const verdict = evaluateDecisionQuality({
    decision,
    state: qualityState,
    businessName,
  });

  // 6) Registro de consumo: métrica de dashboard + contador de billing
  await recordTokenUsage(input.tenantId, runResult.usage);
  await recordAiUsage({
    tenantId: input.tenantId,
    agentId: input.agentId ?? null,
    conversationId: input.conversationId ?? null,
    operation: input.source === "TEST" ? "AGENT_TEST" : "AGENT_REPLY",
    model: runResult.model,
    usage: runResult.usage,
    success: runResult.success,
    errorMessage: runResult.errorMessage,
  });

  // 7) Ejecución de acciones — solo si el veredicto no cortó la conversación
  //    (no se genera cotización ni cita para un turno spam/off-topic).
  const blockedByQuality =
    verdict.costControlReason !== null ||
    verdict.closeConversation ||
    verdict.outcome === "SPAM" ||
    verdict.outcome === "WRONG_NUMBER" ||
    verdict.outcome === "NOT_RELATED";

  let replyText = verdict.replyText;
  let pdfUrl: string | null = null;
  let pdfPath: string | null = null;
  let pdfFilename: string | null = null;
  let appointmentCreated = false;
  let quoteGenerated = false;
  let catalogMatched = false;

  if (!dryRun && input.conversationId && input.quoteId && !blockedByQuality) {
    await saveAgentLog({
      tenantId: input.tenantId,
      agentId: input.agentId ?? undefined,
      conversationId: input.conversationId,
      userInput: input.customerMessage,
      decision,
    });

    const actionResult = await executeAgentActions({
      decision,
      quoteId: input.quoteId,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
    });

    replyText = actionResult.replyText;
    pdfUrl = actionResult.pdfUrl;
    pdfPath = actionResult.pdfPath;
    pdfFilename = actionResult.pdfFilename;
    appointmentCreated = actionResult.appointmentCreated;
    quoteGenerated = actionResult.quoteGenerated;
    catalogMatched = actionResult.catalogMatched;
  } else if (!dryRun && !blockedByQuality) {
    logger.warn(
      `[RUNTIME] ejecución de acciones omitida (conversationId/quoteId faltante) tenant=${input.tenantId}`
    );
  }

  // Un turno con gestión real (cita/cotización/catálogo) siempre cuenta como
  // productivo, gane lo que gane la clasificación del modelo.
  const productive = verdict.productive || appointmentCreated || quoteGenerated || catalogMatched;

  // 8) Persistir estado + métricas de calidad; cerrar si el veredicto lo pide
  if (!dryRun && input.conversationId) {
    const metrics = buildQualityMetrics({
      conversationIntent: verdict.conversationIntent,
      outcome: verdict.outcome,
      confidence: decision.confidence,
      productive,
      requiresHuman: verdict.requiresHuman,
      costControlReason: verdict.costControlReason,
      tokensSavedEstimate: 0,
      appointmentCreated,
      quoteGenerated,
      catalogMatched,
      channel,
    });
    await saveQualityState(input.conversationId, verdict.newState, metrics);
    if (verdict.closeConversation) {
      await closeConversationByQuality(
        input.conversationId,
        verdict.costControlReason ?? verdict.outcome
      );
    }
  }

  const actions = describeDecisionActions(decision, !dryRun && !blockedByQuality);
  if (verdict.costControlReason) {
    actions.push({
      type: "COST_CONTROL",
      executed: !dryRun,
      detail: `política de conversaciones improductivas (${verdict.costControlReason})`,
    });
  }

  return {
    replyText,
    model: runResult.model,
    usage: runResult.usage,
    decision,
    actions,
    requiresHuman: verdict.requiresHuman,
    confidence: decision.confidence,
    success: runResult.success,
    usedFallback: runResult.usedFallback,
    errorMessage: runResult.errorMessage,
    conversationIntent: verdict.conversationIntent,
    outcome: verdict.outcome,
    productive,
    costControlReason: verdict.costControlReason,
    tokensSavedEstimate: 0,
    closeConversation: verdict.closeConversation,
    skipReply: replyText.trim() === "",
    appointmentCreated,
    quoteGenerated,
    catalogMatched,
    pdfUrl,
    pdfPath,
    pdfFilename,
  };
}
