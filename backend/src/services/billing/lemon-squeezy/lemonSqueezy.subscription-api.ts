import { lemonSqueezyRequest, type LemonSqueezyDocument } from "./lemonSqueezy.client.js";
import {
  asDate,
  asId,
  type LemonSubscriptionAttributes,
} from "./lemonSqueezy.types.js";

/**
 * Lectura de una suscripción en la API de LemonSqueezy.
 *
 * Existe por una razón concreta: la factura de `subscription_payment_success`
 * NO trae la variante, ni el producto, ni `renews_at`. Antes de activar a nadie
 * se le pregunta a LemonSqueezy —fuente de verdad— qué suscripción es esa de
 * verdad, y se contrasta con lo que la factura afirma.
 *
 * Pasa por `lemonSqueezyRequest` a propósito: ni un solo `fetch`/`axios` con
 * `Bearer ...` fuera del cliente central (ver lemonSqueezy.client.ts).
 */

/** Suscripción de LemonSqueezy normalizada (strings/Date, sin `number | string`). */
export interface LemonSubscriptionView {
  id: string | null;
  storeId: string | null;
  customerId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  productId: string | null;
  variantId: string | null;
  productName: string | null;
  variantName: string | null;
  status: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  paymentProcessor: string | null;
  cancelled: boolean | null;
  trialEndsAt: Date | null;
  billingAnchor: number | null;
  renewsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  testMode: boolean | null;
  subscriptionItemId: string | null;
  priceId: string | null;
  quantity: number | null;
  /** Atributos crudos, para poder reutilizar el mapeo de snapshot existente. */
  attributes: LemonSubscriptionAttributes;
}

/** Normaliza el recurso `subscriptions` venga de la API o de un webhook. */
export function toSubscriptionView(
  id: string | null,
  attrs: LemonSubscriptionAttributes
): LemonSubscriptionView {
  const item = attrs.first_subscription_item ?? null;
  return {
    id,
    storeId: asId(attrs.store_id),
    customerId: asId(attrs.customer_id),
    orderId: asId(attrs.order_id),
    orderItemId: asId(attrs.order_item_id),
    productId: asId(attrs.product_id),
    variantId: asId(attrs.variant_id),
    productName: attrs.product_name ?? null,
    variantName: attrs.variant_name ?? null,
    status: attrs.status ?? null,
    cardBrand: attrs.card_brand ?? null,
    cardLastFour: attrs.card_last_four ?? null,
    paymentProcessor: attrs.payment_processor ?? null,
    cancelled: typeof attrs.cancelled === "boolean" ? attrs.cancelled : null,
    trialEndsAt: asDate(attrs.trial_ends_at),
    billingAnchor: typeof attrs.billing_anchor === "number" ? attrs.billing_anchor : null,
    renewsAt: asDate(attrs.renews_at),
    endsAt: asDate(attrs.ends_at),
    createdAt: asDate(attrs.created_at),
    updatedAt: asDate(attrs.updated_at),
    testMode: typeof attrs.test_mode === "boolean" ? attrs.test_mode : null,
    subscriptionItemId: asId(item?.id),
    priceId: asId(item?.price_id),
    quantity: typeof item?.quantity === "number" ? item.quantity : null,
    attributes: attrs,
  };
}

/**
 * GET /v1/subscriptions/:id
 *
 * Lanza AppError ya traducido si LemonSqueezy falla (el llamador decide si eso
 * es "reintentar" o "no activar"). Nunca se llama dentro de una transacción:
 * una request HTTP colgada no puede mantener abierta una transacción de la BD.
 */
export async function fetchLemonSubscription(
  subscriptionId: string
): Promise<LemonSubscriptionView | null> {
  const document = await lemonSqueezyRequest<
    LemonSqueezyDocument<LemonSubscriptionAttributes>
  >({
    method: "GET",
    path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    operation: "getSubscription",
  });

  const resource = document.data;
  if (!resource?.attributes) return null;
  return toSubscriptionView(asId(resource.id), resource.attributes);
}
