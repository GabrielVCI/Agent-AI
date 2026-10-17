-- ============================================================================
-- Módulo 3 — Historial de servicios, visitas y recurrencias
--
-- Migración INCREMENTAL y NO destructiva. Todo es CREATE/ADD con IF NOT EXISTS
-- (o envuelto en DO $$ ... EXCEPTION WHEN duplicate_object $$): no borra
-- columnas, no borra filas, no toca las citas existentes y puede ejecutarse
-- varias veces sin efecto secundario.
--
-- `Appointment.serviceOrProduct` y `catalogItemId` NO se tocan: siguen siendo
-- lo que se agendó y lo que consumen el inbox, el agente IA y el Excel.
--
-- Aplicar en producción ANTES de desplegar el backend:
--   psql "$DIRECT_URL" -f prisma/sql/2026-08-18_service_history.sql
--
-- Después, para rellenar `completedAt` de las citas ya cerradas y crear la
-- línea de servicio de cada una (idempotente):
--   npm run backfill:service-history
-- ============================================================================

BEGIN;

-- ── Enums del módulo ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "AppointmentLineKind" AS ENUM ('SERVICE', 'PRODUCT_SOLD', 'PRODUCT_USED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppointmentLineStatus" AS ENUM ('PLANNED', 'PERFORMED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RecurrenceUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Appointment: marca de la visita ─────────────────────────────────────────
-- Es también la barrera de idempotencia del cierre: si ya está puesta, el
-- pipeline no vuelve a registrar servicios, métricas ni recurrencias.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Appointment_tenantId_customerId_completedAt_idx"
  ON "Appointment" ("tenantId", "customerId", "completedAt");

-- ── Product: política de recurrencia del servicio ───────────────────────────
-- Apagada y sin intervalo por defecto: no se fija ningún plazo comercial que
-- el negocio no haya decidido.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "recurrenceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "recurrenceInterval" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "recurrenceUnit" "RecurrenceUnit";

-- ── AppointmentLine ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AppointmentLine" (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "appointmentId"     TEXT NOT NULL,
  "customerId"        TEXT,
  "kind"              "AppointmentLineKind"   NOT NULL DEFAULT 'SERVICE',
  "status"            "AppointmentLineStatus" NOT NULL DEFAULT 'PLANNED',
  "productId"         TEXT,
  "nameSnapshot"      TEXT NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "quantity"          INTEGER NOT NULL DEFAULT 1,
  "totalSnapshot"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "performedAt"       TIMESTAMP(3),
  "nextRecommendedAt" TIMESTAMP(3),
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentLine_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "AppointmentLine"
    ADD CONSTRAINT "AppointmentLine_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentLine"
    ADD CONSTRAINT "AppointmentLine_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SetNull en cliente y producto: si el negocio borra el ítem del catálogo, el
-- historial NO se pierde — la línea conserva su snapshot de nombre y precio.
DO $$ BEGIN
  ALTER TABLE "AppointmentLine"
    ADD CONSTRAINT "AppointmentLine_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentLine"
    ADD CONSTRAINT "AppointmentLine_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "AppointmentLine_tenantId_appointmentId_idx"
  ON "AppointmentLine" ("tenantId", "appointmentId");
CREATE INDEX IF NOT EXISTS "AppointmentLine_tenantId_customerId_performedAt_idx"
  ON "AppointmentLine" ("tenantId", "customerId", "performedAt");
CREATE INDEX IF NOT EXISTS "AppointmentLine_tenantId_productId_performedAt_idx"
  ON "AppointmentLine" ("tenantId", "productId", "performedAt");
CREATE INDEX IF NOT EXISTS "AppointmentLine_appointmentId_idx"
  ON "AppointmentLine" ("appointmentId");

COMMIT;
