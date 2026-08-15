import axios from "axios";
import crypto from "crypto";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";

/**
 * Integración con LemonSqueezy (preparada, sin cobros reales hasta configurar
 * credenciales). La API key vive SOLO en el backend; el frontend recibe una
 * URL de checkout hosteada por LemonSqueezy y nunca toca datos de pago.
 */

const LS_API = "https://api.lemonsqueezy.com/v1";

export function isLemonSqueezyConfigured(): boolean {
  return Boolean(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID);
}

function variantIdForPlan(planCode: string): string | null {
  switch (planCode) {
    case "BASIC":
      return env.LEMONSQUEEZY_BASIC_VARIANT_ID ?? null;
    case "PRO":
      return env.LEMONSQUEEZY_PRO_VARIANT_ID ?? null;
    case "ENTERPRISE":
      return env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID ?? null;
    default:
      return null;
  }
}

function fallbackCheckoutUrlForPlan(planCode: string): string | null {
  switch (planCode) {
    case "BASIC":
      return env.LEMONSQUEEZY_BASIC_CHECKOUT_URL ?? null;
    case "PRO":
      return env.LEMONSQUEEZY_PRO_CHECKOUT_URL ?? null;
    case "ENTERPRISE":
      return env.LEMONSQUEEZY_ENTERPRISE_CHECKOUT_URL ?? null;
    default:
      return null;
  }
}

/**
 * Fallback SIN API key: buy-link hosteado + custom data por query string
 * (soportado por LemonSqueezy: ?checkout[custom][k]=v). Así el webhook puede
 * asociar el pago al tenant igual que con la API.
 */
function buildFallbackCheckoutUrl(input: {
  planCode: string;
  tenantId: string;
  userId: string;
  userEmail: string;
}): string | null {
  const base = fallbackCheckoutUrlForPlan(input.planCode);
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("embed", "1");
  url.searchParams.set("checkout[custom][tenant_id]", input.tenantId);
  url.searchParams.set("checkout[custom][user_id]", input.userId);
  url.searchParams.set("checkout[custom][plan_code]", input.planCode);
  url.searchParams.set("checkout[email]", input.userEmail);
  return url.toString();
}

export async function createCheckout(input: {
  tenantId: string;
  planCode: string;
  userId: string;
  userEmail: string;
  userName?: string;
}): Promise<{ checkoutUrl: string; mode: "API" | "FALLBACK_LINK" }> {
  if (!isLemonSqueezyConfigured()) {
    // Sin API key: usar el buy-link estático con custom data por query.
    const fallback = buildFallbackCheckoutUrl(input);
    if (fallback) {
      logger.info(
        `[LEMONSQUEEZY] checkout fallback (buy-link) para tenant ${input.tenantId} plan ${input.planCode}`
      );
      return { checkoutUrl: fallback, mode: "FALLBACK_LINK" };
    }
    throw new AppError(
      "Billing provider not configured: el proveedor de pagos aún no está conectado. Contacta a soporte para cambiar de plan.",
      503
    );
  }

  // El variantId puede venir del plan en BD o de las env vars por código
  const plan = await prisma.plan.findFirst({
    where: { code: input.planCode, isActive: true },
  });
  const variantId = plan?.lemonSqueezyVariantId || variantIdForPlan(input.planCode);
  if (!variantId) {
    throw new AppError(
      `El plan ${input.planCode} no tiene variante de pago configurada`,
      503
    );
  }

  const response = await axios.post(
    `${LS_API}/checkouts`,
    {
      data: {
        type: "checkouts",
        attributes: {
          // Overlay embebido en el panel (lemon.js); la URL también funciona
          // como página completa si el overlay no está disponible.
          checkout_options: { embed: true },
          checkout_data: {
            email: input.userEmail,
            ...(input.userName ? { name: input.userName } : {}),
            // El webhook usa este custom data para mapear el pago al tenant
            custom: {
              tenant_id: input.tenantId,
              user_id: input.userId,
              plan_code: input.planCode,
            },
          },
          product_options: {
            ...(env.LEMONSQUEEZY_SUCCESS_URL
              ? { redirect_url: env.LEMONSQUEEZY_SUCCESS_URL }
              : {}),
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variantId) } },
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      timeout: 15_000,
    }
  );

  const checkoutUrl = response.data?.data?.attributes?.url;
  if (!checkoutUrl) {
    throw new AppError("LemonSqueezy no devolvió una URL de checkout", 502);
  }
  return { checkoutUrl, mode: "API" };
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const hmac = crypto
    .createHmac("sha256", env.LEMONSQUEEZY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

type LsWebhookPayload = {
  meta?: {
    event_name?: string;
    test_mode?: boolean;
    custom_data?: { tenant_id?: string; user_id?: string; plan_code?: string };
  };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      customer_id?: number;
      order_id?: number;
      product_id?: number;
      variant_id?: number;
      user_email?: string;
      renews_at?: string | null;
      ends_at?: string | null;
      created_at?: string;
      test_mode?: boolean;
    };
  };
};

/** Estado LS → estado interno de suscripción. */
function mapLsStatus(lsStatus: string | undefined): "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "TRIALING" | null {
  switch (lsStatus) {
    case "active":
      return "ACTIVE";
    case "on_trial":
      return "TRIALING";
    case "past_due":
    case "unpaid":
    case "paused":
      return "PAST_DUE";
    case "cancelled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    default:
      return null;
  }
}

/** variant_id de LS → Plan local (BD primero, env vars como respaldo). */
async function planForVariant(variantId: string | null, planCode: string | null) {
  if (planCode) {
    const byCode = await prisma.plan.findFirst({ where: { code: planCode, isActive: true } });
    if (byCode) return byCode;
  }
  if (!variantId) return null;
  const byDb = await prisma.plan.findFirst({
    where: { lemonSqueezyVariantId: variantId, isActive: true },
  });
  if (byDb) return byDb;
  const envMap: Record<string, string | undefined> = {
    BASIC: env.LEMONSQUEEZY_BASIC_VARIANT_ID,
    PRO: env.LEMONSQUEEZY_PRO_VARIANT_ID,
    ENTERPRISE: env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID,
  };
  const code = Object.entries(envMap).find(([, v]) => v && String(v) === variantId)?.[0];
  return code ? prisma.plan.findFirst({ where: { code, isActive: true } }) : null;
}

/** Registra un webhook que no se pudo asociar a ningún tenant (revisión admin). */
async function logUnmatchedWebhook(input: {
  eventName: string;
  lsSubscriptionId: string | null;
  customerEmail: string | null;
  payload: unknown;
}): Promise<void> {
  try {
    await prisma.unmatchedBillingWebhook.create({
      data: {
        eventName: input.eventName,
        lemonSqueezySubscriptionId: input.lsSubscriptionId,
        customerEmail: input.customerEmail,
        payloadJson: input.payload as never,
      },
    });
  } catch (err) {
    logger.error(`[LEMONSQUEEZY] no se pudo registrar unmatched webhook: ${String(err)}`);
  }
}

/**
 * Procesa un evento de LemonSqueezy (Parte F del paywall):
 * - Asocia por custom_data (tenant_id) → por lemonSqueezySubscriptionId ya
 *   vinculado → por email del customer contra el OWNER del tenant.
 * - Si no hay match: registra UnmatchedBillingWebhook y NO toca ningún tenant.
 * - CREA la Subscription si el tenant aún no tiene (registro self-service).
 * - Marca billingMode LEMONSQUEEZY y paymentStatus; guarda variant/product,
 *   fechas, lastWebhookAt y el evento crudo en metadataJson.
 */
export async function handleWebhookEvent(payload: LsWebhookPayload): Promise<{ handled: boolean; event: string }> {
  const event = payload.meta?.event_name ?? "unknown";
  const customTenantId = payload.meta?.custom_data?.tenant_id ?? null;
  const planCode = payload.meta?.custom_data?.plan_code ?? null;
  const attrs = payload.data?.attributes ?? {};
  const lsId = payload.data?.id ? String(payload.data.id) : null;
  const customerEmail = attrs.user_email ?? null;
  const testMode = payload.meta?.test_mode ?? attrs.test_mode ?? false;

  logger.info(
    `[LEMONSQUEEZY] evento ${event} (tenant=${customTenantId ?? "?"}, plan=${planCode ?? "?"}, ls=${lsId ?? "?"}, test=${testMode})`
  );

  const subscriptionEvents = [
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_expired",
    "subscription_paused",
    "subscription_unpaused",
    "subscription_plan_changed",
    "subscription_payment_success",
    "subscription_payment_failed",
  ];

  if (event === "order_created") {
    // Trazabilidad: el estado real lo fijan los eventos de suscripción.
    // Si trae tenant, guardamos el orderId de una vez.
    if (customTenantId && attrs.order_id) {
      await prisma.subscription
        .update({
          where: { tenantId: customTenantId },
          data: { lemonSqueezyOrderId: String(attrs.order_id), lastWebhookAt: new Date() },
        })
        .catch(() => undefined); // sin suscripción aún: la creará subscription_created
    }
    return { handled: true, event };
  }

  if (!subscriptionEvents.includes(event)) {
    return { handled: false, event };
  }

  // ── Resolver el tenant destino (NUNCA adivinando) ──
  // 1) custom_data.tenant_id (checkout creado por nosotros, API o buy-link)
  let tenantId = customTenantId;
  let existing = tenantId
    ? await prisma.subscription.findUnique({ where: { tenantId } })
    : null;

  // 2) suscripción ya vinculada por id de LS (eventos posteriores sin custom)
  if (!tenantId && lsId) {
    existing = await prisma.subscription.findFirst({
      where: { lemonSqueezySubscriptionId: lsId },
    });
    tenantId = existing?.tenantId ?? null;
  }

  // 3) email del customer == email de un OWNER (único) → su tenant
  if (!tenantId && customerEmail) {
    const owners = await prisma.user.findMany({
      where: { email: customerEmail.toLowerCase().trim(), role: "OWNER", tenantId: { not: null } },
      select: { tenantId: true },
    });
    const uniqueTenants = [...new Set(owners.map((o) => o.tenantId))];
    if (uniqueTenants.length === 1) {
      tenantId = uniqueTenants[0];
      existing = await prisma.subscription.findUnique({ where: { tenantId: tenantId! } });
      logger.info(`[LEMONSQUEEZY] asociado por email de owner (${customerEmail}) → tenant ${tenantId}`);
    }
  }

  if (!tenantId) {
    logger.warn(
      `[LEMONSQUEEZY] evento ${event} SIN tenant mapeable (email=${customerEmail ?? "?"}) — registrado para revisión admin`
    );
    await logUnmatchedWebhook({
      eventName: event,
      lsSubscriptionId: lsId,
      customerEmail,
      payload,
    });
    return { handled: false, event };
  }

  // ── Estado y plan ──
  const mappedStatus =
    event === "subscription_cancelled"
      ? ("CANCELLED" as const)
      : event === "subscription_expired"
        ? ("EXPIRED" as const)
        : event === "subscription_paused"
          ? ("PAST_DUE" as const)
          : event === "subscription_payment_failed"
            ? ("PAST_DUE" as const)
            : mapLsStatus(attrs.status);

  const variantId = attrs.variant_id ? String(attrs.variant_id) : null;
  const plan = await planForVariant(variantId, planCode);

  const paymentStatus =
    mappedStatus === "ACTIVE" || event === "subscription_payment_success"
      ? ("PAID" as const)
      : mappedStatus === "PAST_DUE"
        ? ("OVERDUE" as const)
        : undefined;

  const now = new Date();
  const sharedData = {
    ...(mappedStatus ? { status: mappedStatus } : {}),
    ...(plan ? { planId: plan.id } : {}),
    billingMode: "LEMONSQUEEZY" as const,
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(lsId ? { lemonSqueezySubscriptionId: lsId } : {}),
    ...(attrs.customer_id ? { lemonSqueezyCustomerId: String(attrs.customer_id) } : {}),
    ...(attrs.order_id ? { lemonSqueezyOrderId: String(attrs.order_id) } : {}),
    ...(variantId ? { lemonSqueezyVariantId: variantId } : {}),
    ...(attrs.product_id ? { lemonSqueezyProductId: String(attrs.product_id) } : {}),
    ...(attrs.renews_at !== undefined
      ? { renewsAt: attrs.renews_at ? new Date(attrs.renews_at) : null }
      : {}),
    ...(attrs.ends_at !== undefined
      ? { endsAt: attrs.ends_at ? new Date(attrs.ends_at) : null }
      : {}),
    ...(attrs.renews_at ? { currentPeriodEnd: new Date(attrs.renews_at) } : {}),
    lastWebhookAt: now,
    metadataJson: {
      lastEvent: event,
      lsStatus: attrs.status ?? null,
      testMode,
      receivedAt: now.toISOString(),
    } as never,
  };

  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data: sharedData });
    logger.info(`[LEMONSQUEEZY] suscripción ${existing.id} actualizada por ${event}`);
    return { handled: true, event };
  }

  // Tenant sin suscripción (registro self-service pagando por primera vez)
  if (!plan) {
    logger.warn(
      `[LEMONSQUEEZY] evento ${event} para tenant ${tenantId} sin plan mapeable (variant=${variantId ?? "?"}) — registrado`
    );
    await logUnmatchedWebhook({ eventName: event, lsSubscriptionId: lsId, customerEmail, payload });
    return { handled: false, event };
  }

  await prisma.subscription.create({
    data: {
      tenantId,
      planId: plan.id,
      status: mappedStatus ?? "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: attrs.renews_at
        ? new Date(attrs.renews_at)
        : new Date(now.getTime() + 30 * 86_400_000),
      ...sharedData,
    },
  });
  logger.info(`[LEMONSQUEEZY] suscripción CREADA para tenant ${tenantId} (${plan.code}) por ${event}`);
  return { handled: true, event };
}
