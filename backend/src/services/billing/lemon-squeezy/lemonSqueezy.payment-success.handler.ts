import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { activateSubscriptionFromFirstPayment } from "./lemonSqueezy.activation.service.js";
import {
  correlateSubscription,
  findCorrelation,
  isInvoiceAlreadyProcessed,
  markCorrelationInvalid,
  markCorrelationPaid,
  recordDeferredPayment,
  type Correlation,
} from "./lemonSqueezy.correlation.service.js";
import {
  fetchLemonSubscription,
  type LemonSubscriptionView,
} from "./lemonSqueezy.subscription-api.js";
import {
  INVOICE_RESOURCE_TYPE,
  readInvoice,
  type LemonInvoicePayload,
  type LemonInvoiceView,
  type LemonWebhookPayload,
} from "./lemonSqueezy.types.js";
import { logUnmatched } from "./lemonSqueezy.unmatched.service.js";
import { testModeMismatch, validateTenantAndPlan } from "./lemonSqueezy.validation.js";
import type { WebhookResult } from "./lemonSqueezy.webhook-outcome.js";

/**
 * `subscription_payment_success` — la ÚNICA autoridad que activa el servicio.
 *
 * El recurso que trae este evento es una FACTURA (`subscription-invoices`), no
 * una suscripción: de ella salen las dos respuestas que importan —
 * `billing_reason` y `status`— y el id de la suscripción a la que pertenece.
 *
 * Qué valida antes de activar (en este orden, cortando al primer fallo):
 *   1. que el recurso sea realmente una factura de suscripción;
 *   2. `billing_reason === "initial"` (esta fase solo cubre el PRIMER cobro);
 *   3. `status === "paid"` (pending/void/refunded no activan nada);
 *   4. que exista la correlación tenant+plan creada por `subscription_created`;
 *   5. la suscripción REAL consultada a la API de LemonSqueezy;
 *   6. que factura y suscripción hablen de lo mismo (subscription_id, customer);
 *   7. que la variante cobrada sea la del plan declarado;
 *   8. coherencia de test mode.
 *
 * Solo entonces se escribe la Subscription local, dentro de una transacción.
 */

/** Motivo de cobro que esta fase implementa. El resto se reconoce y se deja. */
const INITIAL_BILLING_REASON = "initial";
/** Estado de factura que confirma dinero cobrado. */
const PAID_INVOICE_STATUS = "paid";

export async function handleSubscriptionPaymentSuccess(
  payload: LemonWebhookPayload,
  eventName: string
): Promise<WebhookResult> {
  const invoice = readInvoice(payload as LemonInvoicePayload);
  const resourceType = payload.data?.type ?? null;

  logger.info("[LEMONSQUEEZY] billing.lemon.payment.success.received", {
    invoiceId: invoice.invoiceId,
    subscriptionId: invoice.subscriptionId,
    billingReason: invoice.billingReason,
    invoiceStatus: invoice.status,
    testMode: invoice.testMode,
  });

  // ── 1. El recurso debe ser una factura de suscripción ──
  if (resourceType !== INVOICE_RESOURCE_TYPE) {
    return {
      outcome: "IGNORED",
      eventName,
      reason: `recurso inesperado en un evento de pago: ${resourceType ?? "-"}`,
    };
  }

  if (!invoice.subscriptionId) {
    return {
      outcome: "IGNORED",
      eventName,
      reason: "la factura no declara subscription_id: no hay nada que correlacionar",
    };
  }

  // ── 2. Solo el PRIMER cobro crea la suscripción ──
  // renewal y updated se reconocen a propósito y NO hacen nada: la renovación y
  // el cambio de plan son fases posteriores. Terminar en 200 evita que
  // LemonSqueezy reintente un evento que sí recibimos bien.
  if (invoice.billingReason !== INITIAL_BILLING_REASON) {
    logger.info("[LEMONSQUEEZY] billing.lemon.payment.non_initial", {
      subscriptionId: invoice.subscriptionId,
      billingReason: invoice.billingReason,
    });
    return {
      outcome: "IGNORED",
      eventName,
      reason: `billing_reason=${invoice.billingReason ?? "-"}: reconocido, sin lógica en esta fase`,
    };
  }

  // ── 3. Sin dinero cobrado no hay acceso ──
  if (invoice.status !== PAID_INVOICE_STATUS) {
    logger.warn("[LEMONSQUEEZY] billing.lemon.payment.not_paid", {
      subscriptionId: invoice.subscriptionId,
      invoiceStatus: invoice.status,
    });
    return {
      outcome: "IGNORED",
      eventName,
      reason: `factura inicial con status=${invoice.status ?? "-"}: no activa nada`,
    };
  }

  // ── 4. ¿De quién es esta suscripción? ──
  let correlation = await findCorrelation(invoice.subscriptionId);

  // Idempotencia: la misma factura no vuelve a aplicarse.
  if (isInvoiceAlreadyProcessed(correlation, invoice.invoiceId)) {
    logger.info("[LEMONSQUEEZY] billing.lemon.payment.already_applied", {
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.invoiceId,
    });
    return {
      outcome: "IGNORED",
      eventName,
      reason: "la factura inicial ya había sido aplicada",
    };
  }

  if (correlation?.status === "INVALID") {
    return {
      outcome: "FAILED",
      eventName,
      reason: `correlación marcada como inválida: ${correlation.lastError ?? "sin detalle"}`,
    };
  }

  // Sin correlación con tenant: puede que el pago se haya adelantado a
  // `subscription_created`, o que el evento llegue sin `custom_data`.
  if (!correlation?.tenantId) {
    const fallback = await correlateFromPayloadOrSubscription(payload, invoice);
    if (!fallback) {
      // NO se inventa tenant ni se busca por email: la factura queda guardada y
      // `subscription_created` completará la activación cuando llegue.
      await recordDeferredPayment({
        lemonSqueezySubscriptionId: invoice.subscriptionId,
        paidInvoiceId: invoice.invoiceId ?? invoice.subscriptionId,
        paidAt: invoice.createdAt ?? new Date(),
        lemonSqueezyCustomerId: invoice.customerId,
        testMode: invoice.testMode,
        reason: "pago inicial recibido antes de poder correlacionar el tenant",
      });
      logger.warn("[LEMONSQUEEZY] billing.lemon.correlation_missing", {
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.invoiceId,
      });
      await logUnmatched(payload, eventName, "pago inicial sin correlación de tenant");
      return {
        outcome: "IGNORED",
        eventName,
        reason: "sin correlación todavía: pago guardado, se aplicará al correlacionar",
      };
    }
    correlation = fallback;
  }

  // Desde aquí el pago está confirmado: se sella aunque la activación falle,
  // para no perder nunca la constancia de que este tenant pagó.
  correlation = await markCorrelationPaid(correlation.id, {
    paidInvoiceId: invoice.invoiceId ?? invoice.subscriptionId,
    paidAt: invoice.createdAt ?? new Date(),
  });

  logger.info("[LEMONSQUEEZY] billing.lemon.payment.initial.confirmed", {
    tenantId: correlation.tenantId,
    subscriptionId: invoice.subscriptionId,
    invoiceId: invoice.invoiceId,
  });

  return activateFromCorrelation({ correlation, invoice, eventName });
}

/**
 * Completa la activación de una correlación con primer pago confirmado.
 *
 * Se usa en los DOS caminos posibles, que solo se diferencian en el orden de
 * llegada de los webhooks:
 *   · pago después de `subscription_created` (el habitual);
 *   · `subscription_created` después del pago (activación diferida).
 */
export async function activateFromCorrelation(input: {
  correlation: Correlation;
  invoice: LemonInvoiceView;
  eventName: string;
}): Promise<WebhookResult> {
  const { correlation, invoice, eventName } = input;
  const lemonSubscriptionId = correlation.lemonSqueezySubscriptionId;

  // ── 5. La suscripción REAL, preguntada a LemonSqueezy ──
  // Fuera de la transacción: una request HTTP jamás bloquea filas de la BD.
  let lemonSubscription: LemonSubscriptionView | null;
  try {
    lemonSubscription = await fetchLemonSubscription(lemonSubscriptionId);
  } catch (err) {
    // Fallo TRANSITORIO del proveedor: el pago ya quedó sellado como PAID y el
    // evento se devuelve como reintentable. No se activa a ciegas ni se pierde.
    const reason =
      err instanceof AppError ? `${err.code}` : err instanceof Error ? err.message : String(err);
    logger.error("[LEMONSQUEEZY] billing.lemon.subscription.fetch_failed", {
      subscriptionId: lemonSubscriptionId,
      reason,
    });
    return {
      outcome: "RETRY",
      eventName,
      reason: `no se pudo verificar la suscripción en LemonSqueezy (${reason})`,
    };
  }

  if (!lemonSubscription) {
    return {
      outcome: "FAILED",
      eventName,
      reason: "LemonSqueezy no devolvió la suscripción referida por la factura",
    };
  }

  // ── 6. Factura y suscripción deben hablar de lo mismo ──
  const invoiceSubscriptionId = invoice.subscriptionId ?? lemonSubscriptionId;
  if (lemonSubscription.id && lemonSubscription.id !== invoiceSubscriptionId) {
    return reject(lemonSubscriptionId, eventName, {
      detail: `la suscripción devuelta (${lemonSubscription.id}) no es la de la factura (${invoiceSubscriptionId})`,
    });
  }
  if (
    invoice.customerId &&
    lemonSubscription.customerId &&
    invoice.customerId !== lemonSubscription.customerId
  ) {
    return reject(lemonSubscriptionId, eventName, {
      detail: "el customer de la factura no coincide con el de la suscripción",
    });
  }

  // ── 7. Tenant, plan y variante (la variante COBRADA manda) ──
  const validation = await validateTenantAndPlan({
    tenantId: correlation.tenantId,
    planId: correlation.planId,
    variantId: lemonSubscription.variantId,
    requireVariant: true,
  });

  if (!validation.ok) {
    if (validation.mismatch) {
      logger.error("[LEMONSQUEEZY] billing.lemon.variant_mismatch", {
        tenantId: correlation.tenantId,
        subscriptionId: lemonSubscriptionId,
        detail: validation.detail,
      });
    }
    return reject(lemonSubscriptionId, eventName, { detail: validation.detail });
  }

  const { plan } = validation;

  // La variante que el checkout prometió debe ser la que se cobró.
  if (
    correlation.expectedVariantId &&
    lemonSubscription.variantId &&
    correlation.expectedVariantId !== lemonSubscription.variantId
  ) {
    logger.error("[LEMONSQUEEZY] billing.lemon.variant_mismatch", {
      tenantId: correlation.tenantId,
      subscriptionId: lemonSubscriptionId,
      detail: "la variante cobrada no es la que declaró el checkout",
    });
    return reject(lemonSubscriptionId, eventName, {
      detail: `variante cobrada ${lemonSubscription.variantId} ≠ variante esperada ${correlation.expectedVariantId}`,
    });
  }

  // Producto: validación cruzada adicional cuando el Plan lo tiene configurado.
  if (
    plan.lemonSqueezyProductId &&
    lemonSubscription.productId &&
    String(plan.lemonSqueezyProductId) !== lemonSubscription.productId
  ) {
    return reject(lemonSubscriptionId, eventName, {
      detail: `producto cobrado ${lemonSubscription.productId} ≠ producto del plan ${plan.lemonSqueezyProductId}`,
    });
  }

  // ── 8. Coherencia de ambiente ──
  const envMismatch = testModeMismatch(lemonSubscription.testMode ?? invoice.testMode);
  if (envMismatch) {
    logger.error("[LEMONSQUEEZY] billing.lemon.test_mode_mismatch", {
      tenantId: correlation.tenantId,
      subscriptionId: lemonSubscriptionId,
    });
    return reject(lemonSubscriptionId, eventName, { detail: envMismatch });
  }

  // ── 9. Escritura atómica ──
  const { subscription, created } = await activateSubscriptionFromFirstPayment({
    tenantId: validation.tenantId,
    plan,
    lemonSubscription,
    invoice,
    correlation,
    eventName,
  });

  logger.info(
    created
      ? "[LEMONSQUEEZY] billing.subscription.created"
      : "[LEMONSQUEEZY] billing.subscription.activated",
    {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      planCode: plan.code,
      status: subscription.status,
      eventName,
    }
  );

  return {
    outcome: "PROCESSED",
    eventName,
    tenantId: subscription.tenantId,
    subscriptionId: subscription.id,
    detail: created ? "suscripción creada" : "suscripción activada",
  };
}

/** Rechazo seguro: marca la correlación inválida y no activa nada. */
async function reject(
  lemonSubscriptionId: string,
  eventName: string,
  input: { detail: string }
): Promise<WebhookResult> {
  await markCorrelationInvalid(lemonSubscriptionId, input.detail);
  logger.error("[LEMONSQUEEZY] billing.lemon.activation_rejected", {
    subscriptionId: lemonSubscriptionId,
    detail: input.detail,
  });
  return { outcome: "FAILED", eventName, reason: input.detail };
}

/**
 * Último intento de correlacionar un pago sin correlación previa, SIN adivinar:
 *   a. `custom_data` de la propia factura, si LemonSqueezy lo propaga;
 *   b. una Subscription local que ya apunte a esa suscripción de LemonSqueezy
 *      (alta anterior a esta fase, o reactivación).
 * El email NUNCA se usa: dos cuentas pueden compartirlo o cambiarlo.
 */
async function correlateFromPayloadOrSubscription(
  payload: LemonWebhookPayload,
  invoice: LemonInvoiceView
): Promise<Correlation | null> {
  const subscriptionId = invoice.subscriptionId;
  if (!subscriptionId) return null;

  const custom = payload.meta?.custom_data ?? {};
  let tenantId = custom.tenant_id ?? null;
  let planId = custom.plan_id ?? null;

  if (!tenantId || !planId) {
    const local = await prisma.subscription.findFirst({
      where: { lemonSqueezySubscriptionId: subscriptionId },
      select: { tenantId: true, planId: true },
    });
    if (local) {
      tenantId = tenantId ?? local.tenantId;
      planId = planId ?? local.planId;
    }
  }

  if (!tenantId || !planId) return null;

  // Se valida antes de persistir: `custom_data` no se cree por sí solo.
  const validation = await validateTenantAndPlan({
    tenantId,
    planId,
    variantId: null,
    requireVariant: false,
  });
  if (!validation.ok) return null;

  return correlateSubscription({
    lemonSqueezySubscriptionId: subscriptionId,
    tenantId: validation.tenantId,
    planId: validation.plan.id,
    expectedVariantId: validation.expectedVariantId,
    lemonSqueezyCustomerId: invoice.customerId,
    lemonSqueezyOrderId: null,
    lemonSqueezyProductId: null,
    lemonSqueezyVariantId: null,
    testMode: invoice.testMode,
  });
}
