import { prisma } from "../../config/prisma.js";
import { getOpenAIClient } from "../../config/openai.js";
import { AppError } from "../../middlewares/error.middleware.js";
import { runSalesAgent } from "../agent.service.js";
import { recordAiUsage } from "./ai-usage.service.js";
import type { AgentDecision, AiUsage } from "../../types/agent.types.js";

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
};

/**
 * Prueba un agente desde el panel/backend sin enviar nada por WhatsApp ni
 * crear conversación/cotización real. Reutiliza el mismo motor (runSalesAgent)
 * que usa producción, por lo que no duplica lógica de IA.
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
    include: { tenant: true },
  });

  if (!agent) throw new AppError("Agente no encontrado", 404);

  const runResult = await runSalesAgent({
    customerName: input.customerName ?? "Cliente de prueba",
    message: input.message,
    quoteNumber: null,
    conversationHistory: [],
    agentConfig: {
      systemPrompt: agent.systemPrompt,
      tone: agent.tone,
      openAiModel: agent.openAiModel,
      industry: agent.tenant?.industry,
      businessName: agent.tenant?.name,
    },
  });

  await recordAiUsage({
    tenantId: input.tenantId,
    agentId: agent.id,
    conversationId: null,
    operation: "AGENT_TEST",
    model: runResult.model,
    usage: runResult.usage,
    success: runResult.success,
    errorMessage: runResult.errorMessage,
  });

  // Si OpenAI falló durante la prueba, lo reportamos como error explícito
  // (a diferencia de WhatsApp, aquí sí queremos que el operador lo sepa).
  if (!runResult.success && runResult.errorMessage) {
    throw new AppError(`No se pudo generar la respuesta: ${runResult.errorMessage}`, 502);
  }

  return {
    agentId: agent.id,
    model: runResult.model,
    reply: runResult.decision.replyText,
    usage: runResult.usage,
    decision: runResult.decision,
  };
}
