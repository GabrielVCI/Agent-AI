import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import {
  correlateSubscription,
  markCorrelationInvalid,
  type Correlation,
} from "./lemonSqueezy.correlation.service.js";
import { activateFromCorrelation } from "./lemonSqueezy.payment-success.handler.js";
import {
  asId,
  lemonSubscriptionIdOf,
  type LemonInvoiceView,
  type LemonWebhookPayload,
} from "./lemonSqueezy.types.js";
import { logUnmatched } from "./lemonSqueezy.unmatched.service.js";
import { validateTenantAndPlan } from "./lemonSqueezy.validation.js";
import type { WebhookResult } from "./lemonSqueezy.webhook-outcome.js";

/**
 * `subscription_created` — CORRELACIONA, no activa.
 *
 * Que LemonSqueezy haya creado una suscripción no significa que el dinero haya
 * entrado: el primer cobro lo confirma `subscription_payment_success` con
 * `billing_reason=initial` y `status=paid`. Por eso este handler:
 *
 *   SÍ hace                          NO hace
 *   ─────────────────────────────    ────────────────────────────────────────
 *   lee meta.custom_data             crear/activar la Subscription local
 *   valida tenant y plan             tocar el paywall
 *   valida la variante cobrada       conceder acceso
 *   guarda la correlación            interpretar el evento como pago confirmado
 *
 * Única excepción, y no es una excepción de verdad: si el pago llegó ANTES que
 * este evento (carrera de webhooks), la factura ya estaba guardada y aquí se
 * completa la activación que aquel pago dejó pendiente. Quien activa sigue
 * siendo el pago; este evento solo aporta el "de quién es".
 */
export async function handleSubscriptionCreated(
  payload: LemonWebhookPayload,
  eventName: string
): Promise<WebhookResult> {
  const attrs = payload.data?.attributes ?? {};
  const lemonSubscriptionId = lemonSubscriptionIdOf(payload);
  const custom = payload.meta?.custom_data ?? {};
  const testMode = payload.meta?.test_mode ?? attrs.test_mode ?? null;

  logger.info("[LEMONSQUEEZY] billing.lemon.subscription.created.received", {
    subscriptionId: lemonSubscriptionId,
    resourceType: payload.data?.type ?? null,
    testMode,
  });

  if (payload.data?.type !== "subscriptions" || !lemonSubscriptionId) {
    return {
      outcome: "IGNORED",
      eventName,
      reason: `subscription_created sin recurso de suscripción utilizable (type=${payload.data?.type ?? "-"})`,
    };
  }

  // El tenant sale de `custom_data`; si no viene (o no existe), se admite un
  // único respaldo: una Subscription local que YA apunte a esta suscripción de
  // LemonSqueezy. Nunca el email: puede cambiar y no identifica un tenant.
  const declaredTenantId = custom.tenant_id ?? null;
  const declaredPlanId = custom.plan_id ?? null;
  const fallback =
    declaredTenantId && declaredPlanId
      ? null
      : await prisma.subscription.findFirst({
          where: { lemonSqueezySubscriptionId: lemonSubscriptionId },
          select: { tenantId: true, planId: true },
        });

  const validation = await validateTenantAndPlan({
    tenantId: declaredTenantId ?? fallback?.tenantId,
    planId: declaredPlanId ?? fallback?.planId,
    variantId: asId(attrs.variant_id),
    // La variante viene en el propio evento: si no mapea a ningún plan, la
    // correlación sería inservible para el pago posterior.
    requireVariant: Boolean(asId(attrs.variant_id)),
  });

  if (!validation.ok) {
    if (validation.mismatch) {
      // Inconsistencia de variante/plan: se deja marcada y NO se activa nada.
      logger.error("[LEMONSQUEEZY] billing.lemon.variant_mismatch", {
        subscriptionId: lemonSubscriptionId,
        detail: validation.detail,
      });
      await markCorrelationInvalid(lemonSubscriptionId, validation.detail);
      return { outcome: "FAILED", eventName, reason: `variante inconsistente: ${validation.detail}` };
    }
    // Sin tenant/plan resolubles no se correlaciona nada: queda anotado para
    // revisión del SUPER_ADMIN en vez de desaparecer en un log.
    logger.warn("[LEMONSQUEEZY] billing.lemon.correlation_missing", {
      subscriptionId: lemonSubscriptionId,
      detail: validation.detail,
    });
    await logUnmatched(payload, eventName, validation.detail);
    return { outcome: "IGNORED", eventName, reason: validation.detail };
  }

  const correlation = await correlateSubscription({
    lemonSqueezySubscriptionId: lemonSubscriptionId,
    tenantId: validation.tenantId,
    planId: validation.plan.id,
    expectedVariantId: validation.expectedVariantId,
    lemonSqueezyCustomerId: asId(attrs.customer_id),
    lemonSqueezyOrderId: asId(attrs.order_id),
    lemonSqueezyProductId: asId(attrs.product_id),
    lemonSqueezyVariantId: asId(attrs.variant_id),
    testMode,
  });

  logger.info("[LEMONSQUEEZY] billing.lemon.subscription.correlated", {
    tenantId: validation.tenantId,
    planCode: validation.plan.code,
    subscriptionId: lemonSubscriptionId,
    correlationStatus: correlation.status,
  });

  // ── Carrera de webhooks: el pago llegó primero ──
  if (correlation.status === "PAID" && correlation.paidInvoiceId) {
    logger.info("[LEMONSQUEEZY] billing.lemon.payment.initial.confirmed", {
      tenantId: validation.tenantId,
      subscriptionId: lemonSubscriptionId,
      invoiceId: correlation.paidInvoiceId,
      deferred: true,
    });
    return activateFromCorrelation({
      correlation,
      invoice: invoiceFromCorrelation(correlation),
      eventName,
    });
  }

  return {
    outcome: "PROCESSED",
    eventName,
    tenantId: validation.tenantId,
    detail: "correlación registrada; la suscripción NO se activa hasta el primer pago",
  };
}

/**
 * Reconstruye la factura mínima de un pago que se guardó antes de saber de
 * quién era. Solo lleva lo que se persistió: identificador, fecha y test mode.
 * La suscripción real se vuelve a pedir a LemonSqueezy antes de activar.
 */
function invoiceFromCorrelation(correlation: Correlation): LemonInvoiceView {
  return {
    invoiceId: correlation.paidInvoiceId,
    subscriptionId: correlation.lemonSqueezySubscriptionId,
    customerId: correlation.lemonSqueezyCustomerId,
    storeId: null,
    // Se guardó justamente porque era un primer pago confirmado.
    billingReason: "initial",
    status: "paid",
    cardBrand: null,
    cardLastFour: null,
    currency: null,
    total: null,
    createdAt: correlation.paidAt,
    updatedAt: null,
    testMode: correlation.testMode ?? false,
  };
}
