import { Prisma, type LemonSqueezySubscriptionCorrelation } from "@prisma/client";

import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";

/**
 * Correlación persistente "suscripción de LemonSqueezy ↔ tenant + plan".
 *
 * Por qué existe: el alta se reparte entre dos eventos que traen datos
 * distintos. `subscription_created` trae `meta.custom_data` (tenant y plan)
 * pero NO confirma el cobro; `subscription_payment_success` trae la factura
 * (billing_reason, status) y puede no traer `custom_data`. Guardar el vínculo
 * aquí es lo que permite que el pago —la única autoridad para activar— sepa a
 * quién activar, y que ambos eventos lleguen en CUALQUIER orden.
 *
 * Esta fila NO concede acceso. El entitlement vive en Subscription; aquí solo
 * hay estado técnico de emparejamiento.
 */

export type Correlation = LemonSqueezySubscriptionCorrelation;

/** Máximo que se guarda de un motivo técnico (nunca payload ni secretos). */
const MAX_ERROR_LENGTH = 500;

export interface CorrelationSeed {
  lemonSqueezySubscriptionId: string;
  tenantId: string;
  planId: string;
  /** Variante que el Plan declara. El primer pago debe cobrar exactamente esta. */
  expectedVariantId: string | null;
  lemonSqueezyCustomerId: string | null;
  lemonSqueezyOrderId: string | null;
  lemonSqueezyProductId: string | null;
  lemonSqueezyVariantId: string | null;
  testMode: boolean | null;
}

/** Correlación por id de suscripción de LemonSqueezy (la clave fuerte). */
export async function findCorrelation(
  lemonSqueezySubscriptionId: string
): Promise<Correlation | null> {
  return prisma.lemonSqueezySubscriptionCorrelation.findUnique({
    where: { lemonSqueezySubscriptionId },
  });
}

/**
 * Persiste la correlación que deja `subscription_created`.
 *
 * Idempotente y segura bajo concurrencia: `lemonSqueezySubscriptionId` es
 * UNIQUE, así que dos entregas simultáneas del mismo evento producen una sola
 * fila (la segunda choca con P2002 y se resuelve como update).
 *
 * NO pisa un pago ya registrado: si la factura llegó primero
 * (PENDING_CORRELATION), el pago se conserva y la fila queda en PAID, lista
 * para que el llamador complete la activación diferida.
 */
export async function correlateSubscription(seed: CorrelationSeed): Promise<Correlation> {
  const data = {
    tenantId: seed.tenantId,
    planId: seed.planId,
    expectedVariantId: seed.expectedVariantId,
    lemonSqueezyCustomerId: seed.lemonSqueezyCustomerId,
    lemonSqueezyOrderId: seed.lemonSqueezyOrderId,
    lemonSqueezyProductId: seed.lemonSqueezyProductId,
    lemonSqueezyVariantId: seed.lemonSqueezyVariantId,
    testMode: seed.testMode,
  };

  // Una correlación YA procesada no se degrada: la suscripción local existe y
  // un `subscription_created` reenviado no puede devolverla a "pendiente".
  const nextStatus = (current: Correlation): Correlation["status"] => {
    if (current.status === "PROCESSED" || current.status === "PAID") return current.status;
    // El pago llegó antes que la correlación: ahora ya sabemos de quién es.
    if (current.paidInvoiceId) return "PAID";
    return "PENDING_PAYMENT";
  };

  const existing = await findCorrelation(seed.lemonSqueezySubscriptionId);
  if (existing) {
    return prisma.lemonSqueezySubscriptionCorrelation.update({
      where: { id: existing.id },
      data: { ...data, status: nextStatus(existing), lastError: null },
    });
  }

  try {
    return await prisma.lemonSqueezySubscriptionCorrelation.create({
      data: {
        lemonSqueezySubscriptionId: seed.lemonSqueezySubscriptionId,
        ...data,
        status: "PENDING_PAYMENT",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Carrera: otro worker creó la fila entre el find y el create.
      const raced = await findCorrelation(seed.lemonSqueezySubscriptionId);
      if (raced) {
        return prisma.lemonSqueezySubscriptionCorrelation.update({
          where: { id: raced.id },
          data: { ...data, status: nextStatus(raced), lastError: null },
        });
      }
    }
    throw err;
  }
}

export interface DeferredPaymentInput {
  lemonSqueezySubscriptionId: string;
  paidInvoiceId: string;
  paidAt: Date;
  lemonSqueezyCustomerId: string | null;
  testMode: boolean | null;
  reason: string;
}

/**
 * Registra un primer pago que llegó ANTES de saber de qué tenant es.
 *
 * No se inventa tenant ni se busca por email: la factura queda guardada y la
 * activación se completa sola cuando llegue `subscription_created` con su
 * `custom_data`. Sin sleeps, sin memoria del proceso, sin reintentos ciegos.
 */
export async function recordDeferredPayment(
  input: DeferredPaymentInput
): Promise<Correlation> {
  const data = {
    paidInvoiceId: input.paidInvoiceId,
    paidAt: input.paidAt,
    ...(input.lemonSqueezyCustomerId
      ? { lemonSqueezyCustomerId: input.lemonSqueezyCustomerId }
      : {}),
    ...(input.testMode !== null ? { testMode: input.testMode } : {}),
    lastError: input.reason.slice(0, MAX_ERROR_LENGTH),
  };

  const existing = await findCorrelation(input.lemonSqueezySubscriptionId);
  if (existing) {
    // Si ya sabemos el tenant, el pago la deja PAID (lista para activar);
    // si no, sigue esperando la correlación.
    const status: Correlation["status"] =
      existing.status === "PROCESSED"
        ? "PROCESSED"
        : existing.tenantId
          ? "PAID"
          : "PENDING_CORRELATION";
    return prisma.lemonSqueezySubscriptionCorrelation.update({
      where: { id: existing.id },
      data: { ...data, status },
    });
  }

  try {
    return await prisma.lemonSqueezySubscriptionCorrelation.create({
      data: {
        lemonSqueezySubscriptionId: input.lemonSqueezySubscriptionId,
        ...data,
        status: "PENDING_CORRELATION",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await findCorrelation(input.lemonSqueezySubscriptionId);
      if (raced) {
        return prisma.lemonSqueezySubscriptionCorrelation.update({
          where: { id: raced.id },
          data,
        });
      }
    }
    throw err;
  }
}

/** Sella el pago confirmado sobre una correlación ya identificada. */
export async function markCorrelationPaid(
  id: string,
  input: { paidInvoiceId: string; paidAt: Date }
): Promise<Correlation> {
  return prisma.lemonSqueezySubscriptionCorrelation.update({
    where: { id },
    data: { status: "PAID", paidInvoiceId: input.paidInvoiceId, paidAt: input.paidAt },
  });
}

/**
 * Marca la correlación como inconsistente. Es un estado TERMINAL en esta fase:
 * nada se activa a partir de una correlación inválida; queda registrada para
 * revisión del SUPER_ADMIN.
 */
export async function markCorrelationInvalid(
  lemonSqueezySubscriptionId: string,
  reason: string
): Promise<void> {
  try {
    await prisma.lemonSqueezySubscriptionCorrelation.updateMany({
      where: { lemonSqueezySubscriptionId },
      data: { status: "INVALID", lastError: reason.slice(0, MAX_ERROR_LENGTH) },
    });
  } catch (err) {
    logger.error(`[LEMONSQUEEZY] no se pudo marcar la correlación inválida: ${String(err)}`);
  }
}

/** ¿Esta factura ya activó esta correlación? (idempotencia del primer pago). */
export function isInvoiceAlreadyProcessed(
  correlation: Correlation | null,
  invoiceId: string | null
): boolean {
  return Boolean(
    correlation &&
      correlation.status === "PROCESSED" &&
      invoiceId &&
      correlation.paidInvoiceId === invoiceId
  );
}
