import { prisma } from "../../config/prisma.js";
import { getOpenAIClient } from "../../config/openai.js";
import { AppError } from "../../middlewares/error.middleware.js";
import {
  runAgentRuntime,
  type RuntimeAction,
} from "../agent-runtime/agent-runtime.service.js";
import type {
  AgentDecision,
  AiUsage,
  ConversationIntent,
  ConversationOutcome,
} from "../../types/agent.types.js";

export type TestAgentInput = {
  agentId: string;
  tenantId: string;
  message: string;
  customerName?: string;
  context?: Record<string, unknown>;
};

export type TestAgentResult = {
  agentId: string;
  model: string;
  reply: string;
  usage: AiUsage;
  decision: AgentDecision;
  /** Acciones que la decisión implicaría (dry-run: descritas, no ejecutadas). */
  actions: RuntimeAction[];
  // ── Clasificación y control de gasto (visibles en el panel de prueba) ──
  conversationIntent: ConversationIntent;
  outcome: ConversationOutcome;
  confidence: number;
  requiresHuman: boolean;
  costControlReason: string | null;
};

/**
 * Prueba un agente desde el panel sin enviar nada por WhatsApp ni persistir
 * efectos (dryRun). Usa EXACTAMENTE el mismo runtime que producción, por lo
 * que la respuesta incluye catálogo, documentos y disponibilidad reales.
 */
export async function testAgent(input: TestAgentInput): Promise<TestAgentResult> {
  // Falla claro si no hay API key: probar un agente exige IA real.
  if (!getOpenAIClient()) {
    throw new AppError(
      "OPENAI_API_KEY no está configurada en el servidor. No se puede probar el agente.",
      503
    );
  }

  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, tenantId: input.tenantId },
  });
  if (!agent) throw new AppError("Agente no encontrado", 404);

  const runtime = await runAgentRuntime({
    tenantId: input.tenantId,
    agentId: agent.id,
    conversationId: null,
    customerMessage: input.message,
    customerName: input.customerName ?? "Cliente de prueba",
    source: "TEST",
    channel: "test",
    dryRun: true,
  });

  // Si OpenAI falló durante la prueba, lo reportamos como error explícito
  // (a diferencia de WhatsApp, aquí sí queremos que el operador lo sepa).
  if (!runtime.success && runtime.errorMessage) {
    throw new AppError(`No se pudo generar la respuesta: ${runtime.errorMessage}`, 502);
  }

  return {
    agentId: agent.id,
    model: runtime.model,
    reply: runtime.replyText,
    usage: runtime.usage,
    decision: runtime.decision,
    actions: runtime.actions,
    conversationIntent: runtime.conversationIntent,
    outcome: runtime.outcome,
    confidence: runtime.confidence,
    requiresHuman: runtime.requiresHuman,
    costControlReason: runtime.costControlReason,
  };
}
