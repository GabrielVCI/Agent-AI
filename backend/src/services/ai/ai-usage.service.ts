import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import type { AiUsage } from "../../types/agent.types.js";

export type AiOperation = "AGENT_REPLY" | "AGENT_TEST";

/**
 * Extrae los tokens de la respuesta de OpenAI (chat.completions).
 * Devuelve ceros si OpenAI no reportó uso.
 */
export function extractUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} | null): AiUsage {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

type RecordAiUsageInput = {
  tenantId: string;
  agentId?: string | null;
  conversationId?: string | null;
  operation: AiOperation;
  model: string;
  usage: AiUsage;
  success: boolean;
  errorMessage?: string | null;
};

/**
 * Registra una métrica de uso de IA. Reutiliza el modelo UsageMetric existente
 * (metricType AI_REPLY) y guarda el detalle de tokens/operación en `metadata`,
 * por lo que NO requiere migración de schema.
 *
 * Es deliberadamente tolerante a fallos: si el registro de métricas falla,
 * se loguea pero nunca interrumpe el flujo de respuesta al cliente.
 */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<void> {
  try {
    await prisma.usageMetric.create({
      data: {
        tenantId: input.tenantId,
        agentId: input.agentId ?? null,
        metricType: "AI_REPLY",
        quantity: 1,
        metadata: {
          operation: input.operation,
          model: input.model,
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          totalTokens: input.usage.totalTokens,
          success: input.success,
          errorMessage: input.errorMessage ?? null,
          conversationId: input.conversationId ?? null,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.error("[aiUsage] No se pudo registrar la métrica de uso de IA:", error);
  }
}
