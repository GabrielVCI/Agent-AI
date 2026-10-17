-- LemonSqueezy: snapshot de suscripción + idempotencia de webhooks.
--
-- Migración ADITIVA: solo agrega columnas opcionales, una tabla nueva y sus
-- índices. No borra ni renombra nada, no toca datos existentes y es idempotente
-- (IF NOT EXISTS) para poder aplicarse sobre bases con drift previo.

-- ── Subscription: snapshot operativo de LemonSqueezy ────────────────────────
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyStoreId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyOrderItemId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyStatus" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyProductName" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyVariantName" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezySubscriptionItemId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyPriceId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyQuantity" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyCardBrand" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyCardLastFour" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyPaymentProcessor" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyCancelled" BOOLEAN;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyTrialEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyBillingAnchor" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyPauseJson" JSONB;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyTestMode" BOOLEAN;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyCreatedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lemonSqueezyUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastPaymentAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "lastPaymentFailedAt" TIMESTAMP(3);

-- Correlación de webhooks sin custom_data (consultas reales del sync service)
CREATE INDEX IF NOT EXISTS "Subscription_lemonSqueezyCustomerId_idx"
  ON "Subscription"("lemonSqueezyCustomerId");
CREATE INDEX IF NOT EXISTS "Subscription_lemonSqueezyOrderId_idx"
  ON "Subscription"("lemonSqueezyOrderId");

-- ── Idempotencia de webhooks ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LemonSqueezyWebhookStatus') THEN
    CREATE TYPE "LemonSqueezyWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "LemonSqueezyWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "LemonSqueezyWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "tenantId" TEXT,
    "subscriptionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LemonSqueezyWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LemonSqueezyWebhookEvent_dedupeKey_key"
  ON "LemonSqueezyWebhookEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "LemonSqueezyWebhookEvent_eventName_idx"
  ON "LemonSqueezyWebhookEvent"("eventName");
CREATE INDEX IF NOT EXISTS "LemonSqueezyWebhookEvent_status_idx"
  ON "LemonSqueezyWebhookEvent"("status");
CREATE INDEX IF NOT EXISTS "LemonSqueezyWebhookEvent_resourceId_idx"
  ON "LemonSqueezyWebhookEvent"("resourceId");
CREATE INDEX IF NOT EXISTS "LemonSqueezyWebhookEvent_tenantId_idx"
  ON "LemonSqueezyWebhookEvent"("tenantId");
CREATE INDEX IF NOT EXISTS "LemonSqueezyWebhookEvent_receivedAt_idx"
  ON "LemonSqueezyWebhookEvent"("receivedAt");
