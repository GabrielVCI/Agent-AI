/**
 * Backfill del Maestro de Clientes (Módulo 1).
 *
 * Ejecutar UNA vez tras aplicar prisma/sql/2026-08-17_customer_master.sql:
 *   npm run backfill:customers            (aplica los cambios)
 *   npm run backfill:customers -- --dry   (solo informa, no escribe)
 *
 * Es IDEMPOTENTE y NO destructivo: solo rellena campos vacíos y vínculos que
 * faltan. Nunca borra filas, nunca pisa un dato existente y puede repetirse.
 *
 * Qué hace, por tenant:
 *   1. phoneNormalized/phoneCountry de los contactos que aún no lo tienen.
 *      Si dos contactos del mismo tenant resuelven al MISMO E.164 (duplicados
 *      históricos), solo el más antiguo se queda con el canónico; el otro se
 *      deja intacto y se reporta para que el negocio decida. Nada se fusiona
 *      ni se borra automáticamente.
 *   2. firstName/lastName a partir del nombre para mostrar (nunca inventa
 *      apellidos: un nombre de una sola palabra deja lastName en null).
 *   3. Appointment.customerId por teléfono normalizado.
 *   4. stage = CLIENT para quien ya tiene una cita confirmada o completada.
 *   5. firstVisitAt / lastVisitAt / visitCount desde las citas COMPLETED.
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";
import { countryForTimezone, normalizePhone } from "../src/utils/phone.js";
import { splitFullName } from "../src/services/customer/customer-names.js";

const DRY_RUN = process.argv.includes("--dry");

interface TenantReport {
  tenantId: string;
  tenantName: string;
  country: string;
  normalized: number;
  namesSplit: number;
  conflicts: { id: string; phone: string; conflictsWith: string }[];
  appointmentsLinked: number;
  appointmentsUnmatched: number;
  customersCreated: number;
  promoted: number;
  statsUpdated: number;
}

async function backfillTenant(tenant: {
  id: string;
  name: string;
  timezone: string;
}): Promise<TenantReport> {
  const country = countryForTimezone(tenant.timezone);
  const report: TenantReport = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    country,
    normalized: 0,
    namesSplit: 0,
    conflicts: [],
    appointmentsLinked: 0,
    appointmentsUnmatched: 0,
    customersCreated: 0,
    promoted: 0,
    statsUpdated: 0,
  };

  const customers = await prisma.customer.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      phone: true,
      phoneNormalized: true,
    },
  });

  // Canónicos ya ocupados en este tenant: la unique constraint es la ley.
  const taken = new Map<string, string>();
  for (const customer of customers) {
    if (customer.phoneNormalized) taken.set(customer.phoneNormalized, customer.id);
  }

  // ── 1 y 2: teléfono canónico + nombre estructurado ──
  for (const customer of customers) {
    const data: Record<string, unknown> = {};

    if (!customer.phoneNormalized) {
      const normalized = normalizePhone(customer.phone, country);
      if (normalized.valid && normalized.e164) {
        const owner = taken.get(normalized.e164);
        if (owner && owner !== customer.id) {
          report.conflicts.push({
            id: customer.id,
            phone: normalized.e164,
            conflictsWith: owner,
          });
        } else {
          data.phoneNormalized = normalized.e164;
          data.phoneCountry = normalized.country;
          taken.set(normalized.e164, customer.id);
          report.normalized++;
        }
      }
    }

    if (!customer.firstName && !customer.lastName) {
      const { firstName, lastName } = splitFullName(customer.name);
      if (firstName) {
        data.firstName = firstName;
        if (lastName) data.lastName = lastName;
        report.namesSplit++;
      }
    }

    if (Object.keys(data).length > 0 && !DRY_RUN) {
      await prisma.customer.update({ where: { id: customer.id }, data });
    }
  }

  // ── 3: vincular citas por teléfono ──
  const byCanonical = new Map<string, string>();
  const byRaw = new Map<string, string>();
  const refreshed = DRY_RUN
    ? customers
    : await prisma.customer.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          phoneNormalized: true,
        },
      });
  for (const customer of refreshed) {
    if (customer.phoneNormalized) byCanonical.set(customer.phoneNormalized, customer.id);
    byRaw.set(customer.phone.trim(), customer.id);
  }

  const appointments = await prisma.appointment.findMany({
    where: { tenantId: tenant.id, customerId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, customerPhone: true, customerName: true, customerEmail: true, status: true },
  });

  for (const appointment of appointments) {
    const normalized = normalizePhone(appointment.customerPhone, country);
    let customerId =
      (normalized.e164 ? byCanonical.get(normalized.e164) : undefined) ??
      byRaw.get(appointment.customerPhone.trim());

    // Una cita agendada a mano con un teléfono que nunca escribió por WhatsApp
    // es un cliente real que el maestro no tenía. Se da de alta (no se
    // inventa nada: nombre y teléfono son los de la propia cita).
    if (!customerId) {
      if (!normalized.valid || !normalized.e164) {
        report.appointmentsUnmatched++;
        continue;
      }
      if (DRY_RUN) {
        report.customersCreated++;
        report.appointmentsLinked++;
        byCanonical.set(normalized.e164, `dry-${appointment.id}`);
        continue;
      }
      const { firstName, lastName } = splitFullName(appointment.customerName);
      const isClient = appointment.status === "CONFIRMED" || appointment.status === "COMPLETED";
      const created = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          phone: normalized.e164,
          phoneNormalized: normalized.e164,
          phoneCountry: normalized.country,
          name: appointment.customerName?.trim() || null,
          firstName,
          lastName,
          email: appointment.customerEmail?.trim().toLowerCase() || null,
          stage: isClient ? "CLIENT" : "CONTACT",
          source: "APPOINTMENT",
          clientSince: isClient ? new Date() : null,
        },
        select: { id: true },
      });
      customerId = created.id;
      byCanonical.set(normalized.e164, customerId);
      byRaw.set(normalized.e164, customerId);
      report.customersCreated++;
    }

    if (!DRY_RUN) {
      await prisma.appointment.update({ where: { id: appointment.id }, data: { customerId } });
    }
    report.appointmentsLinked++;
  }

  // ── 4: promover a CLIENT a quien ya tuvo una cita confirmada/completada ──
  const clientIds = await prisma.appointment.findMany({
    where: {
      tenantId: tenant.id,
      customerId: { not: null },
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const promotable = clientIds
    .map((row) => row.customerId)
    .filter((id): id is string => Boolean(id));

  if (promotable.length > 0 && !DRY_RUN) {
    const result = await prisma.customer.updateMany({
      where: { tenantId: tenant.id, id: { in: promotable }, stage: "CONTACT" },
      data: { stage: "CLIENT", clientSince: new Date() },
    });
    report.promoted = result.count;
  } else if (DRY_RUN) {
    report.promoted = await prisma.customer.count({
      where: { tenantId: tenant.id, id: { in: promotable }, stage: "CONTACT" },
    });
  }

  // ── 5: métricas de visita desde las citas COMPLETED ──
  const completed = await prisma.appointment.groupBy({
    by: ["customerId"],
    where: { tenantId: tenant.id, customerId: { not: null }, status: "COMPLETED" },
    _count: { _all: true },
    _min: { scheduledAt: true },
    _max: { scheduledAt: true },
  });

  for (const row of completed) {
    if (!row.customerId) continue;
    if (!DRY_RUN) {
      await prisma.customer.updateMany({
        where: { id: row.customerId, tenantId: tenant.id },
        data: {
          visitCount: row._count._all,
          firstVisitAt: row._min.scheduledAt,
          lastVisitAt: row._max.scheduledAt,
        },
      });
    }
    report.statsUpdated++;
  }

  return report;
}

async function main() {
  console.log(
    `\n─── Backfill Maestro de Clientes ${DRY_RUN ? "(DRY RUN: no se escribe nada)" : ""} ───\n`
  );

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, timezone: true },
    orderBy: { createdAt: "asc" },
  });

  const totals = {
    normalized: 0,
    namesSplit: 0,
    conflicts: 0,
    appointmentsLinked: 0,
    appointmentsUnmatched: 0,
    customersCreated: 0,
    promoted: 0,
    statsUpdated: 0,
  };

  for (const tenant of tenants) {
    const report = await backfillTenant(tenant);
    totals.normalized += report.normalized;
    totals.namesSplit += report.namesSplit;
    totals.conflicts += report.conflicts.length;
    totals.appointmentsLinked += report.appointmentsLinked;
    totals.appointmentsUnmatched += report.appointmentsUnmatched;
    totals.customersCreated += report.customersCreated;
    totals.promoted += report.promoted;
    totals.statsUpdated += report.statsUpdated;

    const changed =
      report.normalized +
      report.namesSplit +
      report.conflicts.length +
      report.appointmentsLinked +
      report.promoted;
    if (changed === 0) continue;

    console.log(`▸ ${report.tenantName} (${report.country})`);
    console.log(
      `    teléfonos normalizados: ${report.normalized} · nombres estructurados: ${report.namesSplit}`
    );
    console.log(
      `    citas vinculadas: ${report.appointmentsLinked} (contactos creados: ${report.customersCreated}) · sin teléfono usable: ${report.appointmentsUnmatched}`
    );
    console.log(
      `    promovidos a CLIENTE: ${report.promoted} · métricas de visita: ${report.statsUpdated}`
    );
    for (const conflict of report.conflicts) {
      console.log(
        `    ⚠ duplicado histórico: contacto ${conflict.id} comparte ${conflict.phone} con ${conflict.conflictsWith} (se dejó sin canónico, revísalo en el panel)`
      );
    }
    console.log("");
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
