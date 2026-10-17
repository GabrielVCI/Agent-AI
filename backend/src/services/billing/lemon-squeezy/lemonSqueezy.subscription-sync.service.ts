import type { PaymentStatus, Plan, Subscription, SubscriptionStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import { findPlanByVariantId } from "./lemonSqueezy.plan.js";
import {
  mapLemonSubscriptionStatus,
  paymentStatusForLemonStatus,
} from "./lemonSqueezy.status-map.js";
import {
  asDate,
  asId,
  lemonSubscriptionIdOf,
  type LemonSubscriptionAttributes,
  type LemonWebhookPayload,
} from "./lemonSqueezy.types.js";

/**
 * Traducción LemonSqueezy → Subscription de Sendwary.
 *
 * ÚNICA responsabilidad: escribir el estado de la suscripción a partir de un
 * evento YA verificado y YA deduplicado. No valida firmas, no crea checkouts,
 * no habla con la API de LS.
 *
 * Reglas duras:
 *  · Un tenant tiene como mucho UNA suscripción (UNIQUE Subscription.tenantId):
 *    siempre se actualiza la existente, nunca se crea una segunda.
 *  · Las fechas las manda LemonSqueezy (`renews_at`, `ends_at`): jamás se suman
 *    30 días a mano en una renovación.
 *  · Nada de datos de tarjeta más allá de marca y últimos 4 dígitos.
 */

export type SyncOutcome =
  | { status: "SYNCED"; tenantId: string; subscriptionId: string; statusChanged: boolean }
  | { status: "SKIPPED"; reason: string };

// ─── Correlación: ¿de qué tenant es este evento? ─────────────────────────────

export interface ResolvedTarget {
  tenantId: string;
  existing: Subscription | null;
  /** Cómo se identificó al tenant (para el log de auditoría). */
  via: "custom_data" | "subscription_id" | "customer_id" | "order_id" | "owner_email";
}

/**
 * Resuelve el tenant destino SIN adivinar.
 *
 * Orden de preferencia — de la clave más fuerte a la más débil:
 *   1. `custom_data.tenant_id`: lo pusimos nosotros al crear el checkout.
 *   2. La suscripción de LS ya vinculada (eventos posteriores sin custom_data).
 *   3. El customer de LS ya vinculado a una suscripción nuestra.
 *   4. La orden de LS ya vinculada.
 *   5. Email del comprador == email de un OWNER ÚNICO.
 *
 * El email es el último recurso a propósito: puede cambiar y no es una clave
 * fiable en multi-tenant. Si dos owners comparten email, no se resuelve nada.
 */
export async function resolveTarget(
  payload: LemonWebhookPayload
): Promise<ResolvedTarget | null> {
  const attrs = payload.data?.attributes ?? {};
  const customTenantId = payload.meta?.custom_data?.tenant_id ?? null;
  const lemonSubscriptionId = lemonSubscriptionIdOf(payload);
  const customerId = asId(attrs.customer_id);
  const orderId = asId(attrs.order_id);
  const email = attrs.user_email?.toLowerCase().trim() ?? null;

  if (customTenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: customTenantId },
      select: { id: true },
    });
    if (tenant) {
      const existing = await prisma.subscription.findUnique({
        where: { tenantId: tenant.id },
      });
      return { tenantId: tenant.id, existing, via: "custom_data" };
    }
    logger.warn("[LEMONSQUEEZY] custom_data.tenant_id no corresponde a ningún tenant", {
      tenantId: customTenantId,
    });
  }

  if (lemonSubscriptionId) {
    const existing = await prisma.subscription.findFirst({
      where: { lemonSqueezySubscriptionId: lemonSubscriptionId },
    });
    if (existing) return { tenantId: existing.tenantId, existing, via: "subscription_id" };
  }

  if (customerId) {
    const matches = await prisma.subscription.findMany({
      where: { lemonSqueezyCustomerId: customerId },
      take: 2,
    });
    if (matches.length === 1) {
      return { tenantId: matches[0].tenantId, existing: matches[0], via: "customer_id" };
    }
  }

  if (orderId) {
    const matches = await prisma.subscription.findMany({
      where: { lemonSqueezyOrderId: orderId },
      take: 2,
    });
    if (matches.length === 1) {
      return { tenantId: matches[0].tenantId, existing: matches[0], via: "order_id" };
    }
  }

  if (email) {
    const owners = await prisma.user.findMany({
      where: { email, role: "OWNER", tenantId: { not: null } },
      select: { tenantId: true },
    });
    const tenants = [...new Set(owners.map((o) => o.tenantId).filter(Boolean))] as string[];
    if (tenants.length === 1) {
      const existing = await prisma.subscription.findUnique({ where: { tenantId: tenants[0] } });
      return { tenantId: tenants[0], existing, via: "owner_email" };
    }
  }

  return null;
}

// ─── Validación de la variante comprada ──────────────────────────────────────

export interface PlanResolution {
  plan: Plan | null;
  /** true si la variante del webhook contradice al plan de `custom_data`. */
  mismatch: boolean;
  detail: string | null;
}

/**
 * Resuelve el Plan del evento validando DOS fuentes: el `plan_id` que enviamos
 * en `custom_data` y el `variant_id` que LemonSqueezy afirma haber cobrado.
 *
 * Si no coinciden NO se activa nada en silencio: se devuelve `mismatch` y el
 * webhook queda registrado como FAILED para revisión. Confiar solo en
 * `custom_data` permitiría declarar un plan distinto del que se pagó.
 */
export async function resolvePlan(payload: LemonWebhookPayload): Promise<PlanResolution> {
  const custom = payload.meta?.custom_data ?? {};
  const variantId = asId(payload.data?.attributes?.variant_id);

  const planByVariant = await findPlanByVariantId(variantId);

  const planByCustom = custom.plan_id
    ? await prisma.plan.findUnique({ where: { id: custom.plan_id } })
    : custom.plan_code
      ? await prisma.plan.findFirst({ where: { code: custom.plan_code } })
      : null;

  if (planByVariant && planByCustom && planByVariant.id !== planByCustom.id) {
    return {
      plan: null,
      mismatch: true,
      detail: `variant ${variantId} mapea al plan ${planByVariant.code ?? planByVariant.id} pero custom_data declara ${planByCustom.code ?? planByCustom.id}`,
    };
  }

  // La variante cobrada manda: es lo que el cliente pagó de verdad.
  const plan = planByVariant ?? planByCustom;
  if (!plan) {
    return {
      plan: null,
      mismatch: false,
      detail: `ninguna variante conocida (variant=${variantId ?? "-"}, custom plan=${custom.plan_id ?? custom.plan_code ?? "-"})`,
    };
  }
  return { plan, mismatch: false, detail: null };
}

// ─── Mapeo de atributos → columnas ───────────────────────────────────────────

/**
 * Snapshot de LS + campos canónicos de Sendwary.
 *
 * Solo se incluye lo que el evento TRAE: un `subscription_payment_success` no
 * manda los atributos completos de la suscripción y no debe borrar lo que ya
 * había. De ahí el spread condicional en cada campo.
 */
function mapAttributes(attrs: LemonSubscriptionAttributes): Prisma.SubscriptionUncheckedUpdateInput {
  const renewsAt = asDate(attrs.renews_at);
  const endsAt = asDate(attrs.ends_at);
  const item = attrs.first_subscription_item ?? null;

  return {
    ...(asId(attrs.store_id) ? { lemonSqueezyStoreId: asId(attrs.store_id) } : {}),
    ...(asId(attrs.customer_id) ? { lemonSqueezyCustomerId: asId(attrs.customer_id) } : {}),
    ...(asId(attrs.order_id) ? { lemonSqueezyOrderId: asId(attrs.order_id) } : {}),
    ...(asId(attrs.order_item_id) ? { lemonSqueezyOrderItemId: asId(attrs.order_item_id) } : {}),
    ...(asId(attrs.product_id) ? { lemonSqueezyProductId: asId(attrs.product_id) } : {}),
    ...(asId(attrs.variant_id) ? { lemonSqueezyVariantId: asId(attrs.variant_id) } : {}),
    // Snapshot informativo: NUNCA se usa como clave de lógica (el Plan manda).
    ...(attrs.product_name ? { lemonSqueezyProductName: attrs.product_name } : {}),
    ...(attrs.variant_name ? { lemonSqueezyVariantName: attrs.variant_name } : {}),
    ...(attrs.status ? { lemonSqueezyStatus: attrs.status } : {}),
    ...(item?.id ? { lemonSqueezySubscriptionItemId: asId(item.id) } : {}),
    ...(item?.price_id ? { lemonSqueezyPriceId: asId(item.price_id) } : {}),
    ...(typeof item?.quantity === "number" ? { lemonSqueezyQuantity: item.quantity } : {}),
    // Marca y últimos 4: no son datos de tarjeta. Nunca número completo ni CVV.
    ...(attrs.card_brand !== undefined ? { lemonSqueezyCardBrand: attrs.card_brand } : {}),
    ...(attrs.card_last_four !== undefined
      ? { lemonSqueezyCardLastFour: attrs.card_last_four }
      : {}),
    ...(attrs.payment_processor !== undefined
      ? { lemonSqueezyPaymentProcessor: attrs.payment_processor }
      : {}),
    ...(typeof attrs.cancelled === "boolean" ? { lemonSqueezyCancelled: attrs.cancelled } : {}),
    ...(attrs.trial_ends_at !== undefined
      ? { lemonSqueezyTrialEndsAt: asDate(attrs.trial_ends_at) }
      : {}),
    ...(typeof attrs.billing_anchor === "number"
      ? { lemonSqueezyBillingAnchor: attrs.billing_anchor }
      : {}),
    // Objeto `pause` sanitizado: solo mode y resumes_at (aún sin lógica propia).
    ...(attrs.pause !== undefined
      ? {
          lemonSqueezyPauseJson: attrs.pause
            ? ({
                mode: attrs.pause.mode ?? null,
                resumesAt: attrs.pause.resumes_at ?? null,
              } as Prisma.InputJsonValue)
            : Prisma.DbNull,
        }
      : {}),
    ...(typeof attrs.test_mode === "boolean" ? { lemonSqueezyTestMode: attrs.test_mode } : {}),
    ...(attrs.created_at ? { lemonSqueezyCreatedAt: asDate(attrs.created_at) } : {}),
    ...(attrs.updated_at ? { lemonSqueezyUpdatedAt: asDate(attrs.updated_at) } : {}),

    // ── Campos canónicos de Sendwary ──
    // renewsAt y nextBillingDate: LemonSqueezy es la autoridad de la próxima
    // fecha de cobro. currentPeriodEnd la sigue para que el paywall y la
    // gracia de PAST_DUE midan contra el período real.
    ...(attrs.renews_at !== undefined
      ? { renewsAt, nextBillingDate: renewsAt, ...(renewsAt ? { currentPeriodEnd: renewsAt } : {}) }
      : {}),
    // endsAt: fin del acceso pagado tras cancelar. NO es cancelRequestedAt.
    ...(attrs.ends_at !== undefined ? { endsAt } : {}),
  };
}

// ─── Sincronización ──────────────────────────────────────────────────────────

export interface SyncInput {
  payload: LemonWebhookPayload;
  target: ResolvedTarget;
  plan: Plan | null;
  /** Estado forzado por el tipo de evento (cancelled/expired), si aplica. */
  forcedStatus?: SubscriptionStatus;
  /** Cambios de estado de pago que impone un evento de pago. */
  payment?: {
    paymentStatus?: PaymentStatus;
    lastPaymentAt?: Date;
    lastPaymentFailedAt?: Date;
  };
  eventName: string;
}

/**
 * Escribe la suscripción del tenant. Crea la fila solo si el tenant aún no
 * tiene ninguna (primer pago self-service); en cualquier otro caso actualiza
 * la existente — el UNIQUE por tenantId no se puede violar.
 */
export async function syncSubscription(input: SyncInput): Promise<SyncOutcome> {
  const { payload, target, plan, eventName } = input;
  const attrs = payload.data?.attributes ?? {};
  const now = new Date();
  // En un evento de pago esto es el id de la SUSCRIPCIÓN, no el de la factura.
  const lemonSubscriptionId = lemonSubscriptionIdOf(payload);

  const mappedStatus = input.forcedStatus ?? mapLemonSubscriptionStatus(attrs.status);
  const derivedPaymentStatus =
    input.payment?.paymentStatus ?? paymentStatusForLemonStatus(attrs.status);

  const previousStatus = target.existing?.status ?? null;

  const common: Prisma.SubscriptionUncheckedUpdateInput = {
    ...mapAttributes(attrs),
    ...(mappedStatus ? { status: mappedStatus } : {}),
    ...(plan ? { planId: plan.id } : {}),
    // Una suscripción que llega por LemonSqueezy pasa a modo LEMONSQUEEZY:
    // deja de ser manual aunque antes lo fuera.
    billingMode: "LEMONSQUEEZY",
    ...(derivedPaymentStatus ? { paymentStatus: derivedPaymentStatus } : {}),
    ...(input.payment?.lastPaymentAt ? { lastPaymentAt: input.payment.lastPaymentAt } : {}),
    ...(input.payment?.lastPaymentFailedAt
      ? { lastPaymentFailedAt: input.payment.lastPaymentFailedAt }
      : {}),
    ...(lemonSubscriptionId ? { lemonSqueezySubscriptionId: lemonSubscriptionId } : {}),
    // Momento en que Sendwary supo de la cancelación. Distinto de endsAt, que
    // es cuándo termina el acceso ya pagado.
    ...(mappedStatus === "CANCELLED" && !target.existing?.cancelRequestedAt
      ? { cancelRequestedAt: now }
      : {}),
    lastWebhookAt: now,
    metadataJson: {
      lastEvent: eventName,
      lemonStatus: attrs.status ?? null,
      testMode: payload.meta?.test_mode ?? attrs.test_mode ?? false,
      receivedAt: now.toISOString(),
      correlatedVia: target.via,
    } as Prisma.InputJsonValue,
  };

  if (target.existing) {
    const updated = await prisma.subscription.update({
      where: { id: target.existing.id },
      data: common,
    });
    const statusChanged = previousStatus !== updated.status;
    if (statusChanged) {
      logger.info("[LEMONSQUEEZY] billing.subscription.status_changed", {
        tenantId: target.tenantId,
        subscriptionId: updated.id,
        from: previousStatus,
        to: updated.status,
        eventName,
      });
    }
    logger.info("[LEMONSQUEEZY] billing.subscription.synced", {
      tenantId: target.tenantId,
      subscriptionId: updated.id,
      eventName,
      via: target.via,
    });
    return {
      status: "SYNCED",
      tenantId: target.tenantId,
      subscriptionId: updated.id,
      statusChanged,
    };
  }

  // Tenant SIN suscripción: aquí se acaba el camino.
  //
  // Crear una suscripción es privilegio EXCLUSIVO del primer pago confirmado
  // (subscription_payment_success con billing_reason=initial y status=paid; ver
  // lemonSqueezy.payment-success.handler). Un evento de ciclo de vida describe
  // algo que YA existe: si aquí no hay fila es que nadie ha pagado todavía, y
  // dejar que este evento la creara sería conceder acceso sin cobro.
  return {
    status: "SKIPPED",
    reason: "el tenant no tiene suscripción: solo el primer pago confirmado la crea",
  };
}
