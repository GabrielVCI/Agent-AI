import type { Plan } from "@prisma/client";

import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";
import { AppError } from "../../../errors/AppError.js";

/**
 * Resolución Plan interno ↔ configuración comercial de LemonSqueezy.
 *
 * La configuración vive en el PLAN (Plan.lemonSqueezyVariantId /
 * lemonSqueezyProductId). Las variables de entorno por código
 * (LEMONSQUEEZY_BASIC_VARIANT_ID...) se conservan como respaldo para no romper
 * los ambientes ya configurados así, pero el Plan manda.
 *
 * La Subscription guarda qué variante se compró REALMENTE (snapshot); no es
 * configuración, es trazabilidad.
 */

/** Variante configurada por env para un código de plan (respaldo legado). */
function variantIdFromEnv(planCode: string | null): string | null {
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

export interface PlanLemonConfig {
  /** Variante que se compra. Es la pieza que define la modalidad adquirida. */
  variantId: string;
  /** Producto asociado: trazabilidad y validación cruzada. Puede faltar. */
  productId: string | null;
}

/** Configuración de LS del plan, o null si el plan no está habilitado para pago online. */
export function lemonConfigForPlan(plan: Plan): PlanLemonConfig | null {
  const variantId = plan.lemonSqueezyVariantId || variantIdFromEnv(plan.code);
  if (!variantId) return null;
  return { variantId: String(variantId), productId: plan.lemonSqueezyProductId ?? null };
}

/** Igual que el anterior, pero lanzando el error de negocio correspondiente. */
export function requireLemonConfigForPlan(plan: Plan): PlanLemonConfig {
  const config = lemonConfigForPlan(plan);
  if (!config) {
    throw AppError.fromCode("PLAN_NOT_CONFIGURED", {
      internalMessage: `Plan ${plan.code ?? plan.id} sin lemonSqueezyVariantId (ni en BD ni en env)`,
    });
  }
  return config;
}

/**
 * Plan activo por id interno. Acepta también el `code` comercial para no
 * romper el contrato legado del frontend (`{ planCode: "PRO" }`).
 *
 * NO acepta variantId ni productId: los ids de LemonSqueezy jamás vienen del
 * cliente — si vinieran, cualquiera podría comprar una variante no autorizada.
 */
export async function findPurchasablePlan(input: {
  planId?: string;
  planCode?: string;
}): Promise<Plan> {
  const plan = input.planId
    ? await prisma.plan.findFirst({ where: { id: input.planId, isActive: true } })
    : input.planCode
      ? await prisma.plan.findFirst({ where: { code: input.planCode, isActive: true } })
      : null;

  if (!plan) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      message: "El plan seleccionado no está disponible.",
      internalMessage: `Plan no encontrado o inactivo (planId=${input.planId ?? "-"}, planCode=${input.planCode ?? "-"})`,
    });
  }
  return plan;
}

/**
 * Plan local que corresponde a una variante de LemonSqueezy (camino inverso,
 * usado al sincronizar webhooks). BD primero; env como respaldo.
 */
export async function findPlanByVariantId(variantId: string | null): Promise<Plan | null> {
  if (!variantId) return null;

  const byDb = await prisma.plan.findFirst({
    where: { lemonSqueezyVariantId: String(variantId), isActive: true },
  });
  if (byDb) return byDb;

  const envMap: Record<string, string | undefined> = {
    BASIC: env.LEMONSQUEEZY_BASIC_VARIANT_ID,
    PRO: env.LEMONSQUEEZY_PRO_VARIANT_ID,
    ENTERPRISE: env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID,
  };
  const code = Object.entries(envMap).find(([, v]) => v && String(v) === String(variantId))?.[0];
  return code ? prisma.plan.findFirst({ where: { code, isActive: true } }) : null;
}
