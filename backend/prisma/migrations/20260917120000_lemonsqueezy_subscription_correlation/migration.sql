-- LemonSqueezy: correlación persistente "suscripción de LS ↔ tenant/plan".
--
-- Por qué: el alta se reparte entre DOS eventos con datos distintos.
--   · subscription_created        → trae meta.custom_data (tenant_id, plan_id)
--                                   pero NO confirma el cobro.
--   · subscription_payment_success → trae la FACTURA (billing_reason, status)
--                                   y puede NO traer custom_data.
-- Sin esta tabla, el único evento con autoridad para activar (el pago) no
-- sabría a qué tenant activar, y el orden de llegada dejaría de ser indiferente.
--
-- Migración ADITIVA e IDEMPOTENTE: crea un enum y una tabla nuevos. No altera
-- ninguna tabla existente, no borra ni renombra nada y no toca datos.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LemonSqueezyCorrelationStatus') THEN
    CREATE TYPE "LemonSqueezyCorrelationStatus" AS ENUM (
      'PENDING_PAYMENT',
      'PENDING_CORRELATION',
      'PAID',
      'PROCESSED',
      'INVALID'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "LemonSqueezySubscriptionCorrelation" (
    "id" TEXT NOT NULL,
    "lemonSqueezySubscriptionId" TEXT NOT NULL,
    -- Nulos solo mientras el pago llegó antes que subscription_created.
    -- Sin FOREIGN KEY a propósito: es una tabla técnica de billing que debe
    -- sobrevivir para soporte aunque el tenant se borre. tenantId y planId se
    -- RE-VALIDAN contra la BD antes de activar nada.
    "tenantId" TEXT,
    "planId" TEXT,
    "expectedVariantId" TEXT,
    "lemonSqueezyCustomerId" TEXT,
    "lemonSqueezyOrderId" TEXT,
    "lemonSqueezyProductId" TEXT,
    "lemonSqueezyVariantId" TEXT,
    "status" "LemonSqueezyCorrelationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paidInvoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "testMode" BOOLEAN,
    "subscriptionId" TEXT,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LemonSqueezySubscriptionCorrelation_pkey" PRIMARY KEY ("id")
);

-- UNIQUE: clave de correlación y barrera contra filas duplicadas bajo
-- concurrencia (dos webhooks simultáneos de la misma suscripción).
CREATE UNIQUE INDEX IF NOT EXISTS "LemonSqueezySubCorrelation_subscriptionId_key"
  ON "LemonSqueezySubscriptionCorrelation"("lemonSqueezySubscriptionId");

CREATE INDEX IF NOT EXISTS "LemonSqueezySubscriptionCorrelation_tenantId_idx"
  ON "LemonSqueezySubscriptionCorrelation"("tenantId");
CREATE INDEX IF NOT EXISTS "LemonSqueezySubscriptionCorrelation_status_idx"
  ON "LemonSqueezySubscriptionCorrelation"("status");
CREATE INDEX IF NOT EXISTS "LemonSqueezySubscriptionCorrelation_lemonSqueezyCustomerId_idx"
  ON "LemonSqueezySubscriptionCorrelation"("lemonSqueezyCustomerId");
