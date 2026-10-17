/**
 * Doble de la API de LemonSqueezy y utilidades para firmar webhooks.
 *
 * Intercepta `axios.defaults.adapter`, igual que el doble de Meta en
 * `external-mocks.ts`: el cliente de LS usa la instancia por defecto de axios
 * justamente para que ninguna suite pueda salir a internet.
 *
 * Cualquier URL que no sea la de LemonSqueezy hace fallar la prueba: si una
 * suite llega a otro host, es un bug de la prueba.
 */
import axios, { AxiosHeaders, type AxiosAdapter } from "axios";

import { signPayload } from "../../src/services/billing/lemon-squeezy/lemonSqueezy.webhook-signature.service.js";

export type LemonCall = {
  url: string;
  method: string;
  /** Cuerpo JSON:API enviado, ya parseado. */
  body: Record<string, unknown>;
  /** Cabecera Authorization completa: la prueba comprueba que se manda bien. */
  authorization: string;
  accept: string;
  contentType: string;
};

export const lemonCalls: LemonCall[] = [];

/** Respuesta que devolverá la PRÓXIMA llamada (se consume una vez). */
type QueuedResponse = { status: number; data: unknown };
let queued: QueuedResponse[] = [];

/** La próxima llamada a LS responderá con este status y cuerpo. */
export function queueLemonResponse(status: number, data: unknown): void {
  queued.push({ status, data });
}

/** Checkout creado con éxito (respuesta por defecto). */
export function checkoutCreatedResponse(url = "https://sendwary.lemonsqueezy.com/checkout/abc123") {
  return {
    data: { type: "checkouts", id: "chk_test_1", attributes: { url } },
  };
}

let originalAdapter: AxiosAdapter | undefined;
let installed = false;

/** Instala el doble. Idempotente: llamarlo dos veces no encadena adapters. */
export function installLemonSqueezyMock(): void {
  if (installed) return;
  installed = true;
  originalAdapter = axios.defaults.adapter as AxiosAdapter | undefined;

  axios.defaults.adapter = (async (config) => {
    const url = String(config.url ?? "");
    if (!url.includes("lemonsqueezy.com")) {
      throw new Error(
        `Llamada HTTP no interceptada en pruebas: ${config.method ?? "?"} ${url}`
      );
    }

    const headers = config.headers as unknown as Record<string, string>;
    lemonCalls.push({
      url,
      method: String(config.method ?? "get").toUpperCase(),
      body: typeof config.data === "string" ? JSON.parse(config.data) : (config.data ?? {}),
      authorization: String(headers?.Authorization ?? ""),
      accept: String(headers?.Accept ?? ""),
      contentType: String(headers?.["Content-Type"] ?? ""),
    });

    const next = queued.shift() ?? { status: 201, data: checkoutCreatedResponse() };
    return {
      data: next.data,
      status: next.status,
      statusText: String(next.status),
      headers: new AxiosHeaders(),
      config,
    };
  }) as AxiosAdapter;
}

export function resetLemonSqueezyMock(): void {
  lemonCalls.length = 0;
  queued = [];
}

export function restoreLemonSqueezyMock(): void {
  if (!installed) return;
  axios.defaults.adapter = originalAdapter;
  installed = false;
  resetLemonSqueezyMock();
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Serializa el payload y lo firma como lo haría LemonSqueezy.
 *
 * Devuelve el string EXACTO que hay que mandar como body: firmar un objeto y
 * dejar que supertest lo re-serialice produciría bytes distintos y la firma no
 * cuadraría (que es justo el fallo que esta integración debe evitar).
 */
export function signedWebhook(
  payload: unknown,
  secret: string
): { raw: string; signature: string } {
  const raw = JSON.stringify(payload);
  return { raw, signature: signPayload(raw, secret) };
}

/** Payload de `subscriptions` con la forma real de LemonSqueezy. */
export function subscriptionPayload(input: {
  eventName: string;
  lemonSubscriptionId: string;
  tenantId?: string;
  planId?: string;
  variantId?: string | number;
  productId?: string | number;
  customerId?: string | number;
  orderId?: string | number;
  status?: string;
  renewsAt?: string | null;
  endsAt?: string | null;
  email?: string;
  updatedAt?: string;
  testMode?: boolean;
}) {
  return {
    meta: {
      event_name: input.eventName,
      test_mode: input.testMode ?? true,
      ...(input.tenantId || input.planId
        ? {
            custom_data: {
              ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
              ...(input.planId ? { plan_id: input.planId } : {}),
            },
          }
        : {}),
    },
    data: {
      type: "subscriptions",
      id: input.lemonSubscriptionId,
      attributes: {
        store_id: 99001,
        customer_id: input.customerId ?? 55001,
        order_id: input.orderId ?? 77001,
        order_item_id: 88001,
        product_id: input.productId ?? 1001,
        variant_id: input.variantId ?? 2001,
        product_name: "Sendwary",
        variant_name: "Mensual",
        user_name: "Cliente Prueba",
        user_email: input.email ?? "cliente@example.test",
        status: input.status ?? "active",
        card_brand: "visa",
        card_last_four: "4242",
        payment_processor: "stripe",
        pause: null,
        cancelled: input.status === "cancelled",
        trial_ends_at: null,
        billing_anchor: 12,
        renews_at: input.renewsAt === undefined ? "2027-01-15T10:00:00.000000Z" : input.renewsAt,
        ends_at: input.endsAt ?? null,
        created_at: "2026-12-15T10:00:00.000000Z",
        updated_at: input.updatedAt ?? "2026-12-15T10:00:00.000000Z",
        test_mode: input.testMode ?? true,
        first_subscription_item: {
          id: 66001,
          subscription_id: Number(input.lemonSubscriptionId) || 1,
          price_id: 44001,
          quantity: 1,
        },
      },
    },
  };
}
