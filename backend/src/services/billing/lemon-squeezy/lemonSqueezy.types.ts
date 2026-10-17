/**
 * Forma de los webhooks de LemonSqueezy — solo los campos que Sendwary usa.
 *
 * Todo es opcional a propósito: el payload viene de fuera y jamás se asume
 * que un campo exista. Lo que falte queda sin tocar en la Subscription.
 */

export interface LemonWebhookMeta {
  event_name?: string;
  test_mode?: boolean;
  /** Identificadores internos que enviamos al crear el checkout. */
  custom_data?: {
    tenant_id?: string;
    user_id?: string;
    plan_id?: string;
    /** Legado: los checkouts anteriores mandaban el código comercial. */
    plan_code?: string;
  };
}

/** `data.attributes` de un recurso `subscriptions`. */
export interface LemonSubscriptionAttributes {
  /**
   * Presente en los recursos de FACTURA (`subscription-invoices`): apunta a la
   * suscripción a la que pertenece el cobro. En un recurso `subscriptions` el
   * id de la suscripción es `data.id`, no este campo.
   */
  subscription_id?: number | string;
  store_id?: number | string;
  customer_id?: number | string;
  order_id?: number | string;
  order_item_id?: number | string;
  product_id?: number | string;
  variant_id?: number | string;
  product_name?: string;
  variant_name?: string;
  user_name?: string;
  user_email?: string;
  status?: string;
  status_formatted?: string;
  card_brand?: string | null;
  card_last_four?: string | null;
  payment_processor?: string | null;
  pause?: { mode?: string; resumes_at?: string | null } | null;
  cancelled?: boolean;
  trial_ends_at?: string | null;
  billing_anchor?: number;
  renews_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  test_mode?: boolean;
  first_subscription_item?: {
    id?: number | string;
    subscription_id?: number | string;
    price_id?: number | string;
    quantity?: number;
  } | null;
  /** Solo en `orders`. */
  first_order_item?: { id?: number | string; variant_id?: number | string } | null;
}

export interface LemonWebhookPayload {
  meta?: LemonWebhookMeta;
  data?: {
    type?: string;
    id?: string | number;
    attributes?: LemonSubscriptionAttributes;
  };
}

// ── Utilidades de normalización ─────────────────────────────────────────────

/** Ids de LS llegan como number o string: en BD siempre string. */
export function asId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

/**
 * Id de la SUSCRIPCIÓN a la que se refiere el evento.
 *
 * Distinguirlo importa: en `subscription_payment_*` el recurso es una factura,
 * así que `data.id` es el id de la factura y la suscripción viene en
 * `attributes.subscription_id`. Confundirlos haría que un evento de pago no
 * encontrara al tenant — o, peor, que pisara `lemonSqueezySubscriptionId` con
 * el id de una factura.
 */
export function lemonSubscriptionIdOf(payload: LemonWebhookPayload): string | null {
  const type = payload.data?.type;
  if (type && type !== "subscriptions") {
    return asId(payload.data?.attributes?.subscription_id);
  }
  return asId(payload.data?.id) ?? asId(payload.data?.attributes?.subscription_id);
}

/** Fechas ISO de LS → Date; null/ausente → null. */
export function asDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ── Facturas de suscripción (`subscription-invoices`) ───────────────────────

/**
 * `data.attributes` de un recurso `subscription-invoices`.
 *
 * Es el recurso que viaja en `subscription_payment_*`. NO es la suscripción:
 * describe UN cobro. De aquí salen las dos respuestas que deciden si el primer
 * pago es real — `billing_reason` y `status` — y nada más: el estado de la
 * suscripción se lee del recurso `subscriptions` (webhook o API).
 */
export interface LemonInvoiceAttributes {
  store_id?: number | string;
  subscription_id?: number | string;
  customer_id?: number | string;
  user_name?: string;
  user_email?: string;
  /** "initial" (alta), "renewal" (renovación mensual), "updated" (cambio). */
  billing_reason?: string;
  card_brand?: string | null;
  card_last_four?: string | null;
  currency?: string;
  /** "pending" | "paid" | "void" | "refunded" | "partial_refund" */
  status?: string;
  status_formatted?: string;
  refunded?: boolean;
  refunded_at?: string | null;
  /** Importe en centavos. Solo se usa para auditoría, nunca para decidir. */
  total?: number;
  created_at?: string;
  updated_at?: string;
  test_mode?: boolean;
}

export interface LemonInvoicePayload {
  meta?: LemonWebhookMeta;
  data?: {
    type?: string;
    id?: string | number;
    attributes?: LemonInvoiceAttributes;
  };
}

/** Motivos de cobro que LemonSqueezy declara en una factura. */
export type LemonBillingReason = "initial" | "renewal" | "updated";

/** Tipo de recurso de una factura de suscripción en la API de LemonSqueezy. */
export const INVOICE_RESOURCE_TYPE = "subscription-invoices";

/** Vista normalizada de una factura: strings/Date, sin `number | string`. */
export interface LemonInvoiceView {
  invoiceId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  storeId: string | null;
  billingReason: string | null;
  status: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  currency: string | null;
  /** Centavos, tal cual los manda LemonSqueezy. */
  total: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  testMode: boolean;
}

/**
 * Lee la factura del webhook sin asumir NADA: todo lo ausente queda en null y
 * quien decide comprueba explícitamente lo que necesita.
 */
export function readInvoice(payload: LemonInvoicePayload): LemonInvoiceView {
  const attrs = payload.data?.attributes ?? {};
  return {
    invoiceId: asId(payload.data?.id),
    subscriptionId: asId(attrs.subscription_id),
    customerId: asId(attrs.customer_id),
    storeId: asId(attrs.store_id),
    billingReason: attrs.billing_reason ?? null,
    status: attrs.status ?? null,
    cardBrand: attrs.card_brand ?? null,
    cardLastFour: attrs.card_last_four ?? null,
    currency: attrs.currency ?? null,
    total: typeof attrs.total === "number" ? attrs.total : null,
    createdAt: asDate(attrs.created_at),
    updatedAt: asDate(attrs.updated_at),
    testMode: attrs.test_mode ?? payload.meta?.test_mode ?? false,
  };
}
