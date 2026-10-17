/**
 * Integración con LemonSqueezy — punto de entrada del módulo.
 *
 * Arquitectura (cada pieza hace UNA cosa):
 *
 *   lemonSqueezy.config.ts              credenciales y cabeceras (única fuente)
 *   lemonSqueezy.client.ts              HTTP contra la API de LS
 *   lemonSqueezy.errors.ts              errores del proveedor → AppError
 *   lemonSqueezy.plan.ts                Plan interno ↔ variante de LS
 *   lemonSqueezy.checkout.service.ts    crear checkout
 *   lemonSqueezy.webhook-signature...   verificar X-Signature (HMAC-SHA256)
 *   lemonSqueezy.webhook.service.ts     routing por evento + idempotencia
 *   lemonSqueezy.subscription-created...  correlaciona tenant/plan (NO activa)
 *   lemonSqueezy.payment-success...       primer pago confirmado → activación
 *   lemonSqueezy.correlation.service...   correlación persistente LS ↔ tenant
 *   lemonSqueezy.activation.service...    escritura atómica de la Subscription
 *   lemonSqueezy.validation.ts            validaciones cruzadas del alta
 *   lemonSqueezy.subscription-api.ts      GET /v1/subscriptions/:id
 *   lemonSqueezy.subscription-sync...   LS → Subscription de Sendwary
 *   lemonSqueezy.status-map.ts          estados LS → estados Sendwary
 *
 * La API key jamás sale de config.ts, jamás se loguea y jamás viaja al
 * frontend: este solo recibe una `checkoutUrl`.
 */

export {
  isLemonSqueezyConfigured,
  isLemonSqueezyWebhookConfigured,
  isLemonSqueezyTestMode,
} from "./lemonSqueezy.config.js";

export { createCheckout, type CreateCheckoutResult } from "./lemonSqueezy.checkout.service.js";

export {
  verifyWebhookSignature,
  signPayload,
  type SignatureResult,
} from "./lemonSqueezy.webhook-signature.service.js";

export {
  processWebhook,
  buildDedupeKey,
  hashRawBody,
  SUPPORTED_WEBHOOK_EVENTS,
} from "./lemonSqueezy.webhook.service.js";

export type { WebhookResult } from "./lemonSqueezy.webhook-outcome.js";

export { handleSubscriptionCreated } from "./lemonSqueezy.subscription-created.handler.js";
export {
  handleSubscriptionPaymentSuccess,
  activateFromCorrelation,
} from "./lemonSqueezy.payment-success.handler.js";
export {
  findCorrelation,
  correlateSubscription,
  type Correlation,
} from "./lemonSqueezy.correlation.service.js";
export { fetchLemonSubscription } from "./lemonSqueezy.subscription-api.js";

export {
  mapLemonSubscriptionStatus,
  paymentStatusForLemonStatus,
} from "./lemonSqueezy.status-map.js";

export {
  findPlanByVariantId,
  findPurchasablePlan,
  lemonConfigForPlan,
  requireLemonConfigForPlan,
} from "./lemonSqueezy.plan.js";

export type { LemonWebhookPayload } from "./lemonSqueezy.types.js";
