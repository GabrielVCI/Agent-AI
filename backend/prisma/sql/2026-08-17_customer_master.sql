-- ============================================================================
-- Módulo 1 — Maestro de Clientes (Customer Domain)
--
-- Migración INCREMENTAL y NO destructiva. Todo es ADD/CREATE con IF NOT EXISTS:
-- no borra columnas, no borra filas, no toca datos existentes y puede
-- ejecutarse varias veces sin efecto secundario.
--
-- Aplicar en producción ANTES de desplegar el backend:
--   psql "$DIRECT_URL" -f prisma/sql/2026-08-17_customer_master.sql
--
-- Después, para rellenar phoneNormalized / stage / Appointment.customerId y
-- las métricas de visita, ejecutar el backfill (idempotente):
--   npm run backfill:customers
-- ============================================================================

BEGIN;

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CustomerStage" AS ENUM ('CONTACT', 'CLIENT', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerSource" AS ENUM ('WHATSAPP', 'MANUAL', 'APPOINTMENT', 'IMPORT', 'VOICE', 'API');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerRiskStatus" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Customer: columnas nuevas ───────────────────────────────────────────────
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phoneCountry" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "documentId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "birthDate" DATE;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "stage" "CustomerStage" NOT NULL DEFAULT 'CONTACT';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "source" "CustomerSource" NOT NULL DEFAULT 'WHATSAPP';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "clientSince" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isVip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "vipSince" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "riskStatus" "CustomerRiskStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "firstVisitAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastVisitAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "visitCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ── Customer: unicidad e índices ────────────────────────────────────────────
-- Unicidad REAL de deduplicación. phoneNormalized es NULLABLE y en PostgreSQL
-- los NULL no colisionan entre sí: los teléfonos legados ilegibles conviven
-- sin bloquear la constraint. La barrera dura contra la carrera
-- "WhatsApp confirma cita" + "ADMIN crea el cliente" es este índice.
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_tenantId_phoneNormalized_key"
  ON "Customer" ("tenantId", "phoneNormalized");

CREATE INDEX IF NOT EXISTS "Customer_tenantId_stage_idx"      ON "Customer" ("tenantId", "stage");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_lastVisitAt_idx" ON "Customer" ("tenantId", "lastVisitAt");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_createdAt_idx"  ON "Customer" ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_isVip_idx"      ON "Customer" ("tenantId", "isVip");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_riskStatus_idx" ON "Customer" ("tenantId", "riskStatus");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_email_idx"      ON "Customer" ("tenantId", "email");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_lastName_idx"   ON "Customer" ("tenantId", "lastName");

-- ── Appointment: vínculo con el maestro ─────────────────────────────────────
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Appointment"
    ADD CONSTRAINT "Appointment_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Appointment_tenantId_customerId_status_idx"
  ON "Appointment" ("tenantId", "customerId", "status");

COMMIT;
