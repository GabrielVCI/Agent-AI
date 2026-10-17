-- ============================================================================
-- Módulo 2 — Categorías y segmentación de clientes
--
-- Migración INCREMENTAL y NO destructiva. Todo es CREATE/ADD con IF NOT EXISTS
-- (o envuelto en DO $$ ... EXCEPTION WHEN duplicate_object $$): no borra
-- columnas, no borra filas, no toca `Customer.tags` y puede ejecutarse varias
-- veces sin efecto secundario.
--
-- Aplicar en producción ANTES de desplegar el backend:
--   psql "$DIRECT_URL" -f prisma/sql/2026-08-18_customer_categories.sql
--
-- Después, para convertir las etiquetas de texto libre existentes
-- (`Customer.tags`) en categorías manuales reales — idempotente y sin borrar
-- nada:
--   npm run backfill:customer-categories
--
-- NOTA sobre los ALTER TYPE ... ADD VALUE: PostgreSQL no permite usar un valor
-- de enum nuevo en la MISMA transacción en que se añade, por eso van fuera del
-- BEGIN/COMMIT y antes del resto.
-- ============================================================================

-- ── Automation Core: eventos y acciones nuevas ──────────────────────────────
-- (no se elimina ni se renombra ningún valor existente)
ALTER TYPE "AutomationEventType"  ADD VALUE IF NOT EXISTS 'CUSTOMER_CATEGORY_ASSIGNED';
ALTER TYPE "AutomationEventType"  ADD VALUE IF NOT EXISTS 'CUSTOMER_CATEGORY_REMOVED';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'ASSIGN_CUSTOMER_CATEGORY';
ALTER TYPE "AutomationActionType" ADD VALUE IF NOT EXISTS 'REMOVE_CUSTOMER_CATEGORY';

BEGIN;

-- ── Enums del módulo ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CustomerCategoryType" AS ENUM ('MANUAL', 'AUTOMATIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerCategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerCategoryAssignmentSource"
    AS ENUM ('MANUAL', 'AUTOMATION', 'SYSTEM', 'IMPORT', 'API');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CustomerCategory ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CustomerCategory" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "description"     TEXT,
  "type"            "CustomerCategoryType"   NOT NULL DEFAULT 'MANUAL',
  "status"          "CustomerCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "color"           TEXT NOT NULL DEFAULT 'purple',
  "isSystem"        BOOLEAN NOT NULL DEFAULT false,
  "systemKey"       TEXT,
  "createdByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCategory_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CustomerCategory"
    ADD CONSTRAINT "CustomerCategory_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unicidad POR TENANT (nunca global): dos empresas pueden tener "vip", pero
-- dentro de una "VIP", " vip " y "Vip" son la misma categoría.
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCategory_tenantId_slug_key"
  ON "CustomerCategory" ("tenantId", "slug");
-- systemKey es NULL en las categorías del negocio y PostgreSQL no colisiona
-- NULLs: solo puede haber UNA categoría de sistema por clave y tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCategory_tenantId_systemKey_key"
  ON "CustomerCategory" ("tenantId", "systemKey");

CREATE INDEX IF NOT EXISTS "CustomerCategory_tenantId_status_idx"
  ON "CustomerCategory" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "CustomerCategory_tenantId_type_idx"
  ON "CustomerCategory" ("tenantId", "type");

-- ── CustomerCategoryAssignment ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CustomerCategoryAssignment" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "customerId"       TEXT NOT NULL,
  "categoryId"       TEXT NOT NULL,
  "source"           "CustomerCategoryAssignmentSource" NOT NULL DEFAULT 'MANUAL',
  "reason"           TEXT,
  "assignedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedByUserId" TEXT,
  CONSTRAINT "CustomerCategoryAssignment_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "CustomerCategoryAssignment"
    ADD CONSTRAINT "CustomerCategoryAssignment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerCategoryAssignment"
    ADD CONSTRAINT "CustomerCategoryAssignment_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerCategoryAssignment"
    ADD CONSTRAINT "CustomerCategoryAssignment_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "CustomerCategory"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Barrera DURA contra la doble asignación (doble clic, retry del worker, dos
-- reglas que asignan la misma categoría). La idempotencia del servicio se
-- apoya en esta constraint, no al revés.
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCategoryAssignment_customerId_categoryId_key"
  ON "CustomerCategoryAssignment" ("customerId", "categoryId");

CREATE INDEX IF NOT EXISTS "CustomerCategoryAssignment_tenantId_categoryId_idx"
  ON "CustomerCategoryAssignment" ("tenantId", "categoryId");
CREATE INDEX IF NOT EXISTS "CustomerCategoryAssignment_tenantId_customerId_idx"
  ON "CustomerCategoryAssignment" ("tenantId", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerCategoryAssignment_categoryId_idx"
  ON "CustomerCategoryAssignment" ("categoryId");

COMMIT;
