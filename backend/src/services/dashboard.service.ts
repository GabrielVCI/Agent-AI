import { prisma } from "../config/prisma.js";
import { getRedisClient } from "../config/redis.js";

const CACHE_TTL = 60; // 1 minute cache

async function withCache<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const redis = getRedisClient();

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis no disponible — ejecutar sin caché
    return fn();
  }

  const result = await fn();
  try {
    await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL);
  } catch {
    // Redis no disponible — no se cachea, pero la respuesta es válida
  }
  return result;
}

function periodRange(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end };
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getDashboardSummary(tenantId: string) {
  return withCache(`dash:summary:${tenantId}`, async () => {
    const { start } = periodRange(30);
    const monthStart = startOfMonth();

    const [
      totalConversations,
      botActiveConversations,
      humanInterventions,
      closedConversations,
      totalQuotes,
      totalMessages,
      inboundMessages,
      outboundMessages,
      subscription,
      unansweredConversations,
    ] = await Promise.all([
      prisma.conversation.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      prisma.conversation.count({ where: { tenantId, status: "BOT_ACTIVE", createdAt: { gte: monthStart } } }),
      prisma.conversation.count({ where: { tenantId, status: "HUMAN_ACTIVE", createdAt: { gte: monthStart } } }),
      prisma.conversation.count({ where: { tenantId, status: "CLOSED", createdAt: { gte: monthStart } } }),
      prisma.quote.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      prisma.message.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      prisma.message.count({ where: { tenantId, direction: "INBOUND", createdAt: { gte: monthStart } } }),
      prisma.message.count({ where: { tenantId, direction: "OUTBOUND", createdAt: { gte: monthStart } } }),
      prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
      prisma.conversation.count({
        where: {
          tenantId,
          status: { in: ["BOT_ACTIVE", "OPEN"] },
          lastMessageAt: { lt: new Date(Date.now() - 60 * 60 * 1000) }, // > 1h without response
        },
      }),
    ]);

    const humanInterventionRate =
      totalConversations > 0
        ? ((humanInterventions / totalConversations) * 100).toFixed(1)
        : "0.0";

    const aiResolvedRate =
      totalConversations > 0
        ? ((closedConversations / totalConversations) * 100).toFixed(1)
        : "0.0";

    return {
      period: "month",
      totalConversations,
      botActiveConversations,
      humanInterventions,
      closedConversations,
      unansweredConversations,
      totalQuotes,
      totalMessages,
      inboundMessages,
      outboundMessages,
      humanInterventionRate: `${humanInterventionRate}%`,
      aiResolvedRate: `${aiResolvedRate}%`,
      planUsage: subscription
        ? {
            conversationsUsed: totalConversations,
            conversationsLimit: subscription.plan.maxMonthlyConversations,
            quotesUsed: totalQuotes,
            quotesLimit: subscription.plan.maxMonthlyQuotes,
            planName: subscription.plan.name,
            status: subscription.status,
          }
        : null,
    };
  });
}

export async function getDashboardByPhone(tenantId: string) {
  return withCache(`dash:byphone:${tenantId}`, async () => {
    const monthStart = startOfMonth();

    const agents = await prisma.agent.findMany({
      where: { tenantId, whatsappPhoneNumberId: { not: null } },
    });

    const result = await Promise.all(
      agents.map(async (agent) => {
        const [
          conversations,
          messages,
          inbound,
          outbound,
          humanActive,
          closed,
          quotes,
          unanswered,
        ] = await Promise.all([
          prisma.conversation.count({
            where: { tenantId, agentId: agent.id, createdAt: { gte: monthStart } },
          }),
          prisma.message.count({
            where: {
              tenantId,
              createdAt: { gte: monthStart },
              conversation: { agentId: agent.id },
            },
          }),
          prisma.message.count({
            where: {
              tenantId,
              direction: "INBOUND",
              createdAt: { gte: monthStart },
              conversation: { agentId: agent.id },
            },
          }),
          prisma.message.count({
            where: {
              tenantId,
              direction: "OUTBOUND",
              createdAt: { gte: monthStart },
              conversation: { agentId: agent.id },
            },
          }),
          prisma.conversation.count({
            where: { tenantId, agentId: agent.id, status: "HUMAN_ACTIVE" },
          }),
          prisma.conversation.count({
            where: { tenantId, agentId: agent.id, status: "CLOSED", createdAt: { gte: monthStart } },
          }),
          prisma.quote.count({
            where: { tenantId, agentId: agent.id, createdAt: { gte: monthStart } },
          }),
          prisma.conversation.count({
            where: {
              tenantId,
              agentId: agent.id,
              status: { in: ["BOT_ACTIVE", "OPEN"] },
              lastMessageAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
            },
          }),
        ]);

        const conversionRate =
          conversations > 0 ? ((quotes / conversations) * 100).toFixed(1) : "0.0";

        return {
          agentId: agent.id,
          agentName: agent.name,
          phoneNumberId: agent.whatsappPhoneNumberId,
          displayPhone: agent.whatsappDisplayPhone,
          conversations,
          messagesTotal: messages,
          messagesInbound: inbound,
          messagesOutbound: outbound,
          humanInterventions: humanActive,
          closedByAI: closed,
          quotesCreated: quotes,
          unanswered,
          conversionRate: `${conversionRate}%`,
        };
      })
    );

    return result;
  });
}

export async function getAgentPerformance(tenantId: string) {
  return withCache(`dash:agents:${tenantId}`, async () => {
    const monthStart = startOfMonth();

    const agents = await prisma.agent.findMany({ where: { tenantId } });

    return Promise.all(
      agents.map(async (agent) => {
        const [conversations, closed, humanActive, quotes, messages] = await Promise.all([
          prisma.conversation.count({
            where: { tenantId, agentId: agent.id, createdAt: { gte: monthStart } },
          }),
          prisma.conversation.count({
            where: { tenantId, agentId: agent.id, status: "CLOSED", createdAt: { gte: monthStart } },
          }),
          prisma.conversation.count({
            where: { tenantId, agentId: agent.id, status: "HUMAN_ACTIVE" },
          }),
          prisma.quote.count({
            where: { tenantId, agentId: agent.id, createdAt: { gte: monthStart } },
          }),
          prisma.message.count({
            where: {
              tenantId,
              createdAt: { gte: monthStart },
              conversation: { agentId: agent.id },
            },
          }),
        ]);

        return {
          agentId: agent.id,
          agentName: agent.name,
          type: agent.type,
          status: agent.status,
          conversations,
          closedByAI: closed,
          humanInterventions: humanActive,
          quotesCreated: quotes,
          totalMessages: messages,
        };
      })
    );
  });
}

export async function getHumanInterventionsMetrics(tenantId: string) {
  return withCache(`dash:handoffs:${tenantId}`, async () => {
    const monthStart = startOfMonth();

    const handoffs = await prisma.humanHandoff.findMany({
      where: { tenantId, createdAt: { gte: monthStart } },
      include: { conversation: { select: { agentId: true, agent: { select: { name: true } } } } },
    });

    const total = handoffs.length;
    const resolved = handoffs.filter((h) => h.status === "RESOLVED").length;
    const open = handoffs.filter((h) => h.status === "OPEN").length;
    const assigned = handoffs.filter((h) => h.status === "ASSIGNED").length;

    const avgResolutionTime =
      handoffs
        .filter((h) => h.resolvedAt)
        .reduce((sum, h) => {
          return sum + (h.resolvedAt!.getTime() - h.createdAt.getTime());
        }, 0) / Math.max(resolved, 1);

    return {
      total,
      resolved,
      open,
      assigned,
      avgResolutionTimeMs: Math.round(avgResolutionTime),
      avgResolutionTimeMinutes: Math.round(avgResolutionTime / 60000),
    };
  });
}

export async function getQuotesMetrics(tenantId: string) {
  return withCache(`dash:quotes:${tenantId}`, async () => {
    const monthStart = startOfMonth();

    const quotes = await prisma.quote.findMany({
      where: { tenantId, createdAt: { gte: monthStart } },
      include: { lines: true, customer: true },
    });

    const totalCreated = quotes.length;
    const totalValue = quotes.reduce((sum, q) => sum + Number(q.total.toString()), 0);
    const averageValue = totalCreated > 0 ? totalValue / totalCreated : 0;
    const withPdf = quotes.filter((q) => q.pdfUrl).length;

    const customerCounts = quotes.reduce<Record<string, { name: string | null; count: number }>>(
      (acc, q) => {
        const id = q.customerId;
        if (!acc[id]) acc[id] = { name: q.customer.name, count: 0 };
        acc[id].count++;
        return acc;
      },
      {}
    );

    const topCustomers = Object.entries(customerCounts)
      .map(([id, data]) => ({ customerId: id, name: data.name, quotes: data.count }))
      .sort((a, b) => b.quotes - a.quotes)
      .slice(0, 5);

    return {
      totalCreated,
      totalValue: Math.round(totalValue * 100) / 100,
      averageValue: Math.round(averageValue * 100) / 100,
      withPdf,
      topCustomers,
    };
  });
}

export async function getActivityMetrics(tenantId: string) {
  return withCache(`dash:activity:${tenantId}`, async () => {
    const { start } = periodRange(30);

    // Conversations per day (last 30 days)
    const conversations = await prisma.conversation.findMany({
      where: { tenantId, createdAt: { gte: start } },
      select: { createdAt: true },
    });

    const byDay: Record<string, number> = {};
    for (const c of conversations) {
      const day = c.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }

    // Hour distribution
    const messages = await prisma.message.findMany({
      where: { tenantId, direction: "INBOUND", createdAt: { gte: start } },
      select: { createdAt: true },
    });

    const byHour: Record<number, number> = {};
    for (const m of messages) {
      const h = m.createdAt.getHours();
      byHour[h] = (byHour[h] ?? 0) + 1;
    }

    const peakHour = Object.entries(byHour).sort(([, a], [, b]) => b - a)[0];
    const peakDay = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];

    return {
      conversationsByDay: byDay,
      messagesByHour: byHour,
      peakHour: peakHour ? { hour: Number(peakHour[0]), messages: peakHour[1] } : null,
      peakDay: peakDay ? { date: peakDay[0], conversations: peakDay[1] } : null,
    };
  });
}

export async function getCustomerMetrics(tenantId: string) {
  return withCache(`dash:customers:${tenantId}`, async () => {
    const monthStart = startOfMonth();

    const [totalCustomers, newCustomers, recurringCustomers] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      prisma.customer.count({
        where: {
          tenantId,
          conversations: { some: { createdAt: { gte: monthStart } } },
          createdAt: { lt: monthStart },
        },
      }),
    ]);

    const topByMessages = await prisma.customer.findMany({
      where: { tenantId },
      include: {
        _count: { select: { conversations: true, quotes: true } },
      },
      orderBy: { conversations: { _count: "desc" } },
      take: 5,
    });

    return {
      totalCustomers,
      newThisMonth: newCustomers,
      recurringThisMonth: recurringCustomers,
      topByActivity: topByMessages.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        conversations: c._count.conversations,
        quotes: c._count.quotes,
      })),
    };
  });
}

export async function getUsageMetrics(tenantId: string) {
  return withCache(`dash:usage:${tenantId}`, async () => {
    const monthStart = startOfMonth();

    const [subscription, conversations, quotes, messages] = await Promise.all([
      prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      }),
      prisma.conversation.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      prisma.quote.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
      prisma.message.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    ]);

    if (!subscription) return { hasSubscription: false };

    const { plan } = subscription;

    return {
      hasSubscription: true,
      planName: plan.name,
      subscriptionStatus: subscription.status,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      usage: {
        conversations: {
          used: conversations,
          limit: plan.maxMonthlyConversations,
          pct: Math.round((conversations / plan.maxMonthlyConversations) * 100),
        },
        quotes: {
          used: quotes,
          limit: plan.maxMonthlyQuotes,
          pct: Math.round((quotes / plan.maxMonthlyQuotes) * 100),
        },
        messages: { used: messages },
      },
    };
  });
}

export async function getDashboardAlerts(tenantId: string) {
  const [summary, usage, byPhone, agentPerf] = await Promise.all([
    getDashboardSummary(tenantId),
    getUsageMetrics(tenantId),
    getDashboardByPhone(tenantId),
    getAgentPerformance(tenantId),
  ]);

  const alerts: Array<{ type: string; level: "info" | "warning" | "critical"; message: string }> = [];

  if (summary.unansweredConversations > 0) {
    alerts.push({
      type: "unanswered",
      level: summary.unansweredConversations >= 5 ? "critical" : "warning",
      message: `Tienes ${summary.unansweredConversations} conversación(es) sin responder.`,
    });
  }

  if (summary.humanInterventions > 0) {
    alerts.push({
      type: "human_active",
      level: "info",
      message: `Tienes ${summary.humanInterventions} conversación(es) tomadas por humanos.`,
    });
  }

  if (usage && "usage" in usage) {
    const u = usage as any;
    if (u.usage.conversations.pct >= 80) {
      alerts.push({
        type: "plan_limit",
        level: u.usage.conversations.pct >= 95 ? "critical" : "warning",
        message: `Has usado el ${u.usage.conversations.pct}% de tu límite mensual de conversaciones.`,
      });
    }
    if (u.usage.quotes.pct >= 80) {
      alerts.push({
        type: "plan_limit",
        level: u.usage.quotes.pct >= 95 ? "critical" : "warning",
        message: `Has usado el ${u.usage.quotes.pct}% de tu límite mensual de cotizaciones.`,
      });
    }
  }

  // Agent with most load
  const busiest = (agentPerf as any[]).sort((a, b) => b.conversations - a.conversations)[0];
  if (busiest && busiest.conversations > 0) {
    alerts.push({
      type: "agent_load",
      level: "info",
      message: `El agente "${busiest.agentName}" tiene la mayor carga (${busiest.conversations} conversaciones).`,
    });
  }

  // Phone with high human intervention rate
  for (const phone of byPhone as any[]) {
    const rate = parseFloat(phone.conversionRate);
    if (phone.humanInterventions > 3) {
      alerts.push({
        type: "phone_human_rate",
        level: "warning",
        message: `El número "${phone.displayPhone ?? phone.phoneNumberId}" tiene ${phone.humanInterventions} intervenciones humanas activas.`,
      });
    }
  }

  return alerts;
}
