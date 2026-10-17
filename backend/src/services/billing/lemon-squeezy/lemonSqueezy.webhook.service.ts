import crypto from "node:crypto";

import { Prisma, type PaymentStatus, type SubscriptionStatus } from "@prisma/client";

import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import { handleSubscriptionPaymentSuccess } from "./lemonSqueezy.payment-success.handler.js";
import { handleSubscriptionCreated } from "./lemonSqueezy.subscription-created.handler.js";
import {
  resolvePlan,
  resolveTarget,
  syncSubscription,
} from "./lemonSqueezy.subscription-sync.service.js";
import { asId, type LemonWebhookPayload } from "./lemonSqueezy.types.js";
import { logUnmatched } from "./lemonSqueezy.unmatched.service.js";
import type { WebhookResult } from "./lemonSqueezy.webhook-outcome.js";

/**
 * Orquestador de los webhooks de LemonSqueezy.
 *
 * Recibe un evento YA VERIFICADO (la firma se comprueba antes, en el
 * controller) y hace, en este orden:
 *
 *   dedupe → persistir el evento → despachar al handler → marcar el resultado
 *
 * El reparto de autoridad, que es lo que de verdad importa aquí:
 *
 *   subscription_created         → CORRELACIONA tenant/plan. No da acceso.
 *   subscription_payment_success → confirma el PRIMER PAGO y, solo entonces,
 *                                  crea/activa la Subscription local.
 *   resto de eventos de ciclo    → sincronizan una suscripción que YA existe;
 *                                  jamás crean una nueva (crear es privilegio
 *                                  exclusivo del pago confirmado).
 *
 * El controller no contiene nada de esto: solo firma, parseo y status HTTP.
 */

export type { WebhookResult } from "./lemonSqueezy.webhook-outcome.js";

// ─── Eventos soportados ──────────────────────────────────────────────────────

/**
 * Cada evento de ciclo de vida declara qué le impone a la suscripción por
 * encima de lo que diga `attributes.status`. Tener handlers explícitos (y no
 * solo confiar en `subscription_updated`) hace que el efecto de cada evento sea
 * legible y testeable uno por uno.
 *
 * `forcedStatus` solo se usa cuando el evento ES la fuente del estado; si
 * `attributes.status` viene, el mapeo central ya lo cubre y no se fuerza nada.
 */
interface EventPolicy {
  /** Estado que impone el evento aunque `attributes.status` diga otra cosa. */
  forcedStatus?: SubscriptionStatus;
  paymentStatus?: PaymentStatus;
  stamp?: "PAID" | "FAILED";
}

const SUBSCRIPTION_EVENTS: Record<string, EventPolicy> = {
  // ── Ciclo de vida ──
  // Sincronización general: todo sale de `attributes`.
  subscription_updated: {},
  // Cancelada: el acceso sigue hasta ends_at (ver billing.service.ts).
  subscription_cancelled: { forcedStatus: "CANCELLED" },
  subscription_resumed: {},
  subscription_expired: { forcedStatus: "EXPIRED" },
  subscription_paused: { forcedStatus: "PAST_DUE" },
  subscription_unpaused: {},
  // Cambio de plan dentro de LS: la variante del payload decide el Plan.
  subscription_plan_changed: {},

  // ── Pagos (afectan paymentStatus, NO el status de la suscripción) ──
  subscription_payment_failed: { paymentStatus: "OVERDUE", stamp: "FAILED" },
  subscription_payment_recovered: { paymentStatus: "PAID", stamp: "PAID" },
  // Un reembolso NO cancela por sí solo la suscripción: representa la factura.
  // El estado real llegará por subscription_cancelled/expired si procede.
  subscription_payment_refunded: { paymentStatus: "OVERDUE" },
};

/**
 * Eventos con handler propio, fuera de la tabla de políticas: el alta no es
 * "sincronizar atributos", es decidir si hay derecho a acceso.
 */
const DEDICATED_HANDLERS: Record<
  string,
  (payload: LemonWebhookPayload, eventName: string) => Promise<WebhookResult>
> = {
  subscription_created: handleSubscriptionCreated,
  subscription_payment_success: handleSubscriptionPaymentSuccess,
};

/** Eventos de pago: sus atributos son de la FACTURA, no de la suscripción. */
const PAYMENT_EVENTS = new Set([
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
]);

// ─── Idempotencia ────────────────────────────────────────────────────────────

/** SHA-256 hex del cuerpo crudo. Es lo único del body que se persiste. */
export function hashRawBody(rawBody: Buffer | string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Identidad estable del evento: evento + tipo + id de recurso + hash del
 * cuerpo. Un reintento idéntico de LS produce la misma clave y choca contra el
 * UNIQUE; un evento posterior distinto (otro `updated_at`) cambia el hash y sí
 * se procesa.
 */
export function buildDedupeKey(input: {
  eventName: string;
  resourceType: string;
  resourceId: string | null;
  payloadHash: string;
}): string {
  return [
    input.eventName,
    input.resourceType,
    input.resourceId ?? "-",
    input.payloadHash.slice(0, 32),
  ].join(":");
}

// ─── Proceso ─────────────────────────────────────────────────────────────────

export interface ProcessWebhookInput {
  payload: LemonWebhookPayload;
  /** Cuerpo crudo ya verificado; se usa SOLO para calcular el hash. */
  rawBody: Buffer;
}

export async function processWebhook(input: ProcessWebhookInput): Promise<WebhookResult> {
  const { payload, rawBody } = input;
  const eventName = payload.meta?.event_name ?? "unknown";
  const resourceType = payload.data?.type ?? "unknown";
  const resourceId = asId(payload.data?.id);
  const payloadHash = hashRawBody(rawBody);
  const dedupeKey = buildDedupeKey({ eventName, resourceType, resourceId, payloadHash });

  logger.info("[LEMONSQUEEZY] billing.webhook.received", {
    eventName,
    resourceType,
    resourceId,
    testMode: payload.meta?.test_mode ?? false,
  });

  // ── 1. Dedupe persistente: la fila se crea ANTES de ejecutar efectos ──
  let eventRowId: string;
  try {
    const row = await prisma.lemonSqueezyWebhookEvent.create({
      data: { eventName, resourceType, resourceId, dedupeKey, payloadHash },
      select: { id: true },
    });
    eventRowId = row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Reintento idéntico de LemonSqueezy: no se vuelve a ejecutar nada.
      await prisma.lemonSqueezyWebhookEvent
        .update({ where: { dedupeKey }, data: { attemptCount: { increment: 1 } } })
        .catch(() => undefined);
      logger.info("[LEMONSQUEEZY] billing.webhook.duplicate", { eventName, resourceId });
      return { outcome: "DUPLICATE", eventName };
    }
    throw err;
  }

  try {
    const result = await routeEvent(payload, eventName);

    if (result.outcome === "PROCESSED") {
      await markEvent(eventRowId, "PROCESSED", {
        tenantId: result.tenantId,
        ...(result.subscriptionId ? { subscriptionId: result.subscriptionId } : {}),
        ...(result.detail ? { lastError: result.detail } : {}),
      });
      logger.info("[LEMONSQUEEZY] billing.webhook.processed", {
        eventName,
        tenantId: result.tenantId,
      });
    } else if (result.outcome === "IGNORED") {
      await markEvent(eventRowId, "IGNORED", { lastError: result.reason });
    } else if (result.outcome === "FAILED") {
      await markEvent(eventRowId, "FAILED", { lastError: result.reason });
      logger.warn("[LEMONSQUEEZY] billing.webhook.failed", { eventName, reason: result.reason });
    } else if (result.outcome === "RETRY") {
      // Fallo TRANSITORIO (p. ej. la API de LemonSqueezy no respondió): se
      // libera la clave de dedupe para que el reintento de LS sí se procese.
      await releaseEventForRetry(eventRowId, dedupeKey, result.reason);
      logger.warn("[LEMONSQUEEZY] billing.webhook.retry", { eventName, reason: result.reason });
    }

    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Igual que en RETRY: si el fallo fue nuestro, el reintento de LemonSqueezy
    // no puede quedar bloqueado por la fila de dedupe que dejó el intento roto.
    await releaseEventForRetry(eventRowId, dedupeKey, reason);
    logger.error("[LEMONSQUEEZY] billing.webhook.failed", { eventName, reason });
    throw err;
  }
}

async function markEvent(
  id: string,
  status: "PROCESSED" | "IGNORED" | "FAILED",
  extra: { tenantId?: string; subscriptionId?: string; lastError?: string } = {}
): Promise<void> {
  await prisma.lemonSqueezyWebhookEvent
    .update({
      where: { id },
      data: {
        status,
        processedAt: new Date(),
        ...(extra.tenantId ? { tenantId: extra.tenantId } : {}),
        ...(extra.subscriptionId ? { subscriptionId: extra.subscriptionId } : {}),
        ...(extra.lastError ? { lastError: extra.lastError.slice(0, 500) } : {}),
      },
    })
    .catch((err) => {
      // Que falle el marcado no debe tumbar un evento ya aplicado.
      logger.error(`[LEMONSQUEEZY] no se pudo marcar el evento ${id}: ${String(err)}`);
    });
}

/**
 * Deja el evento como FAILED pero LIBERA su `dedupeKey`.
 *
 * Sin esto, un fallo transitorio sería definitivo: la fila de dedupe quedaría
 * ocupada y el reintento de LemonSqueezy se respondería como duplicado sin
 * ejecutar nada. La fila se conserva (auditoría) con la clave "quemada".
 */
async function releaseEventForRetry(
  id: string,
  dedupeKey: string,
  reason: string
): Promise<void> {
  await prisma.lemonSqueezyWebhookEvent
    .update({
      where: { id },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        dedupeKey: `${dedupeKey}#retry-${id}`,
        lastError: reason.slice(0, 500),
      },
    })
    .catch((err) => {
      logger.error(`[LEMONSQUEEZY] no se pudo liberar el evento ${id}: ${String(err)}`);
    });
}

// ─── Routing por event_name ──────────────────────────────────────────────────

async function routeEvent(
  payload: LemonWebhookPayload,
  eventName: string
): Promise<WebhookResult> {
  // Alta: correlación y primer pago tienen handlers propios y son los únicos
  // que pueden hacer nacer una Subscription.
  const dedicated = DEDICATED_HANDLERS[eventName];
  if (dedicated) return dedicated(payload, eventName);

  const policy = SUBSCRIPTION_EVENTS[eventName];
  if (!policy) {
    // order_created, customer_updated, dispute_*, license_key_created...:
    // se reconocen y se responden 200 para que LS no reintente en bucle, pero
    // NO tocan el entitlement. El estado real lo fijan los eventos de arriba.
    return { outcome: "IGNORED", eventName, reason: `evento no manejado: ${eventName}` };
  }

  const target = await resolveTarget(payload);
  if (!target) {
    await logUnmatched(payload, eventName);
    return {
      outcome: "IGNORED",
      eventName,
      reason: "sin tenant correlacionable (registrado para revisión admin)",
    };
  }

  // Una suscripción que todavía no existe no se crea desde un evento de ciclo
  // de vida: sin primer pago confirmado no hay acceso que sincronizar.
  if (!target.existing) {
    return {
      outcome: "IGNORED",
      eventName,
      reason: "el tenant aún no tiene suscripción: solo el primer pago la crea",
    };
  }

  // ── Validación de la variante comprada (anti cross-plan) ──
  const isPaymentEvent = PAYMENT_EVENTS.has(eventName);
  const planResolution = await resolvePlan(payload);

  if (planResolution.mismatch) {
    // NO se activa nada en silencio: el evento queda FAILED para revisión.
    logger.error("[LEMONSQUEEZY] billing.lemon.variant_mismatch", {
      eventName,
      tenantId: target.tenantId,
      detail: planResolution.detail,
    });
    return {
      outcome: "FAILED",
      eventName,
      reason: `variante inconsistente: ${planResolution.detail ?? "sin detalle"}`,
    };
  }

  // En un evento de pago los atributos son de la FACTURA: no traen variante ni
  // fechas de la suscripción, así que no se toca el plan.
  const plan = isPaymentEvent ? null : planResolution.plan;

  const now = new Date();
  const sync = await syncSubscription({
    payload,
    target,
    plan,
    eventName,
    ...(policy.forcedStatus ? { forcedStatus: policy.forcedStatus } : {}),
    payment: {
      ...(policy.paymentStatus ? { paymentStatus: policy.paymentStatus } : {}),
      ...(policy.stamp === "PAID" ? { lastPaymentAt: now } : {}),
      ...(policy.stamp === "FAILED" ? { lastPaymentFailedAt: now } : {}),
    },
  });

  if (sync.status === "SKIPPED") {
    return { outcome: "IGNORED", eventName, reason: sync.reason };
  }

  if (policy.stamp === "PAID") {
    logger.info("[LEMONSQUEEZY] billing.payment.recovered", {
      tenantId: sync.tenantId,
      eventName,
    });
  } else if (policy.stamp === "FAILED") {
    logger.warn("[LEMONSQUEEZY] billing.payment.failed", {
      tenantId: sync.tenantId,
      eventName,
    });
  }

  return {
    outcome: "PROCESSED",
    eventName,
    tenantId: sync.tenantId,
    subscriptionId: sync.subscriptionId,
  };
}

/** Eventos que este servicio sabe manejar (para documentación y pruebas). */
export const SUPPORTED_WEBHOOK_EVENTS = [
  ...Object.keys(DEDICATED_HANDLERS),
  ...Object.keys(SUBSCRIPTION_EVENTS),
];
