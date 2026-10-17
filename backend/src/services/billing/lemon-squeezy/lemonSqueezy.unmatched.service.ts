import { Prisma } from "@prisma/client";

import { logger } from "../../../config/logger.js";
import { prisma } from "../../../config/prisma.js";
import { asId, lemonSubscriptionIdOf, type LemonWebhookPayload } from "./lemonSqueezy.types.js";

/**
 * Registro de eventos de billing que NO se pudieron asociar a ningún tenant.
 *
 * Es la contrapartida de la regla "nunca se activa un tenant adivinando": lo
 * que no se puede correlacionar no se descarta en silencio, queda anotado para
 * que el SUPER_ADMIN pueda resolverlo a mano.
 *
 * Vive en su propio módulo para que lo usen tanto el orquestador como los
 * handlers del alta sin que ninguno tenga que importar al otro.
 */
export async function logUnmatched(
  payload: LemonWebhookPayload,
  eventName: string,
  /** Motivo técnico corto: por qué no se pudo correlacionar. */
  reason?: string
): Promise<void> {
  const attrs = payload.data?.attributes ?? {};
  try {
    await prisma.unmatchedBillingWebhook.create({
      data: {
        eventName,
        lemonSqueezySubscriptionId: lemonSubscriptionIdOf(payload),
        customerEmail: attrs.user_email ?? null,
        // Solo lo necesario para investigar: ni datos de pago ni payload crudo.
        payloadJson: {
          resourceType: payload.data?.type ?? null,
          resourceId: asId(payload.data?.id),
          lemonStatus: attrs.status ?? null,
          variantId: asId(attrs.variant_id),
          productId: asId(attrs.product_id),
          customerId: asId(attrs.customer_id),
          orderId: asId(attrs.order_id),
          customData: payload.meta?.custom_data ?? null,
          testMode: payload.meta?.test_mode ?? false,
          ...(reason ? { reason } : {}),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error(`[LEMONSQUEEZY] no se pudo registrar unmatched webhook: ${String(err)}`);
  }
}
