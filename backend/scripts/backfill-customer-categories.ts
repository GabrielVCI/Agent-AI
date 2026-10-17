/**
 * Backfill de Categorías y segmentación (Módulo 2).
 *
 * Ejecutar UNA vez tras aplicar prisma/sql/2026-08-18_customer_categories.sql:
 *   npm run backfill:customer-categories            (aplica los cambios)
 *   npm run backfill:customer-categories -- --dry   (solo informa, no escribe)
 *
 * Es IDEMPOTENTE y NO destructivo: solo CREA categorías y asignaciones que
 * faltan. No borra ninguna fila, no vacía `Customer.tags` y puede repetirse.
 *
 * Qué hace, por tenant:
 *   1. Crea las categorías de sistema (VIP y Riesgo de abandono), que reflejan
 *      `Customer.isVip` y `Customer.riskStatus` — la fuente de verdad sigue
 *      siendo la ficha del cliente.
 *   2. Convierte cada etiqueta distinta de `Customer.tags` en una categoría
 *      MANUAL del tenant y asigna a sus clientes. Es lo que evita tener dos
 *      sistemas de clasificación conviviendo: la etiqueta y su categoría pasan
 *      a ser la misma cosa. La columna `tags` se conserva intacta.
 *   3. Sincroniza la pertenencia a VIP / Riesgo de abandono con el estado real
 *      de cada ficha.
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";
import {
  categorySlug,
  clearSystemCategoryCache,
  ensureManualCategory,
  ensureSystemCategories,
  syncDomainCategories,
} from "../src/services/customer/customer-category.service.js";

const DRY_RUN = process.argv.includes("--dry");

interface TenantReport {
  tenantName: string;
  distinctTags: number;
  categoriesCreated: number;
  assignmentsCreated: number;
  vipSynced: number;
  riskSynced: number;
}

async function backfillTenant(tenant: { id: string; name: string }): Promise<TenantReport> {
  const report: TenantReport = {
    tenantName: tenant.name,
    distinctTags: 0,
    categoriesCreated: 0,
    assignmentsCreated: 0,
    vipSynced: 0,
    riskSynced: 0,
  };

  // ── 1. Etiquetas existentes → categorías manuales ──
  const tagged = await prisma.customer.findMany({
    where: { tenantId: tenant.id, NOT: { tags: { isEmpty: true } } },
    select: { id: true, tags: true },
  });

  // slug → nombre "bonito" (el primero que aparezca) y clientes que lo llevan.
  const bySlug = new Map<string, { name: string; customerIds: string[] }>();
  for (const customer of tagged) {
    for (const tag of customer.tags) {
      const slug = categorySlug(tag);
      if (!slug) continue;
      const entry = bySlug.get(slug) ?? { name: tag.trim(), customerIds: [] };
      entry.customerIds.push(customer.id);
      bySlug.set(slug, entry);
    }
  }
  report.distinctTags = bySlug.size;

  const vipCount = await prisma.customer.count({
    where: { tenantId: tenant.id, isVip: true },
  });
  const riskCount = await prisma.customer.count({
    where: { tenantId: tenant.id, riskStatus: { in: ["MEDIUM", "HIGH"] } },
  });
  report.vipSynced = vipCount;
  report.riskSynced = riskCount;

  if (DRY_RUN) {
    report.categoriesCreated = bySlug.size;
    report.assignmentsCreated = [...bySlug.values()].reduce(
      (sum, entry) => sum + new Set(entry.customerIds).size,
      0
    );
    return report;
  }

  clearSystemCategoryCache(tenant.id);
  await ensureSystemCategories(tenant.id);

  for (const [, entry] of bySlug) {
    const before = await prisma.customerCategory.count({ where: { tenantId: tenant.id } });
    const category = await ensureManualCategory(tenant.id, entry.name);
    if (!category) continue;
    const after = await prisma.customerCategory.count({ where: { tenantId: tenant.id } });
    if (after > before) report.categoriesCreated += 1;

    // createMany + skipDuplicates: la constraint (customerId, categoryId) hace
    // que repetir el backfill no cree nada nuevo.
    const created = await prisma.customerCategoryAssignment.createMany({
      data: [...new Set(entry.customerIds)].map((customerId) => ({
        tenantId: tenant.id,
        customerId,
        categoryId: category.id,
        source: "SYSTEM" as const,
        reason: "migración de etiquetas del Módulo 1",
      })),
      skipDuplicates: true,
    });
    report.assignmentsCreated += created.count;
  }

  // ── 3. VIP y riesgo: la ficha manda, la categoría refleja ──
  const domainCustomers = await prisma.customer.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ isVip: true }, { riskStatus: { in: ["MEDIUM", "HIGH"] } }],
    },
    select: { id: true, isVip: true, riskStatus: true },
  });
  for (const customer of domainCustomers) {
    await syncDomainCategories(tenant.id, customer.id, {
      isVip: customer.isVip,
      riskStatus: customer.riskStatus,
    });
  }

  return report;
}

async function main(): Promise<void> {
  console.log(
    `\n=== Backfill de categorías de clientes (Módulo 2) ${DRY_RUN ? "[DRY RUN]" : ""} ===\n`
  );

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const totals = {
    tenants: tenants.length,
    distinctTags: 0,
    categoriesCreated: 0,
    assignmentsCreated: 0,
    vipSynced: 0,
    riskSynced: 0,
  };

  for (const tenant of tenants) {
    const report = await backfillTenant(tenant);
    totals.distinctTags += report.distinctTags;
    totals.categoriesCreated += report.categoriesCreated;
    totals.assignmentsCreated += report.assignmentsCreated;
    totals.vipSynced += report.vipSynced;
    totals.riskSynced += report.riskSynced;

    console.log(`▸ ${report.tenantName}`);
    console.log(
      `    etiquetas distintas: ${report.distinctTags} · categorías creadas: ${report.categoriesCreated} · asignaciones: ${report.assignmentsCreated}`
    );
    console.log(
      `    VIP sincronizados: ${report.vipSynced} · en riesgo: ${report.riskSynced}\n`
    );
  }

  console.log("─── Totales ───");
  console.table(totals);
  if (DRY_RUN) console.log("\nDRY RUN: no se escribió nada. Repite sin --dry para aplicar.\n");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Backfill falló:", error);
  await prisma.$disconnect();
  process.exit(1);
});
