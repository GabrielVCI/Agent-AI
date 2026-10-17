/**
 * Backfill del Historial de servicios (Módulo 3).
 *
 * Ejecutar UNA vez tras aplicar prisma/sql/2026-08-18_service_history.sql:
 *   npm run backfill:service-history            (aplica los cambios)
 *   npm run backfill:service-history -- --dry   (solo informa, no escribe)
 *
 * Es IDEMPOTENTE y NO destructivo: solo rellena lo que falta. No borra filas,
 * no reabre citas, no reprograma automatizaciones y puede repetirse.
 *
 * Qué hace, por tenant:
 *   1. `completedAt` de las citas ya COMPLETED que no lo tienen. Se usa la
 *      fecha para la que estaban agendadas, no `now()`: la visita ocurrió ese
 *      día, no el día en que se ejecuta este script.
 *   2. Una línea de servicio PERFORMED por cada cita completada que no tenga
 *      ninguna, con el nombre de lo que se agendó y el precio ACTUAL del ítem
 *      del catálogo si estaba vinculado (es la mejor aproximación disponible
 *      para el pasado; a partir de ahora el precio se congela en el cierre).
 *
 * NO calcula `nextRecommendedAt` retroactivamente: programar hoy seguimientos
 * de servicios hechos hace meses llenaría la cola de avisos vencidos.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/config/prisma.js";

const DRY_RUN = process.argv.includes("--dry");

interface TenantReport {
  tenantName: string;
  completedAtFilled: number;
  linesCreated: number;
  alreadyHadLines: number;
}

function toNumber(value: Prisma.Decimal | null): number {
  return value === null ? 0 : Number(value.toString());
}

async function backfillTenant(tenant: { id: string; name: string }): Promise<TenantReport> {
  const report: TenantReport = {
    tenantName: tenant.name,
    completedAtFilled: 0,
    linesCreated: 0,
    alreadyHadLines: 0,
  };

  // ── 1. completedAt de las citas cerradas ──
  const missingCompletedAt = await prisma.appointment.findMany({
    where: { tenantId: tenant.id, status: "COMPLETED", completedAt: null },
    select: { id: true, scheduledAt: true },
  });
  report.completedAtFilled = missingCompletedAt.length;

  if (!DRY_RUN) {
    for (const appointment of missingCompletedAt) {
      await prisma.appointment.updateMany({
        where: { id: appointment.id, tenantId: tenant.id, completedAt: null },
        data: { completedAt: appointment.scheduledAt },
      });
    }
  }

  // ── 2. Línea de servicio de cada cita completada ──
  const completed = await prisma.appointment.findMany({
    where: { tenantId: tenant.id, status: "COMPLETED" },
    select: {
      id: true,
      customerId: true,
      serviceOrProduct: true,
      catalogItemId: true,
      scheduledAt: true,
      completedAt: true,
    },
    orderBy: { scheduledAt: "asc" },
  });

  const withLines = await prisma.appointmentLine.groupBy({
    by: ["appointmentId"],
    where: { tenantId: tenant.id, appointmentId: { in: completed.map((a) => a.id) } },
  });
  const alreadyDone = new Set(withLines.map((row) => row.appointmentId));
  report.alreadyHadLines = alreadyDone.size;

  const pending = completed.filter((appointment) => !alreadyDone.has(appointment.id));
  if (pending.length === 0) return report;

  if (DRY_RUN) {
    report.linesCreated = pending.length;
    return report;
  }

  // Precio actual del catálogo: es la única referencia que existe para el
  // pasado. De aquí en adelante el snapshot lo congela el cierre de la cita.
  const productIds = [
    ...new Set(pending.map((a) => a.catalogItemId).filter((id): id is string => Boolean(id))),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { tenantId: tenant.id, id: { in: productIds } },
        select: { id: true, name: true, price: true, itemType: true },
      })
    : [];
  const productById = new Map(products.map((product) => [product.id, product]));

  const created = await prisma.appointmentLine.createMany({
    data: pending.map((appointment) => {
      const product = appointment.catalogItemId
        ? productById.get(appointment.catalogItemId)
        : undefined;
      const price = product ? toNumber(product.price) : 0;
      return {
        tenantId: tenant.id,
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        kind: (product && product.itemType === "PRODUCT" ? "PRODUCT_SOLD" : "SERVICE") as
          | "PRODUCT_SOLD"
          | "SERVICE",
        status: "PERFORMED" as const,
        productId: product?.id ?? null,
        nameSnapshot: (product?.name ?? appointment.serviceOrProduct).slice(0, 160) || "Servicio",
        unitPriceSnapshot: new Prisma.Decimal(price.toFixed(2)),
        quantity: 1,
        totalSnapshot: new Prisma.Decimal(price.toFixed(2)),
        performedAt: appointment.completedAt ?? appointment.scheduledAt,
      };
    }),
    skipDuplicates: true,
  });
  report.linesCreated = created.count;

  return report;
}

async function main(): Promise<void> {
  console.log(
    `\n=== Backfill del historial de servicios (Módulo 3) ${DRY_RUN ? "[DRY RUN]" : ""} ===\n`
  );

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const totals = {
    tenants: tenants.length,
    completedAtFilled: 0,
    linesCreated: 0,
    alreadyHadLines: 0,
  };

  for (const tenant of tenants) {
    const report = await backfillTenant(tenant);
    totals.completedAtFilled += report.completedAtFilled;
    totals.linesCreated += report.linesCreated;
    totals.alreadyHadLines += report.alreadyHadLines;

    console.log(`▸ ${report.tenantName}`);
    console.log(
      `    completedAt rellenados: ${report.completedAtFilled} · líneas creadas: ${report.linesCreated} · citas que ya tenían: ${report.alreadyHadLines}\n`
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
