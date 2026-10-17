import { Prisma, type Plan, type Subscription } from "@prisma/client";

import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import type { Correlation } from "./lemonSqueezy.correlation.service.js";
import { mapLemonSubscriptionStatus } from "./lemonSqueezy.status-map.js";
import type { LemonSubscriptionView } from "./lemonSqueezy.subscription-api.js";
import type { LemonInvoiceView } from "./lemonSqueezy.types.js";

/**
 * Escritura de la Subscription local a partir de un PRIMER PAGO confirmado.
 *
 * Es el único sitio de la integración que puede conceder acceso, y solo se
 * llama cuando ya está todo validado: firma, factura `initial`, factura
 * `paid`, correlación, tenant, plan, variante y suscripción real de LS.
 *
 * Reglas duras:
 *  · UNA suscripción por tenant (UNIQUE Subscription.tenantId): si ya existe
 *    (alta manual previa, placeholder) se ACTUALIZA, nunca se crea una segunda.
 *  · Las fechas las manda LemonSqueezy (`renews_at`): jamás se suman 30 días
 *    a mano — no todos los meses tienen 30.
 *  · Atómico: la suscripción y el cierre de la correlación viajan en la misma
 *    transacción. Las llamadas HTTP a LemonSqueezy ocurren ANTES, nunca dentro.
 */

export interface ActivationInput {
  tenantId: string;
  plan: Plan;
  /** Suscripción tal como la devuelve LemonSqueezy (API o webhook). */
  lemonSubscription: LemonSubscriptionView;
  /** Factura del primer cobro (billing_reason=initial, status=paid). */
  invoice: LemonInvoiceView;
  correlation: Correlation;
  eventName: string;
}

export interface ActivationResult {
  subscription: Subscription;
  /** true si la fila se creó ahora; false si ya existía y se actualizó. */
  created: boolean;
}

/** ¿El P2002 es por la suscripción única del tenant? */
function isTenantUniqueConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.includes("tenantId"));
}

/**
 * Snapshot de LemonSqueezy → columnas de Subscription.
 *
 * Solo entra lo que LemonSqueezy TRAE: lo ausente no se pisa con null.
 * De la tarjeta, únicamente marca y últimos 4 dígitos (Sendwary nunca ve más).
 */
function subscriptionFields(
  lemon: LemonSubscriptionView,
  invoice: LemonInvoiceView
): Prisma.SubscriptionUncheckedUpdateInput {
  return {
    ...(lemon.id ? { lemonSqueezySubscriptionId: lemon.id } : {}),
    ...(lemon.storeId ? { lemonSqueezyStoreId: lemon.storeId } : {}),
    ...(lemon.customerId ? { lemonSqueezyCustomerId: lemon.customerId } : {}),
    ...(lemon.orderId ? { lemonSqueezyOrderId: lemon.orderId } : {}),
    ...(lemon.orderItemId ? { lemonSqueezyOrderItemId: lemon.orderItemId } : {}),
    ...(lemon.productId ? { lemonSqueezyProductId: lemon.productId } : {}),
    ...(lemon.variantId ? { lemonSqueezyVariantId: lemon.variantId } : {}),
    ...(lemon.productName ? { lemonSqueezyProductName: lemon.productName } : {}),
    ...(lemon.variantName ? { lemonSqueezyVariantName: lemon.variantName } : {}),
    ...(lemon.status ? { lemonSqueezyStatus: lemon.status } : {}),
    ...(lemon.subscriptionItemId
      ? { lemonSqueezySubscriptionItemId: lemon.subscriptionItemId }
      : {}),
    ...(lemon.priceId ? { lemonSqueezyPriceId: lemon.priceId } : {}),
    ...(lemon.quantity !== null ? { lemonSqueezyQuantity: lemon.quantity } : {}),
    // La factura también trae tarjeta: sirve cuando la suscripción aún no la
    // reporta. Marca y últimos 4 NO son datos de tarjeta.
    ...(lemon.cardBrand ?? invoice.cardBrand
      ? { lemonSqueezyCardBrand: lemon.cardBrand ?? invoice.cardBrand }
      : {}),
    ...(lemon.cardLastFour ?? invoice.cardLastFour
      ? { lemonSqueezyCardLastFour: lemon.cardLastFour ?? invoice.cardLastFour }
      : {}),
    ...(lemon.paymentProcessor
      ? { lemonSqueezyPaymentProcessor: lemon.paymentProcessor }
      : {}),
    ...(lemon.cancelled !== null ? { lemonSqueezyCancelled: lemon.cancelled } : {}),
    ...(lemon.trialEndsAt ? { lemonSqueezyTrialEndsAt: lemon.trialEndsAt } : {}),
    ...(lemon.billingAnchor !== null
      ? { lemonSqueezyBillingAnchor: lemon.billingAnchor }
      : {}),
    // test_mode: separa el entitlement de prueba del real. La factura manda si
    // la suscripción no lo declara.
    ...(lemon.testMode !== null
      ? { lemonSqueezyTestMode: lemon.testMode }
      : { lemonSqueezyTestMode: invoice.testMode }),
    ...(lemon.createdAt ? { lemonSqueezyCreatedAt: lemon.createdAt } : {}),
    ...(lemon.updatedAt ? { lemonSqueezyUpdatedAt: lemon.updatedAt } : {}),
  };
}

/**
 * Crea o activa la suscripción del tenant y cierra la correlación, todo en una
 * transacción.
 *
 * Concurrencia: dos entregas simultáneas del mismo primer pago compiten por el
 * UNIQUE de `tenantId`. La que pierde recibe P2002, la transacción entera se
 * reintenta UNA vez y entonces encuentra la fila y la actualiza. Resultado: una
 * sola suscripción, pase lo que pase.
 */
export async function activateSubscriptionFromFirstPayment(
  input: ActivationInput
): Promise<ActivationResult> {
  try {
    return await runActivation(input);
  } catch (err) {
    if (!isTenantUniqueConflict(err)) throw err;
    logger.warn("[LEMONSQUEEZY] billing.subscription.activation_raced", {
      tenantId: input.tenantId,
      eventName: input.eventName,
    });
    // El reintento ve la fila que creó el otro webhook y la actualiza.
    return runActivation(input);
  }
}

async function runActivation(input: ActivationInput): Promise<ActivationResult> {
  const { tenantId, plan, lemonSubscription: lemon, invoice, correlation } = input;
  const now = new Date();

  // El período lo dicta LemonSqueezy: inicio real de la suscripción (o, en su
  // defecto, la fecha de la factura) y `renews_at` como próxima fecha de cobro.
  const periodStart = lemon.createdAt ?? invoice.createdAt ?? now;
  const periodEnd = lemon.renewsAt ?? lemon.endsAt ?? periodStart;
  const status = mapLemonSubscriptionStatus(lemon.status) ?? "ACTIVE";

  const data: Prisma.SubscriptionUncheckedUpdateInput = {
    planId: plan.id,
    status,
    // El primer pago está confirmado por LemonSqueezy: PAID, no PENDING.
    paymentStatus: "PAID",
    // Deja de ser manual: a partir de aquí la cobra LemonSqueezy.
    billingMode: "LEMONSQUEEZY",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    renewsAt: lemon.renewsAt,
    endsAt: lemon.endsAt,
    nextBillingDate: lemon.renewsAt,
    lastPaymentAt: invoice.createdAt ?? now,
    lastWebhookAt: now,
    ...subscriptionFields(lemon, invoice),
    // Un alta pagada limpia los sellos de una cancelación anterior: si no, un
    // cliente que vuelve arrastraría "cancelada" con la suscripción activa.
    ...(status === "ACTIVE" ? { cancelRequestedAt: null, cancelledAt: null } : {}),
    // metadataJson NO es un volcado del webhook: solo lo necesario para soporte.
    metadataJson: {
      lastEvent: input.eventName,
      lemonStatus: lemon.status ?? null,
      testMode: lemon.testMode ?? invoice.testMode,
      activatedBy: "subscription_payment_success",
      billingReason: invoice.billingReason,
      invoiceId: invoice.invoiceId,
      receivedAt: now.toISOString(),
    } as Prisma.InputJsonValue,
  };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { tenantId } });

    const subscription = existing
      ? await tx.subscription.update({ where: { id: existing.id }, data })
      : await tx.subscription.create({
          data: {
            ...(data as Prisma.SubscriptionUncheckedCreateInput),
            tenantId,
            planId: plan.id,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        });

    // Cerrar la correlación dentro de la MISMA transacción es lo que hace que
    // "activado" y "factura consumida" no puedan separarse jamás.
    // `status: { not: PROCESSED }` la deja idempotente ante un reproceso.
    await tx.lemonSqueezySubscriptionCorrelation.updateMany({
      where: { id: correlation.id, status: { not: "PROCESSED" } },
      data: {
        status: "PROCESSED",
        subscriptionId: subscription.id,
        ...(invoice.invoiceId ? { paidInvoiceId: invoice.invoiceId } : {}),
        paidAt: invoice.createdAt ?? now,
        processedAt: now,
        lastError: null,
      },
    });

    return { subscription, created: !existing };
  });
}
