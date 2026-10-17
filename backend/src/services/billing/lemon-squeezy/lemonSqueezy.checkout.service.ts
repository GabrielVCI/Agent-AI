import { env } from "../../../config/env.js";
import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import { AppError } from "../../../errors/AppError.js";
import { DASHBOARD_PATH, buildFrontendUrl } from "../../../utils/frontend-url.js";
import { lemonSqueezyRequest, type LemonSqueezyDocument } from "./lemonSqueezy.client.js";
import { requireLemonSqueezyCredentials } from "./lemonSqueezy.config.js";
import {
  findPurchasablePlan,
  requireLemonConfigForPlan,
} from "./lemonSqueezy.plan.js";

/**
 * Creación de checkouts de LemonSqueezy. UNA responsabilidad.
 *
 * NO sincroniza suscripciones, no toca el paywall y no sabe nada de webhooks:
 * devuelve una URL de checkout y se acaba su trabajo. El estado real de la
 * suscripción SIEMPRE lo fija el webhook.
 */

/** Atributos del checkout que consumimos de la respuesta de LS. */
interface CheckoutAttributes {
  url?: string;
  expires_at?: string | null;
}

export interface CreateCheckoutInput {
  /** Resuelto del usuario en sesión. NUNCA del body de la request. */
  tenantId: string;
  userId: string;
  userEmail: string;
  userName?: string | null;
  /** Identificador interno del plan elegido (id o code). */
  planId?: string;
  planCode?: string;
}

export interface CreateCheckoutResult {
  checkoutUrl: string;
  checkoutId: string | null;
  planId: string;
  planCode: string | null;
}

/** Datos internos que viajan en `custom_data` y vuelven en el webhook. */
export interface CheckoutCustomData {
  tenant_id: string;
  user_id: string;
  plan_id: string;
  plan_code?: string;
}

/**
 * Crea el checkout vía API (`POST /v1/checkouts`) y devuelve su URL.
 *
 * El backend resuelve por su cuenta store y variante:
 *   planId interno → Plan → lemonSqueezyVariantId → checkout
 * El cliente solo elige un plan; nunca puede inducir qué se compra.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const credentials = requireLemonSqueezyCredentials();

  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) {
    throw AppError.fromCode("TENANT_REQUIRED", {
      internalMessage: `createCheckout: tenant ${input.tenantId} inexistente`,
    });
  }

  const plan = await findPurchasablePlan({ planId: input.planId, planCode: input.planCode });
  const lemon = requireLemonConfigForPlan(plan);

  logger.info("[LEMONSQUEEZY] billing.checkout.create.started", {
    tenantId: tenant.id,
    planId: plan.id,
    planCode: plan.code,
  });

  const redirectUrl = env.LEMONSQUEEZY_SUCCESS_URL ?? buildFrontendUrl(DASHBOARD_PATH);
  logger.info("[LEMONSQUEEZY] billing.checkout.redirect_configured", {
    tenantId: tenant.id,
    redirectUrl,
    fromEnvOverride: Boolean(env.LEMONSQUEEZY_SUCCESS_URL),
  });

  // `custom_data` es la clave de correlación del webhook. Solo identificadores
  // internos: nunca tokens, cookies, secretos ni datos de pago.
  const customData: CheckoutCustomData = {
    tenant_id: tenant.id,
    user_id: input.userId,
    plan_id: plan.id,
    ...(plan.code ? { plan_code: plan.code } : {}),
  };

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_options: {
          // Overlay embebido sobre el panel (lemon.js). La misma URL sigue
          // funcionando como página completa si el overlay no carga.
          embed: true,
          media: true,
          logo: true,
          // El cobro es recurrente: el desglose de la suscripción queda a la
          // vista a propósito. No se oculta información de cobro.
          subscription_preview: true,
          desc: true,
        },
        checkout_data: {
          // Prellenado con lo que ya conocemos. Nada de PII extra.
          email: input.userEmail,
          ...(input.userName ? { name: input.userName } : {}),
          custom: customData,
        },
        product_options: {
          // A dónde lleva el botón "Continuar" de LemonSqueezy cuando el
          // cliente termina. Lo decide el BACKEND desde FRONTEND_URL: si el
          // navegador pudiera mandar su propia URL, esto sería un open redirect.
          // LEMONSQUEEZY_SUCCESS_URL sigue mandando si está configurada, para
          // no romper ambientes que ya la usan.
          redirect_url: redirectUrl,
        },
        ...(env.LEMONSQUEEZY_TEST_MODE ? { test_mode: true } : {}),
      },
      relationships: {
        store: { data: { type: "stores", id: String(credentials.storeId) } },
        variant: { data: { type: "variants", id: String(lemon.variantId) } },
      },
    },
  };

  const document = await lemonSqueezyRequest<LemonSqueezyDocument<CheckoutAttributes>>({
    method: "POST",
    path: "/v1/checkouts",
    body: payload,
    operation: "createCheckout",
  });

  const checkoutUrl = document.data?.attributes?.url;
  if (!checkoutUrl) {
    logger.error("[LEMONSQUEEZY] billing.checkout.create.failed", {
      tenantId: tenant.id,
      planId: plan.id,
      reason: "respuesta sin url",
    });
    throw AppError.fromCode("CHECKOUT_CREATION_FAILED", {
      internalMessage: "LemonSqueezy devolvió un checkout sin atributo url",
    });
  }

  logger.info("[LEMONSQUEEZY] billing.checkout.create.success", {
    tenantId: tenant.id,
    planId: plan.id,
    planCode: plan.code,
    checkoutId: document.data?.id ?? null,
  });

  return {
    checkoutUrl,
    checkoutId: document.data?.id ?? null,
    planId: plan.id,
    planCode: plan.code,
  };
}
