import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type { AiUsage } from "../types/agent.types.js";

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;

/**
 * Medición y control de consumo por plan.
 *
 * Decisión de conteo (documentada en README): "mensajes procesados" =
 * cada inbound de cliente que entra a la plataforma (1) + cada outbound
 * enviado por la plataforma, automático o manual (1). El límite comercial
 * (`Plan.monthlyMessageLimit`) compara contra el total del mes calendario.
 * Los tokens de OpenAI se registran aparte como límite técnico opcional
 * (`Plan.monthlyTokenLimit`).
 *
 * La idempotencia de inbound la garantiza el webhook de WhatsApp (dedupe por
 * whatsappMessageId antes de llegar aquí): este módulo solo suma dentro del
 * flujo ya deduplicado.
 */

// ─── Periodo (mes calendario, UTC) ───────────────────────────────────────────

export function getCurrentPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

// ─── Registro de consumo ─────────────────────────────────────────────────────

export interface UsageBump {
  inboundMessages?: number;
  outboundMessages?: number;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  audioTranscriptionSeconds?: number;
}

/**
 * Incrementa el contador del periodo actual de forma atómica (upsert +
 * increment). Tolerante a fallos: el conteo jamás tumba el flujo de mensajes.
 */
export async function bumpUsage(tenantId: string, bump: UsageBump): Promise<void> {
  const { start, end } = getCurrentPeriod();
  const inbound = bump.inboundMessages ?? 0;
  const outbound = bump.outboundMessages ?? 0;
  const inputTokens = bump.aiInputTokens ?? 0;
  const outputTokens = bump.aiOutputTokens ?? 0;
  const audioSeconds = bump.audioTranscriptionSeconds ?? 0;

  try {
    await prisma.usageCounter.upsert({
      where: { tenantId_periodStart: { tenantId, periodStart: start } },
      create: {
        tenantId,
        periodStart: start,
        periodEnd: end,
        inboundMessages: inbound,
        outboundMessages: outbound,
        totalMessages: inbound + outbound,
        aiInputTokens: inputTokens,
        aiOutputTokens: outputTokens,
        aiTotalTokens: inputTokens + outputTokens,
        audioTranscriptionSeconds: audioSeconds,
      },
      update: {
        inboundMessages: { increment: inbound },
        outboundMessages: { increment: outbound },
        totalMessages: { increment: inbound + outbound },
        aiInputTokens: { increment: inputTokens },
        aiOutputTokens: { increment: outputTokens },
        aiTotalTokens: { increment: inputTokens + outputTokens },
        audioTranscriptionSeconds: { increment: audioSeconds },
      },
    });
  } catch (err) {
    logger.error(`[BILLING] no se pudo registrar consumo tenant=${tenantId}: ${String(err)}`);
  }
}

export async function recordTokenUsage(tenantId: string, usage: AiUsage): Promise<void> {
  if (usage.totalTokens <= 0) return;
  await bumpUsage(tenantId, {
    aiInputTokens: usage.inputTokens,
    aiOutputTokens: usage.outputTokens,
  });
}

// ─── Lectura de uso y allowance ──────────────────────────────────────────────

const EMPTY_USAGE = {
  inboundMessages: 0,
  outboundMessages: 0,
  totalMessages: 0,
  aiInputTokens: 0,
  aiOutputTokens: 0,
  aiTotalTokens: 0,
  audioTranscriptionSeconds: 0,
};

export async function getPeriodUsage(tenantId: string) {
  const { start, end } = getCurrentPeriod();
  const counter = await prisma.usageCounter.findUnique({
    where: { tenantId_periodStart: { tenantId, periodStart: start } },
  });
  return {
    periodStart: start,
    periodEnd: end,
    ...(counter
      ? {
          inboundMessages: counter.inboundMessages,
          outboundMessages: counter.outboundMessages,
          totalMessages: counter.totalMessages,
          aiInputTokens: counter.aiInputTokens,
          aiOutputTokens: counter.aiOutputTokens,
          aiTotalTokens: counter.aiTotalTokens,
          audioTranscriptionSeconds: counter.audioTranscriptionSeconds,
        }
      : EMPTY_USAGE),
  };
}

// ─── Resolución de suscripción y límites efectivos ───────────────────────────

export interface TenantSubscriptionInfo {
  subscription: SubscriptionWithPlan | null;
  plan: SubscriptionWithPlan["plan"] | null;
  /** Nombre visible: customPlanName (plan negociado) o el nombre del plan base */
  planDisplayName: string;
  isCustomPlan: boolean;
  /** custom del tenant si existe; si no, el del plan */
  monthlyMessageLimit: number;
  monthlyTokenLimit: number | null;
  priceMonthly: number;
  setupFee: number | null;
  maxUsers: number | null;
  maxAgents: number | null;
  maxWhatsappNumbers: number | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /** true cuando no hay suscripción y se resolvió BASIC como fallback */
  usedFallback: boolean;
}

function decimalOrNull(value: Prisma.Decimal | null | undefined): number | null {
  return value != null ? Number(value.toString()) : null;
}

/**
 * Suscripción + plan + límites EFECTIVOS del tenant. Los overrides por tenant
 * (customMonthlyMessageLimit/customMonthlyTokenLimit, negociados en
 * Enterprise) tienen prioridad sobre el plan. Sin suscripción: fallback al
 * plan BASIC con warning (nunca lanza; nunca bloquea lectura de datos).
 */
export async function getTenantActiveSubscription(
  tenantId: string
): Promise<TenantSubscriptionInfo> {
  const period = getCurrentPeriod();
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });

  if (subscription?.plan) {
    const isCustomPlan = Boolean(
      subscription.customPlanName ||
        subscription.customMonthlyPrice != null ||
        subscription.customMonthlyMessageLimit != null
    );
    return {
      subscription,
      plan: subscription.plan,
      planDisplayName:
        subscription.customPlanName ?? (isCustomPlan ? "Plan personalizado" : subscription.plan.name),
      isCustomPlan,
      monthlyMessageLimit:
        subscription.customMonthlyMessageLimit ?? subscription.plan.monthlyMessageLimit,
      monthlyTokenLimit:
        subscription.customMonthlyTokenLimit ?? subscription.plan.monthlyTokenLimit,
      priceMonthly:
        decimalOrNull(subscription.customMonthlyPrice) ??
        Number(subscription.plan.priceMonthly.toString()),
      setupFee: decimalOrNull(subscription.customSetupFee) ?? decimalOrNull(subscription.plan.setupFee),
      maxUsers: subscription.customMaxUsers ?? subscription.plan.maxUsers,
      maxAgents: subscription.customMaxAgents ?? subscription.plan.maxAgents,
      maxWhatsappNumbers:
        subscription.customMaxWhatsappNumbers ?? subscription.plan.maxWhatsappNumbers,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      usedFallback: false,
    };
  }

  logger.warn(`[BILLING] tenant ${tenantId} sin suscripción — usando plan BASIC como fallback`);
  const basic = await prisma.plan.findFirst({ where: { code: "BASIC", isActive: true } });
  return {
    subscription: null,
    plan: basic,
    planDisplayName: basic?.name ?? "Básico",
    isCustomPlan: false,
    monthlyMessageLimit: basic?.monthlyMessageLimit ?? 3000,
    monthlyTokenLimit: basic?.monthlyTokenLimit ?? null,
    priceMonthly: basic ? Number(basic.priceMonthly.toString()) : 0,
    setupFee: decimalOrNull(basic?.setupFee),
    maxUsers: basic?.maxUsers ?? null,
    maxAgents: basic?.maxAgents ?? null,
    maxWhatsappNumbers: basic?.maxWhatsappNumbers ?? null,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    usedFallback: true,
  };
}

export type AiAllowance =
  | { allowed: true; reason: null }
  | { allowed: false; reason: "MESSAGE_LIMIT" | "TOKEN_LIMIT" | "NO_SUBSCRIPTION"; detail: string };

/**
 * Decide si el tenant puede consumir IA automática ahora mismo.
 * Sin suscripción o cancelada/expirada → bloqueado. Límite mensual de
 * mensajes o de tokens alcanzado → bloqueado. Nunca lanza: ante error de
 * lectura, permite (fail-open) para no tumbar WhatsApp por un fallo interno.
 */
export async function checkAiAllowance(tenantId: string): Promise<AiAllowance> {
  try {
    // Empresa suspendida o cancelada por el admin: IA bloqueada de inmediato
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant && tenant.status !== "ACTIVE") {
      return {
        allowed: false,
        reason: "NO_SUBSCRIPTION",
        detail: `Empresa ${tenant.status === "SUSPENDED" ? "suspendida" : "cancelada"}`,
      };
    }

    const info = await getTenantActiveSubscription(tenantId);

    // Suscripción cancelada/expirada: IA bloqueada (el owner ve el aviso en
    // el panel; login y lectura de datos NUNCA se bloquean).
    if (
      info.subscription &&
      ["CANCELLED", "EXPIRED"].includes(info.subscription.status)
    ) {
      return {
        allowed: false,
        reason: "NO_SUBSCRIPTION",
        detail: `Suscripción ${info.subscription.status}`,
      };
    }

    const usage = await getPeriodUsage(tenantId);

    if (info.monthlyMessageLimit > 0 && usage.totalMessages >= info.monthlyMessageLimit) {
      return {
        allowed: false,
        reason: "MESSAGE_LIMIT",
        detail: `${usage.totalMessages}/${info.monthlyMessageLimit} mensajes del mes`,
      };
    }
    if (info.monthlyTokenLimit && usage.aiTotalTokens >= info.monthlyTokenLimit) {
      return {
        allowed: false,
        reason: "TOKEN_LIMIT",
        detail: `${usage.aiTotalTokens}/${info.monthlyTokenLimit} tokens del mes`,
      };
    }

    return { allowed: true, reason: null };
  } catch (err) {
    logger.error(`[BILLING] checkAiAllowance falló tenant=${tenantId}: ${String(err)}`);
    return { allowed: true, reason: null };
  }
}

// ─── Overview para el panel ──────────────────────────────────────────────────

export async function getBillingOverview(tenantId: string) {
  const [info, usage, agentsUsed, usersUsed] = await Promise.all([
    getTenantActiveSubscription(tenantId),
    getPeriodUsage(tenantId),
    prisma.agent.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.user.count({ where: { tenantId, status: { not: "DISABLED" } } }),
  ]);

  const { subscription, plan } = info;
  const messageLimit = info.monthlyMessageLimit;
  const percentUsed =
    messageLimit > 0 ? Math.min(999, Math.round((usage.totalMessages / messageLimit) * 100)) : 0;

  return {
    plan: plan
      ? {
          id: plan.id,
          code: plan.code,
          // Nombre visible: plan negociado muestra su nombre custom
          name: info.planDisplayName,
          description: plan.description,
          priceMonthly: info.priceMonthly,
          currency: plan.currency,
          setupFee: info.setupFee,
          setupFeeLabel: info.isCustomPlan ? null : plan.setupFeeLabel,
          monthlyMessageLimit: messageLimit,
          monthlyTokenLimit: info.monthlyTokenLimit,
          maxAgents: info.maxAgents,
          maxUsers: info.maxUsers,
          maxWhatsappNumbers: info.maxWhatsappNumbers,
          // true si el plan tiene condiciones negociadas por tenant
          hasCustomLimit: info.isCustomPlan,
        }
      : null,
    subscription: subscription
      ? {
          status: subscription.status,
          billingMode: subscription.billingMode,
          paymentStatus: subscription.paymentStatus,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          renewsAt:
            subscription.nextBillingDate ?? subscription.renewsAt ?? subscription.currentPeriodEnd,
          endsAt: subscription.endsAt,
          hasPaymentProvider: Boolean(subscription.lemonSqueezySubscriptionId),
        }
      : null,
    usage: {
      ...usage,
      messageLimit,
      tokenLimit: info.monthlyTokenLimit,
      percentUsed,
      nearLimit: messageLimit > 0 && percentUsed >= 80 && percentUsed < 100,
      exceeded: messageLimit > 0 && usage.totalMessages >= messageLimit,
    },
    seats: {
      agentsUsed,
      maxAgents: info.maxAgents,
      usersUsed,
      maxUsers: info.maxUsers,
    },
  };
}
