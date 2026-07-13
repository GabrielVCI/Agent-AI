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

export async function createCheckout(input: {
  tenantId: string;
  planCode: string;
  userEmail: string;
}): Promise<{ checkoutUrl: string }> {
  if (!isLemonSqueezyConfigured()) {
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
            // El webhook usa este custom data para mapear el pago al tenant
            custom: { tenant_id: input.tenantId, plan_code: input.planCode },
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
  return { checkoutUrl };
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
  meta?: { event_name?: string; custom_data?: { tenant_id?: string; plan_code?: string } };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      customer_id?: number;
      order_id?: number;
      renews_at?: string | null;
      ends_at?: string | null;
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
      return "PAST_DUE";
    case "cancelled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    default:
      return null;
  }
}

/**
 * Procesa un evento de LemonSqueezy. Hoy: loguea todo y actualiza la
 * suscripción cuando el payload trae datos suficientes (tenant en custom_data
 * o suscripción ya vinculada por lemonSqueezySubscriptionId).
 */
export async function handleWebhookEvent(payload: LsWebhookPayload): Promise<{ handled: boolean; event: string }> {
  const event = payload.meta?.event_name ?? "unknown";
  const tenantId = payload.meta?.custom_data?.tenant_id ?? null;
  const planCode = payload.meta?.custom_data?.plan_code ?? null;
  const attrs = payload.data?.attributes ?? {};
  const lsId = payload.data?.id ? String(payload.data.id) : null;

  logger.info(
    `[LEMONSQUEEZY] evento ${event} (tenant=${tenantId ?? "?"}, plan=${planCode ?? "?"}, id=${lsId ?? "?"})`
  );

  const subscriptionEvents = [
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_expired",
    "subscription_payment_success",
    "subscription_payment_failed",
  ];

  if (event === "order_created") {
    // Solo trazabilidad por ahora: el estado real lo fijan los eventos de suscripción
    return { handled: true, event };
  }

  if (!subscriptionEvents.includes(event)) {
    return { handled: false, event };
  }

  // Localizar la suscripción: por tenant del custom_data o por id de LS ya vinculado
  const subscription = tenantId
    ? await prisma.subscription.findUnique({ where: { tenantId } })
    : lsId
      ? await prisma.subscription.findFirst({ where: { lemonSqueezySubscriptionId: lsId } })
      : null;

  if (!subscription) {
    logger.warn(`[LEMONSQUEEZY] evento ${event} sin suscripción mapeable — solo logueado`);
    return { handled: false, event };
  }

  const mappedStatus =
    event === "subscription_cancelled"
      ? "CANCELLED"
      : event === "subscription_expired"
        ? "EXPIRED"
        : event === "subscription_payment_failed"
          ? "PAST_DUE"
          : mapLsStatus(attrs.status) ?? undefined;

  // Cambio de plan si el custom_data lo trae y existe localmente
  const newPlan = planCode
    ? await prisma.plan.findFirst({ where: { code: planCode, isActive: true } })
    : null;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      ...(mappedStatus ? { status: mappedStatus } : {}),
      ...(newPlan ? { planId: newPlan.id } : {}),
      ...(lsId ? { lemonSqueezySubscriptionId: lsId } : {}),
      ...(attrs.customer_id ? { lemonSqueezyCustomerId: String(attrs.customer_id) } : {}),
      ...(attrs.order_id ? { lemonSqueezyOrderId: String(attrs.order_id) } : {}),
      ...(attrs.renews_at !== undefined
        ? { renewsAt: attrs.renews_at ? new Date(attrs.renews_at) : null }
        : {}),
      ...(attrs.ends_at !== undefined
        ? { endsAt: attrs.ends_at ? new Date(attrs.ends_at) : null }
        : {}),
      ...(attrs.renews_at ? { currentPeriodEnd: new Date(attrs.renews_at) } : {}),
    },
  });

  logger.info(`[LEMONSQUEEZY] suscripción ${subscription.id} actualizada por ${event}`);
  return { handled: true, event };
}
