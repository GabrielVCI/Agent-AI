import { prisma } from "../config/prisma.js";
import type { MetricType } from "@prisma/client";

export async function recordMetric(input: {
  tenantId: string;
  agentId?: string;
  metricType: MetricType;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  return prisma.usageMetric.create({
    data: {
      tenantId: input.tenantId,
      agentId: input.agentId ?? null,
      metricType: input.metricType,
      quantity: input.quantity ?? 1,
      metadata: input.metadata ? (input.metadata as any) : undefined,
    },
  });
}
