/**
 * Payloads con la forma REAL de LemonSqueezy para el alta de una suscripción.
 *
 * Están separados de `helpers/lemonsqueezy.ts` (que es el doble de la API y la
 * firma) porque aquí no hay infraestructura: son solo los dos documentos que
 * decide todo el flujo —la suscripción y la FACTURA— más la respuesta de
 * `GET /v1/subscriptions/:id` que el backend consulta antes de activar.
 */

export interface SubscriptionAttributesInput {
  storeId?: string | number;
  customerId?: string | number;
  orderId?: string | number;
  productId?: string | number;
  variantId?: string | number;
  status?: string;
  renewsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  testMode?: boolean;
  email?: string;
}

/** `data.attributes` de un recurso `subscriptions` de LemonSqueezy. */
export function subscriptionAttributes(input: SubscriptionAttributesInput = {}) {
  return {
    store_id: input.storeId ?? 99001,
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
    created_at: input.createdAt ?? "2026-12-15T10:00:00.000000Z",
    updated_at: input.updatedAt ?? "2026-12-15T10:00:00.000000Z",
    test_mode: input.testMode ?? true,
    first_subscription_item: { id: 66001, price_id: 44001, quantity: 1 },
  };
}

/**
 * Respuesta de `GET /v1/subscriptions/:id`. Es la fuente contra la que el
 * backend contrasta la factura antes de activar: por eso las pruebas la
 * encolan explícitamente y pueden hacerla mentir.
 */
export function subscriptionApiResponse(
  lemonSubscriptionId: string,
  input: SubscriptionAttributesInput = {}
) {
  return {
    data: {
      type: "subscriptions",
      id: String(lemonSubscriptionId),
      attributes: subscriptionAttributes(input),
    },
  };
}

export interface InvoicePayloadInput {
  eventName?: string;
  /** Id de la FACTURA (data.id). No es el de la suscripción. */
  invoiceId: string;
  /** Suscripción a la que pertenece el cobro (attributes.subscription_id). */
  lemonSubscriptionId: string;
  /** "initial" | "renewal" | "updated" */
  billingReason?: string;
  /** "paid" | "pending" | "void" | "refunded" | "partial_refund" */
  status?: string;
  customerId?: string | number;
  testMode?: boolean;
  createdAt?: string;
  updatedAt?: string;
  email?: string;
  /** Solo para probar el camino en que LS propaga custom_data en la factura. */
  tenantId?: string;
  planId?: string;
}

/**
 * Webhook `subscription_payment_success` con un recurso
 * `subscription-invoices`: la forma que LemonSqueezy manda de verdad.
 */
export function invoicePayload(input: InvoicePayloadInput) {
  return {
    meta: {
      event_name: input.eventName ?? "subscription_payment_success",
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
      type: "subscription-invoices",
      id: input.invoiceId,
      attributes: {
        store_id: 99001,
        subscription_id: Number(input.lemonSubscriptionId) || input.lemonSubscriptionId,
        customer_id: input.customerId ?? 55001,
        user_name: "Cliente Prueba",
        user_email: input.email ?? "cliente@example.test",
        billing_reason: input.billingReason ?? "initial",
        card_brand: "visa",
        card_last_four: "4242",
        currency: "USD",
        currency_rate: "1.0000",
        status: input.status ?? "paid",
        status_formatted: input.status === "pending" ? "Pending" : "Paid",
        refunded: false,
        refunded_at: null,
        subtotal: 4000,
        discount_total: 0,
        tax: 0,
        total: 4000,
        created_at: input.createdAt ?? "2026-12-15T10:05:00.000000Z",
        updated_at: input.updatedAt ?? "2026-12-15T10:05:00.000000Z",
        test_mode: input.testMode ?? true,
      },
    },
  };
}
