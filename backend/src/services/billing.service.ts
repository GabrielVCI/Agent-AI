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
// ─── Estado de billing para el paywall (Parte B) ─────────────────────────────

const PAST_DUE_GRACE_DAYS = 3;

/**
 * Ventana durante la cual un pago de LemonSqueezy recién hecho se considera
 * "en confirmación".
 *
 * Existe por la carrera real entre el redirect y el webhook: el cliente puede
 * pulsar "Continuar" y llegar al panel antes de que el webhook del primer
 * cobro termine. Durante esta ventana NO se le enseña el paywall —se le enseña
 * "estamos confirmando"— para que no pague dos veces.
 *
 * Es una ventana corta a propósito: pasado ese tiempo, una correlación que
 * sigue sin confirmarse ya no puede seguir tapando el paywall indefinidamente.
 */
const PENDING_CONFIRMATION_WINDOW_MINUTES = 30;

/**
 * Estados de correlación que significan "hay dinero en vuelo": LemonSqueezy ya
 * creó la suscripción (o ya cobró) pero el alta local todavía no se completó.
 * `PROCESSED` no está: ese ya terminó. `INVALID` tampoco: ese no va a terminar.
 */
const PENDING_CORRELATION_STATES = ["PENDING_PAYMENT", "PENDING_CORRELATION", "PAID"] as const;

/**
 * Regla ÚNICA de acceso, resuelta en el backend. El frontend la consume, no la
 * reimplementa: solo decide qué pantalla pinta para cada valor.
 */
export type BillingAccessState = "ALLOWED" | "PENDING_CONFIRMATION" | "PAYWALL_REQUIRED";

export interface PaymentConfirmationState {
  /** true = hay un pago de LemonSqueezy esperando confirmación del webhook. */
  pending: boolean;
  /** Cuándo se supo por última vez de ese pago (para el timeout de la UI). */
  since: Date | null;
}

/**
 * ¿Este tenant tiene un pago de LemonSqueezy a medio confirmar?
 *
 * La fuente es la correlación que deja el webhook `subscription_created`, que
 * ya existe: no hace falta ninguna tabla nueva ni que el navegador nos cuente
 * nada. Si el navegador dijera "estoy pagando", cualquiera podría saltarse el
 * paywall simplemente afirmándolo.
 */
export async function getPaymentConfirmationState(
  tenantId: string,
  now = new Date()
): Promise<PaymentConfirmationState> {
  const desde = new Date(now.getTime() - PENDING_CONFIRMATION_WINDOW_MINUTES * 60_000);

  const correlation = await prisma.lemonSqueezySubscriptionCorrelation.findFirst({
    where: {
      tenantId,
      status: { in: [...PENDING_CORRELATION_STATES] },
      updatedAt: { gte: desde },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return { pending: Boolean(correlation), since: correlation?.updatedAt ?? null };
}

export interface TenantBillingStatus {
  hasActivePlan: boolean;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  billingMode: string | null;
  lemonSqueezySubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  /** Fin del acceso ya pagado tras cancelar (LemonSqueezy `ends_at`). */
  endsAt: Date | null;
  /** true = pago hecho en LemonSqueezy, esperando la confirmación del webhook. */
  paymentConfirmationPending: boolean;
  /** Qué debe hacer el frontend: entrar, esperar confirmando, o pedir pago. */
  accessState: BillingAccessState;
  /** Motivo cuando NO hay plan activo, o warning informativo (gracia/cancelada). */
  reason:
    | "OK"
    | "PAST_DUE_GRACE" // activo con warning: pago vencido, dentro de los 3 días de gracia
    | "CANCELLED_GRACE" // activo con warning: cancelada pero pagada hasta endsAt
    | "NO_SUBSCRIPTION"
    | "PAST_DUE_EXPIRED"
    | "CANCELLED"
    | "EXPIRED"
    | "TRIAL_ENDED";
}

/**
 * ¿Queda período ya pagado por delante?
 *
 * Una suscripción cancelada en LemonSqueezy (`status = cancelled`) sigue siendo
 * válida hasta `ends_at`: el cliente pagó ese mes y no se le corta el servicio
 * antes de tiempo. Cancelar ≠ perder el acceso al instante.
 *
 * Las suscripciones manuales/custom no traen `endsAt`: para ellas esto es
 * false y el comportamiento anterior se conserva intacto.
 */
function hasPaidPeriodLeft(subscription: { endsAt: Date | null }, now = Date.now()): boolean {
  return Boolean(subscription.endsAt && subscription.endsAt.getTime() > now);
}

/**
 * Regla única de "¿este tenant puede usar la plataforma?" (paywall):
 * - ACTIVE (cualquier billingMode: MANUAL/CUSTOM/FREE/LEMONSQUEEZY) → activo.
 * - CANCEL_REQUESTED → activo hasta que el admin procese la cancelación.
 * - TRIALING → activo mientras currentPeriodEnd sea futuro (trials asignados
 *   manualmente o on_trial de LemonSqueezy); vencido → paywall.
 * - PAST_DUE → activo CON WARNING durante 3 días de gracia tras
 *   currentPeriodEnd; luego paywall.
 * - CANCELLED → activo hasta `endsAt` (el período ya está pagado); pasado
 *   ese momento, paywall. Las cancelaciones manuales no traen endsAt y
 *   bloquean de inmediato, igual que antes.
 * - EXPIRED/sin suscripción → paywall.
 * El bypass de SUPER_ADMIN es del guard (no llega aquí: no tiene tenant).
 */
export async function getTenantBillingStatus(tenantId: string): Promise<TenantBillingStatus> {
  const status = await resolveBillingStatus(tenantId);

  // Con plan activo no hace falta preguntar nada más: el caso normal no paga
  // una consulta extra. Solo cuando el paywall aplicaría se mira si hay un pago
  // en vuelo, que es justo la carrera "Continuar antes que el webhook".
  if (status.hasActivePlan) {
    return { ...status, paymentConfirmationPending: false, accessState: "ALLOWED" };
  }

  const confirmation = await getPaymentConfirmationState(tenantId);
  if (confirmation.pending) {
    logger.info("[BILLING] billing.confirmation.pending", { tenantId });
  }
  return {
    ...status,
    paymentConfirmationPending: confirmation.pending,
    accessState: confirmation.pending ? "PENDING_CONFIRMATION" : "PAYWALL_REQUIRED",
  };
}

/** Estado derivado SOLO de la suscripción (sin pagos en vuelo). */
async function resolveBillingStatus(
  tenantId: string
): Promise<Omit<TenantBillingStatus, "paymentConfirmationPending" | "accessState">> {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: { select: { code: true, name: true } } },
  });

  const base = {
    planCode: subscription?.plan?.code ?? null,
    planName: subscription
      ? subscription.customPlanName ?? subscription.plan?.name ?? null
      : null,
    subscriptionStatus: subscription?.status ?? null,
    billingMode: subscription?.billingMode ?? null,
    lemonSqueezySubscriptionId: subscription?.lemonSqueezySubscriptionId ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    endsAt: subscription?.endsAt ?? null,
  };

  if (!subscription) {
    return { ...base, hasActivePlan: false, reason: "NO_SUBSCRIPTION" };
  }

  const now = Date.now();
  switch (subscription.status) {
    case "ACTIVE":
    case "CANCEL_REQUESTED":
      return { ...base, hasActivePlan: true, reason: "OK" };
    case "TRIALING": {
      if (subscription.currentPeriodEnd.getTime() > now) {
        return { ...base, hasActivePlan: true, reason: "OK" };
      }
      return { ...base, hasActivePlan: false, reason: "TRIAL_ENDED" };
    }
    case "PAST_DUE": {
      const graceEnd =
        subscription.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000;
      if (graceEnd > now) {
        return { ...base, hasActivePlan: true, reason: "PAST_DUE_GRACE" };
      }
      return { ...base, hasActivePlan: false, reason: "PAST_DUE_EXPIRED" };
    }
    case "CANCELLED": {
      // Cancelada pero con período pagado por delante: sigue teniendo acceso.
      // Cuando llega `ends_at`, LemonSqueezy manda subscription_expired y el
      // estado pasa a EXPIRED; esta comprobación cubre el intervalo.
      if (hasPaidPeriodLeft(subscription)) {
        return { ...base, hasActivePlan: true, reason: "CANCELLED_GRACE" };
      }
      return { ...base, hasActivePlan: false, reason: "CANCELLED" };
    }
    case "EXPIRED":
    default:
      return { ...base, hasActivePlan: false, reason: "EXPIRED" };
  }
}

// ─── Estado de activación comercial (verificación → implementación → 1er mes) ─

/** Lifecycle states que muestran la pantalla premium de implementación. */
const IMPLEMENTATION_LIFECYCLES = [
  "REGISTERED",
  "EMAIL_PENDING",
  "EMAIL_VERIFIED",
  "IMPLEMENTATION_PENDING",
  "IMPLEMENTATION_IN_PROGRESS",
] as const;

export interface TenantActivationState {
  emailVerified: boolean;
  lifecycleStatus: string;
  implementationStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  implementationFeePaid: boolean;
  implementationFeePaidAt: Date | null;
  implementationStartedAt: Date | null;
  implementationExpectedEndAt: Date | null;
  finalActivationDate: Date | null;
  firstMonthEndsAt: Date | null;
  hasActiveSubscription: boolean;
  shouldShowPaywall: boolean;
  shouldShowImplementationScreen: boolean;
  paywallBypassUntil: Date | null;
  /** true = pago hecho en LemonSqueezy, esperando la confirmación del webhook. */
  paymentConfirmationPending: boolean;
  /** Qué debe hacer el frontend: entrar, esperar confirmando, o pedir pago. */
  accessState: BillingAccessState;
  reason:
    | "OK"
    | "EMAIL_NOT_VERIFIED"
    | "IMPLEMENTATION"
    | "FIRST_MONTH"
    | "PAYWALL_BYPASS"
    | "FIRST_MONTH_ENDED"
    | TenantBillingStatus["reason"];
}

/**
 * Regla única del flujo comercial premium (Parte K):
 * 1. Email sin verificar → pantalla "Verifica tu correo" (nunca paywall).
 * 2. Lifecycle en implementación → pantalla de implementación (nunca paywall).
 * 3. Lifecycle completado/activo:
 *    - suscripción activa (LEMONSQUEEZY/MANUAL/CUSTOM/FREE) → dashboard.
 *    - dentro del primer mes (finalActivationDate → firstMonthEndsAt) → dashboard.
 *    - bypass de paywall vigente (SUPER_ADMIN) → dashboard.
 *    - resto → paywall de planes.
 * Tenants legados (lifecycle ACTIVE sin finalActivationDate) conservan el
 * comportamiento actual: decide la suscripción. SUPER_ADMIN nunca llega aquí.
 */
export async function getTenantActivationState(
  tenantId: string,
  userEmailVerified: boolean
): Promise<TenantActivationState> {
  const state = await resolveActivationState(tenantId, userEmailVerified);

  // Un pago en vuelo NO abre el dashboard: cambia la pantalla que se enseña.
  // `shouldShowPaywall` se deja intacto (es el contrato que ya consumen otras
  // partes); el guard mira `accessState` ANTES de mandar a pagar de nuevo.
  // `accessState` habla SOLO de facturación. Los gates de correo e
  // implementación son independientes y el guard los resuelve antes que este.
  if (!state.shouldShowPaywall) {
    return { ...state, paymentConfirmationPending: false, accessState: "ALLOWED" };
  }

  const confirmation = await getPaymentConfirmationState(tenantId);
  return {
    ...state,
    paymentConfirmationPending: confirmation.pending,
    accessState: confirmation.pending ? "PENDING_CONFIRMATION" : "PAYWALL_REQUIRED",
  };
}

async function resolveActivationState(
  tenantId: string,
  userEmailVerified: boolean
): Promise<Omit<TenantActivationState, "paymentConfirmationPending" | "accessState">> {
  const [tenant, billing] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        lifecycleStatus: true,
        emailVerifiedAt: true,
        implementationFeePaidAt: true,
        implementationStartedAt: true,
        implementationExpectedEndAt: true,
        finalActivationDate: true,
        firstMonthEndsAt: true,
        paywallBypassUntil: true,
      },
    }),
    getTenantBillingStatus(tenantId),
  ]);

  const now = Date.now();
  const lifecycle = tenant?.lifecycleStatus ?? "ACTIVE";
  const inImplementation = (IMPLEMENTATION_LIFECYCLES as readonly string[]).includes(lifecycle);
  const bypassActive = Boolean(
    tenant?.paywallBypassUntil && tenant.paywallBypassUntil.getTime() > now
  );
  const withinFirstMonth = Boolean(
    tenant?.finalActivationDate &&
      tenant.firstMonthEndsAt &&
      tenant.firstMonthEndsAt.getTime() > now
  );
  const firstMonthEnded = Boolean(
    tenant?.finalActivationDate &&
      tenant.firstMonthEndsAt &&
      tenant.firstMonthEndsAt.getTime() <= now
  );

  const base = {
    emailVerified: userEmailVerified,
    lifecycleStatus: lifecycle,
    implementationStatus:
      lifecycle === "IMPLEMENTATION_IN_PROGRESS"
        ? ("IN_PROGRESS" as const)
        : inImplementation
          ? ("PENDING" as const)
          : ("COMPLETED" as const),
    implementationFeePaid: Boolean(tenant?.implementationFeePaidAt),
    implementationFeePaidAt: tenant?.implementationFeePaidAt ?? null,
    implementationStartedAt: tenant?.implementationStartedAt ?? null,
    implementationExpectedEndAt: tenant?.implementationExpectedEndAt ?? null,
    finalActivationDate: tenant?.finalActivationDate ?? null,
    firstMonthEndsAt: tenant?.firstMonthEndsAt ?? null,
    hasActiveSubscription: billing.hasActivePlan,
    paywallBypassUntil: tenant?.paywallBypassUntil ?? null,
  };

  if (!userEmailVerified) {
    return {
      ...base,
      shouldShowPaywall: false,
      shouldShowImplementationScreen: false,
      reason: "EMAIL_NOT_VERIFIED",
    };
  }

  if (inImplementation) {
    return {
      ...base,
      shouldShowPaywall: false,
      shouldShowImplementationScreen: true,
      reason: "IMPLEMENTATION",
    };
  }

  if (billing.hasActivePlan) {
    return {
      ...base,
      shouldShowPaywall: false,
      shouldShowImplementationScreen: false,
      reason: billing.reason,
    };
  }

  if (withinFirstMonth) {
    return {
      ...base,
      shouldShowPaywall: false,
      shouldShowImplementationScreen: false,
      reason: "FIRST_MONTH",
    };
  }

  if (bypassActive) {
    return {
      ...base,
      shouldShowPaywall: false,
      shouldShowImplementationScreen: false,
      reason: "PAYWALL_BYPASS",
    };
  }

  return {
    ...base,
    shouldShowPaywall: true,
    shouldShowImplementationScreen: false,
    reason: firstMonthEnded ? "FIRST_MONTH_ENDED" : billing.reason,
  };
}

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
    // Excepción: cancelada CON período pagado por delante sigue operando —
    // misma regla que el paywall (ver getTenantBillingStatus).
    if (
      info.subscription &&
      ["CANCELLED", "EXPIRED"].includes(info.subscription.status) &&
      !(info.subscription.status === "CANCELLED" && hasPaidPeriodLeft(info.subscription))
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
          // IDs de LemonSqueezy del PROPIO tenant (no son secretos: identifican
          // su suscripción para soporte). La API key jamás sale del backend.
          lemonSqueezySubscriptionId: subscription.lemonSqueezySubscriptionId,
          lemonSqueezyCustomerId: subscription.lemonSqueezyCustomerId,
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
