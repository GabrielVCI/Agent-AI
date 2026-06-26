import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { AppError } from "./error.middleware.js";

type LimitType = "agents" | "conversations" | "quotes";

async function getTenantPlanUsage(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });

  if (!subscription || subscription.status === "CANCELLED") {
    return null;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [agentCount, monthlyConversations, monthlyQuotes] = await Promise.all([
    prisma.agent.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.conversation.count({
      where: { tenantId, createdAt: { gte: startOfMonth } },
    }),
    prisma.quote.count({
      where: { tenantId, createdAt: { gte: startOfMonth } },
    }),
  ]);

  return {
    plan: subscription.plan,
    usage: { agentCount, monthlyConversations, monthlyQuotes },
  };
}

export function checkPlanLimit(limitType: LimitType) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || req.user.role === "SUPER_ADMIN") {
      next();
      return;
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      next(new AppError("Usuario no asociado a ninguna empresa", 403));
      return;
    }

    try {
      const data = await getTenantPlanUsage(tenantId);

      if (!data) {
        next(new AppError("No tienes una suscripción activa", 403));
        return;
      }

      const { plan, usage } = data;

      switch (limitType) {
        case "agents":
          if (usage.agentCount >= plan.maxAgents) {
            next(
              new AppError(
                `Límite de agentes alcanzado (${plan.maxAgents}). Actualiza tu plan para crear más.`,
                403
              )
            );
            return;
          }
          break;

        case "conversations":
          if (usage.monthlyConversations >= plan.maxMonthlyConversations) {
            next(
              new AppError(
                `Límite mensual de conversaciones alcanzado (${plan.maxMonthlyConversations}).`,
                403
              )
            );
            return;
          }
          break;

        case "quotes":
          if (usage.monthlyQuotes >= plan.maxMonthlyQuotes) {
            next(
              new AppError(
                `Límite mensual de cotizaciones alcanzado (${plan.maxMonthlyQuotes}).`,
                403
              )
            );
            return;
          }
          break;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
