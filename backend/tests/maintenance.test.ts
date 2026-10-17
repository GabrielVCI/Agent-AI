/**
 * Tests de integración del cronograma de mantenimiento (Módulo 4) contra
 * PostgreSQL.
 *
 * Toda la lógica de este módulo vive en SQL (DISTINCT ON, make_interval,
 * EXISTS correlacionado), así que NO se puede probar sin base de datos: estos
 * tests son la única red que tiene.
 *
 * Seguridad de los datos: cada corrida crea SUS PROPIOS tenants con prefijo
 * `__maintenance_test__` y los borra al final. No lee, modifica ni borra nada
 * preexistente.
 *
 * Ejecutar: npm run test:db:maintenance  (o npm test, que corre todo)
 */
import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../src/config/prisma.js";
import { closeRedis } from "../src/config/redis.js";
import { clearTenantPhoneCountryCache } from "../src/services/customer/customer.service.js";
import { clearSystemCategoryCache } from "../src/services/customer/customer-category.service.js";
import {
  getMaintenanceCounters,
  listMaintenanceSchedule,
  listMaintenanceServices,
} from "../src/services/appointment/maintenance.service.js";

const PREFIX = "__maintenance_test__";
const DAY_MS = 24 * 60 * 60 * 1000;
const createdTenantIds: string[] = [];

let phoneSeed = 9_300_000;
function uniquePhone(): string {
  phoneSeed += 1;
  return `+1809${String(phoneSeed).padStart(7, "0")}`;
}

async function createTenant(label: string): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${PREFIX}${label}-${randomUUID().slice(0, 8)}`,
      timezone: "America/Santo_Domingo",
      status: "ACTIVE",
    },
  });
  createdTenantIds.push(tenant.id);
  clearTenantPhoneCountryCache(tenant.id);
  clearSystemCategoryCache(tenant.id);
  return tenant.id;
}

async function createService(
  tenantId: string,
  name: string,
  recurrence?: { interval: number; unit: "DAYS" | "WEEKS" | "MONTHS" },
  itemType: "SERVICE" | "PRODUCT" = "SERVICE"
) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      itemType,
      price: new Prisma.Decimal(1000),
      stock: itemType === "SERVICE" ? null : 10,
      ...(recurrence
        ? {
            recurrenceEnabled: true,
            recurrenceInterval: recurrence.interval,
            recurrenceUnit: recurrence.unit,
          }
        : {}),
    },
  });
}

async function createCustomer(tenantId: string, name: string) {
  const phone = uniquePhone();
  return prisma.customer.create({
    data: {
      tenantId,
      name,
      firstName: name.split(" ")[0],
      lastName: name.split(" ")[1] ?? null,
      phone,
      phoneNormalized: phone,
      stage: "CLIENT",
      source: "MANUAL",
    },
  });
}

/**
 * Registra una visita YA CERRADA hace `daysAgo` días.
 *
 * Se escribe directo con Prisma en vez de pasar por `completeAppointment`
 * porque hay que situar la visita en el PASADO, y el flujo real solo cierra
 * citas "ahora". Lo que se prueba aquí es el cronograma, no el cierre (que
 * tiene su propia suite).
 */
async function recordVisit(
  tenantId: string,
  customerId: string,
  product: { id: string; name: string; itemType: string },
  daysAgo: number,
  kind: "SERVICE" | "PRODUCT_SOLD" | "PRODUCT_USED" = "SERVICE"
) {
  const performedAt = new Date(Date.now() - daysAgo * DAY_MS);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      customerId,
      customerName: "Cliente",
      customerPhone: uniquePhone(),
      scheduledAt: performedAt,
      completedAt: performedAt,
      serviceOrProduct: product.name,
      catalogItemId: product.id,
      status: "COMPLETED",
      source: "MANUAL",
    },
  });

  await prisma.appointmentLine.create({
    data: {
      tenantId,
      appointmentId: appointment.id,
      customerId,
      productId: product.id,
      kind,
      status: "PERFORMED",
      nameSnapshot: product.name,
      unitPriceSnapshot: new Prisma.Decimal(1000),
      quantity: 1,
      totalSnapshot: new Prisma.Decimal(1000),
      performedAt,
    },
  });

  return appointment;
}

/** Cita futura para ese servicio: el cliente ya está agendado. */
async function bookFuture(
  tenantId: string,
  customerId: string,
  productId: string,
  daysAhead = 5
) {
  return prisma.appointment.create({
    data: {
      tenantId,
      customerId,
      customerName: "Cliente",
      customerPhone: uniquePhone(),
      scheduledAt: new Date(Date.now() + daysAhead * DAY_MS),
      serviceOrProduct: "Próxima",
      catalogItemId: productId,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

after(async () => {
  for (const tenantId of createdTenantIds) {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  }
  await prisma.$disconnect();
  await closeRedis().catch(() => {});
});

// ─── Cálculo de la fecha ─────────────────────────────────────────────────────

test("cronograma: un tinte de hace 45 días con recurrencia de 30 sale VENCIDO", async () => {
  const tenantId = await createTenant("overdue");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "María López");
  await recordVisit(tenantId, customer.id, tinte, 45);

  const result = await listMaintenanceSchedule(tenantId);

  assert.equal(result.total, 1);
  const [entry] = result.items;
  assert.equal(entry.customerName, "María López");
  assert.equal(entry.serviceName, "Tinte");
  assert.equal(entry.status, "OVERDUE");
  assert.equal(entry.recurrenceLabel, "cada 30 días");
  // Le tocaba a los 30 días y han pasado 45: ~15 de retraso.
  assert.ok(
    entry.overdueDays >= 14 && entry.overdueDays <= 16,
    `esperaba ~15 días de retraso, fueron ${entry.overdueDays}`
  );
});

test("cronograma: un servicio reciente sale como PRÓXIMO, no como vencido", async () => {
  const tenantId = await createTenant("upcoming");
  const keratina = await createService(tenantId, "Keratina", { interval: 90, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "Ana Gómez");
  await recordVisit(tenantId, customer.id, keratina, 10);

  const [entry] = (await listMaintenanceSchedule(tenantId)).items;
  assert.equal(entry.status, "UPCOMING");
  assert.equal(entry.overdueDays, 0);
  assert.ok(
    entry.daysUntilDue >= 78 && entry.daysUntilDue <= 82,
    `esperaba ~80 días para el próximo, fueron ${entry.daysUntilDue}`
  );
});

test("cronograma: los meses se cuentan por calendario, no como 30 días", async () => {
  const tenantId = await createTenant("months");
  const aceite = await createService(tenantId, "Cambio de aceite", { interval: 6, unit: "MONTHS" });
  const customer = await createCustomer(tenantId, "José Pérez");
  const visit = await recordVisit(tenantId, customer.id, aceite, 100);

  const [entry] = (await listMaintenanceSchedule(tenantId)).items;

  // 6 meses de calendario desde la visita: PostgreSQL respeta el mes corto.
  const expected = new Date(visit.scheduledAt);
  expected.setMonth(expected.getMonth() + 6);
  const diffDays = Math.abs(entry.dueAt.getTime() - expected.getTime()) / DAY_MS;
  assert.ok(diffDays < 2, `la fecha esperada y la calculada difieren ${diffDays} días`);
  assert.equal(entry.recurrenceLabel, "cada 6 meses");
});

// ─── Última visita ───────────────────────────────────────────────────────────

test("cronograma: solo cuenta la ÚLTIMA vez que se hizo ese servicio", async () => {
  const tenantId = await createTenant("latest");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "Gabriela Pérez");

  // Se tiñe todos los meses: tres visitas, una sola fila.
  await recordVisit(tenantId, customer.id, tinte, 90);
  await recordVisit(tenantId, customer.id, tinte, 60);
  await recordVisit(tenantId, customer.id, tinte, 5);

  const result = await listMaintenanceSchedule(tenantId);
  assert.equal(result.total, 1, "una fila por cliente y servicio, no una por visita");
  assert.equal(
    result.items[0].status,
    "UPCOMING",
    "manda la visita más reciente, no la más antigua"
  );
});

test("cronograma: cada servicio del mismo cliente tiene su propia fila", async () => {
  const tenantId = await createTenant("multi-service");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const keratina = await createService(tenantId, "Keratina", { interval: 90, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "María López");

  await recordVisit(tenantId, customer.id, tinte, 40);
  await recordVisit(tenantId, customer.id, keratina, 40);

  const result = await listMaintenanceSchedule(tenantId);
  assert.equal(result.total, 2);
  const byService = new Map(result.items.map((item) => [item.serviceName, item]));
  assert.equal(byService.get("Tinte")?.status, "OVERDUE", "40 días con recurrencia de 30");
  assert.equal(byService.get("Keratina")?.status, "UPCOMING", "40 días con recurrencia de 90");
});

// ─── Política del catálogo ───────────────────────────────────────────────────

test("cronograma: un servicio SIN recurrencia no aparece", async () => {
  const tenantId = await createTenant("no-policy");
  const corte = await createService(tenantId, "Corte"); // sin recurrencia
  const customer = await createCustomer(tenantId, "Luis Mora");
  await recordVisit(tenantId, customer.id, corte, 200);

  const result = await listMaintenanceSchedule(tenantId);
  assert.equal(result.total, 0, "sin política configurada no hay mantenimiento que planificar");
});

test("cronograma: apagar la recurrencia saca al servicio del cronograma", async () => {
  const tenantId = await createTenant("toggle");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "Ana Gómez");
  await recordVisit(tenantId, customer.id, tinte, 45);

  assert.equal((await listMaintenanceSchedule(tenantId)).total, 1);

  await prisma.product.update({
    where: { id: tinte.id },
    data: { recurrenceEnabled: false },
  });

  assert.equal(
    (await listMaintenanceSchedule(tenantId)).total,
    0,
    "el cronograma refleja la configuración ACTUAL del catálogo"
  );
});

test("cronograma: cambiar el intervalo mueve la fecha al instante", async () => {
  const tenantId = await createTenant("reconfig");
  const tinte = await createService(tenantId, "Tinte", { interval: 90, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "María López");
  await recordVisit(tenantId, customer.id, tinte, 45);

  assert.equal((await listMaintenanceSchedule(tenantId)).items[0].status, "UPCOMING");

  // El negocio decide que el retoque es cada 30 días: quien se tiñó hace 45 ya
  // está vencido, aunque su visita se cerrara cuando la política era otra.
  await prisma.product.update({
    where: { id: tinte.id },
    data: { recurrenceInterval: 30 },
  });

  assert.equal(
    (await listMaintenanceSchedule(tenantId)).items[0].status,
    "OVERDUE",
    "la fecha se calcula con la política actual, no con la del día de la visita"
  );
});

// ─── Cita ya agendada ────────────────────────────────────────────────────────

test("cronograma: quien YA tiene cita para ese servicio no sale en la lista", async () => {
  const tenantId = await createTenant("scheduled");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const conCita = await createCustomer(tenantId, "Con Cita");
  const sinCita = await createCustomer(tenantId, "Sin Cita");

  await recordVisit(tenantId, conCita.id, tinte, 45);
  await recordVisit(tenantId, sinCita.id, tinte, 45);
  await bookFuture(tenantId, conCita.id, tinte.id);

  const result = await listMaintenanceSchedule(tenantId);
  assert.equal(result.total, 1, "no hay que llamar a quien ya está agendado");
  assert.equal(result.items[0].customerName, "Sin Cita");

  // Pero se puede pedir verlos, y llegan marcados.
  const withScheduled = await listMaintenanceSchedule(tenantId, { includeScheduled: true });
  assert.equal(withScheduled.total, 2);
  const flagged = withScheduled.items.find((item) => item.customerName === "Con Cita");
  assert.equal(flagged?.hasUpcomingAppointment, true);
});

test("cronograma: una cita futura de OTRO servicio no exime del mantenimiento", async () => {
  const tenantId = await createTenant("other-service");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const corte = await createService(tenantId, "Corte");
  const customer = await createCustomer(tenantId, "María López");

  await recordVisit(tenantId, customer.id, tinte, 45);
  await bookFuture(tenantId, customer.id, corte.id);

  const result = await listMaintenanceSchedule(tenantId);
  assert.equal(result.total, 1, "tiene cita de corte, pero el tinte sigue pendiente");
  assert.equal(result.items[0].hasUpcomingAppointment, false);
});

test("cronograma: una cita cancelada NO cuenta como agendada", async () => {
  const tenantId = await createTenant("cancelled-appt");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "Ana Gómez");
  await recordVisit(tenantId, customer.id, tinte, 45);

  const future = await bookFuture(tenantId, customer.id, tinte.id);
  await prisma.appointment.update({
    where: { id: future.id },
    data: { status: "CANCELLED" },
  });

  const result = await listMaintenanceSchedule(tenantId);
  assert.equal(result.total, 1, "canceló la cita: vuelve a la lista de contacto");
});

// ─── Filtros ─────────────────────────────────────────────────────────────────

test("cronograma: 'vencidos hace 40 días o más' es el filtro del retoque de color", async () => {
  const tenantId = await createTenant("overdue-min");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });

  // Le tocaba hace ~50 días (visita hace 80, recurrencia 30).
  const muyAtrasada = await createCustomer(tenantId, "Muy Atrasada");
  await recordVisit(tenantId, muyAtrasada.id, tinte, 80);
  // Le tocaba hace ~5 días.
  const pocoAtrasada = await createCustomer(tenantId, "Poco Atrasada");
  await recordVisit(tenantId, pocoAtrasada.id, tinte, 35);

  const all = await listMaintenanceSchedule(tenantId, { status: "OVERDUE" });
  assert.equal(all.total, 2);

  const veryLate = await listMaintenanceSchedule(tenantId, { overdueMinDays: 40 });
  assert.equal(veryLate.total, 1);
  assert.equal(veryLate.items[0].customerName, "Muy Atrasada");
});

test("cronograma: se filtra por servicio y se busca por nombre o teléfono", async () => {
  const tenantId = await createTenant("filters");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const keratina = await createService(tenantId, "Keratina", { interval: 30, unit: "DAYS" });
  const maria = await createCustomer(tenantId, "María López");
  const jose = await createCustomer(tenantId, "José Pérez");

  await recordVisit(tenantId, maria.id, tinte, 45);
  await recordVisit(tenantId, jose.id, keratina, 45);

  const porServicio = await listMaintenanceSchedule(tenantId, { serviceId: tinte.id });
  assert.equal(porServicio.total, 1);
  assert.equal(porServicio.items[0].serviceName, "Tinte");

  const porNombre = await listMaintenanceSchedule(tenantId, { search: "josé" });
  assert.equal(porNombre.total, 1, "la búsqueda no distingue mayúsculas");
  assert.equal(porNombre.items[0].customerName, "José Pérez");
});

test("cronograma: la paginación devuelve el total FILTRADO y ordena por urgencia", async () => {
  const tenantId = await createTenant("pagination");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });

  // Cinco clientas con distinto retraso.
  for (const daysAgo of [100, 90, 80, 70, 60]) {
    const customer = await createCustomer(tenantId, `Clienta ${daysAgo}`);
    await recordVisit(tenantId, customer.id, tinte, daysAgo);
  }

  const firstPage = await listMaintenanceSchedule(tenantId, { page: 1, limit: 2 });
  assert.equal(firstPage.total, 5, "el total es el de TODAS las que cumplen el filtro");
  assert.equal(firstPage.pages, 3);
  assert.equal(firstPage.items.length, 2);
  // La más atrasada primero: es a quien hay que llamar hoy.
  assert.equal(firstPage.items[0].customerName, "Clienta 100");
  assert.ok(
    firstPage.items[0].dueAt <= firstPage.items[1].dueAt,
    "ordenado por fecha de vencimiento ascendente"
  );

  const lastPage = await listMaintenanceSchedule(tenantId, { page: 3, limit: 2 });
  assert.equal(lastPage.items.length, 1);
});

// ─── Contadores ──────────────────────────────────────────────────────────────

test("cronograma: los contadores cuadran con el listado", async () => {
  const tenantId = await createTenant("counters");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });

  const vencida = await createCustomer(tenantId, "Vencida");
  const proxima = await createCustomer(tenantId, "Próxima");
  const agendada = await createCustomer(tenantId, "Agendada");

  await recordVisit(tenantId, vencida.id, tinte, 45);
  await recordVisit(tenantId, proxima.id, tinte, 5);
  await recordVisit(tenantId, agendada.id, tinte, 45);
  await bookFuture(tenantId, agendada.id, tinte.id);

  const counters = await getMaintenanceCounters(tenantId);
  assert.equal(counters.overdue, 1);
  assert.equal(counters.upcoming, 1);
  assert.equal(counters.scheduled, 1, "los ya agendados se cuentan aparte, no desaparecen");

  const overdue = await listMaintenanceSchedule(tenantId, { status: "OVERDUE" });
  assert.equal(overdue.total, counters.overdue, "contador y listado usan el mismo criterio");
});

// ─── Productos y exclusiones ─────────────────────────────────────────────────

test("cronograma: un producto vendido con recurrencia entra como recompra", async () => {
  const tenantId = await createTenant("product");
  const champu = await createService(
    tenantId,
    "Champú de mantenimiento",
    { interval: 2, unit: "MONTHS" },
    "PRODUCT"
  );
  const customer = await createCustomer(tenantId, "María López");
  await recordVisit(tenantId, customer.id, champu, 80, "PRODUCT_SOLD");

  const [entry] = (await listMaintenanceSchedule(tenantId)).items;
  assert.ok(entry, "un producto de mantenimiento también se planifica");
  assert.equal(entry.itemType, "PRODUCT");
  assert.equal(entry.status, "OVERDUE", "hace 80 días y toca cada 2 meses");
});

test("cronograma: el material usado en el servicio NO genera recompra", async () => {
  const tenantId = await createTenant("used");
  const tinte = await createService(
    tenantId,
    "Tinte profesional",
    { interval: 30, unit: "DAYS" },
    "PRODUCT"
  );
  const customer = await createCustomer(tenantId, "Ana Gómez");
  await recordVisit(tenantId, customer.id, tinte, 60, "PRODUCT_USED");

  assert.equal(
    (await listMaintenanceSchedule(tenantId)).total,
    0,
    "el tinte que gastó el salón no es una compra de la clienta"
  );
});

test("cronograma: un cliente archivado desaparece de la lista", async () => {
  const tenantId = await createTenant("archived");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  const customer = await createCustomer(tenantId, "Archivada");
  await recordVisit(tenantId, customer.id, tinte, 45);

  assert.equal((await listMaintenanceSchedule(tenantId)).total, 1);

  await prisma.customer.update({
    where: { id: customer.id },
    data: { stage: "ARCHIVED", archivedAt: new Date() },
  });

  assert.equal((await listMaintenanceSchedule(tenantId)).total, 0);
});

// ─── Aislamiento multi-tenant ────────────────────────────────────────────────

test("aislamiento: el cronograma jamás mezcla clientes de dos empresas", async () => {
  const tenantA = await createTenant("iso-a");
  const tenantB = await createTenant("iso-b");

  const serviceA = await createService(tenantA, "Tinte", { interval: 30, unit: "DAYS" });
  const serviceB = await createService(tenantB, "Tinte", { interval: 30, unit: "DAYS" });
  const customerA = await createCustomer(tenantA, "De la empresa A");
  const customerB = await createCustomer(tenantB, "De la empresa B");

  await recordVisit(tenantA, customerA.id, serviceA, 45);
  await recordVisit(tenantB, customerB.id, serviceB, 45);

  const scheduleA = await listMaintenanceSchedule(tenantA);
  assert.equal(scheduleA.total, 1);
  assert.equal(scheduleA.items[0].customerName, "De la empresa A");

  // Ni siquiera filtrando por el id del servicio ajeno.
  const leaked = await listMaintenanceSchedule(tenantA, { serviceId: serviceB.id });
  assert.equal(leaked.total, 0, "un id de otra empresa no puede devolver nada");

  const servicesA = await listMaintenanceServices(tenantA);
  assert.equal(servicesA.length, 1);
  assert.equal(servicesA[0].id, serviceA.id);
});

test("cronograma: el desplegable solo ofrece servicios con recurrencia real", async () => {
  const tenantId = await createTenant("services-list");
  const tinte = await createService(tenantId, "Tinte", { interval: 30, unit: "DAYS" });
  await createService(tenantId, "Corte"); // sin recurrencia

  const services = await listMaintenanceServices(tenantId);
  assert.equal(services.length, 1, "ofrecer un servicio sin recurrencia confundiría al negocio");
  assert.equal(services[0].id, tinte.id);
  assert.equal(services[0].recurrenceLabel, "cada 30 días");
});
