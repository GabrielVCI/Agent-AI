import type { Plan } from "@prisma/client";

import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";
import { findPlanByVariantId, lemonConfigForPlan } from "./lemonSqueezy.plan.js";

/**
 * Validaciones cruzadas del alta de LemonSqueezy.
 *
 * Principio: `custom_data` lo pusimos nosotros, pero viaja por fuera y vuelve
 * en un webhook — NO se confía en él a ciegas. Todo lo que declara se contrasta
 * contra la base de datos y contra lo que LemonSqueezy dice haber cobrado. Si
 * las dos fuentes no coinciden, no se activa nada.
 */

export type ValidationFailure = {
  ok: false;
  /** Motivo técnico corto, apto para log y para `lastError`. Sin secretos. */
  detail: string;
  /** true cuando la inconsistencia es de variante/producto (posible fraude). */
  mismatch: boolean;
};

export type TenantPlanValidation =
  | {
      ok: true;
      tenantId: string;
      plan: Plan;
      /** Variante que el Plan declara; el cobro debe corresponder a esta. */
      expectedVariantId: string | null;
    }
  | ValidationFailure;

/**
 * ¿Existe el tenant que declara `custom_data`?
 *
 * Es lo primero: un tenant inexistente (o borrado) no puede activarse, y
 * tampoco se busca "alguno parecido". Nunca se adivina.
 */
export async function findTenantById(tenantId: string | null | undefined) {
  if (!tenantId) return null;
  return prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
}

/**
 * Valida tenant + plan + variante a la vez.
 *
 * La VARIANTE COBRADA manda: es lo que el cliente pagó de verdad. Si
 * `custom_data` declara otro plan, es una inconsistencia y se rechaza — sin
 * esta comprobación bastaría con manipular el checkout para declarar un plan
 * caro pagando la variante barata.
 */
export async function validateTenantAndPlan(input: {
  tenantId: string | null | undefined;
  planId: string | null | undefined;
  /** Variante que LemonSqueezy afirma haber cobrado. */
  variantId: string | null;
  /** true cuando la variante es obligatoria (no se puede activar sin ella). */
  requireVariant: boolean;
}): Promise<TenantPlanValidation> {
  const tenant = await findTenantById(input.tenantId);
  if (!tenant) {
    return {
      ok: false,
      mismatch: false,
      detail: `tenant inexistente o no declarado (tenant_id=${input.tenantId ?? "-"})`,
    };
  }

  const planByVariant = await findPlanByVariantId(input.variantId);
  const planByCustom = input.planId
    ? await prisma.plan.findUnique({ where: { id: input.planId } })
    : null;

  if (planByVariant && planByCustom && planByVariant.id !== planByCustom.id) {
    return {
      ok: false,
      mismatch: true,
      detail: `variant ${input.variantId} mapea al plan ${planByVariant.code ?? planByVariant.id} pero custom_data declara ${planByCustom.code ?? planByCustom.id}`,
    };
  }

  if (input.requireVariant && !planByVariant) {
    return {
      ok: false,
      mismatch: true,
      detail: `la variante cobrada (${input.variantId ?? "-"}) no corresponde a ningún plan activo`,
    };
  }

  const plan = planByVariant ?? planByCustom;
  if (!plan) {
    return {
      ok: false,
      mismatch: false,
      detail: `plan no resoluble (variant=${input.variantId ?? "-"}, custom plan=${input.planId ?? "-"})`,
    };
  }

  return {
    ok: true,
    tenantId: tenant.id,
    plan,
    expectedVariantId: lemonConfigForPlan(plan)?.variantId ?? null,
  };
}

/**
 * Coherencia de ambiente (§test mode).
 *
 * Una suscripción de TEST MODE no puede dar acceso en producción: sería acceso
 * gratis con un checkout de prueba. Fuera de producción no se bloquea nada —
 * staging y desarrollo trabajan justamente en test mode.
 */
export function testModeMismatch(testMode: boolean | null): string | null {
  const isTest = testMode === true;
  const productionLike = env.NODE_ENV === "production" && env.APP_ENV === "production";
  if (isTest && productionLike && env.LEMONSQUEEZY_TEST_MODE !== true) {
    return "suscripción de test_mode recibida en producción";
  }
  return null;
}
