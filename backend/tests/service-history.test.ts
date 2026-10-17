/**
 * Tests de integración del Módulo 3 (Historial de servicios, visitas y
 * recurrencias) contra PostgreSQL.
 *
 * Seguridad de los datos: cada corrida crea SUS PROPIOS tenants con prefijo
 * `__history_test__` y los borra al final (el cascade limpia citas, líneas,
 * clientes, jobs y eventos). No lee, modifica ni borra nada preexistente. Si no
 * hay base de datos alcanzable, la suite falla con un mensaje claro en vez de
 * "pasar" silenciosamente.
 *
 * Ejecutar: npm run test:db:history  (o npm test, que corre todo)
 */
import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

import { prisma } from "../src/config/prisma.js";
import { closeRedis } from "../src/config/redis.js";
import { AppError } from "../src/errors/AppError.js";
import {
  clearTenantPhoneCountryCache,
  getOwnCustomer,
} from "../src/services/customer/customer.service.js";
import { clearSystemCategoryCache } from "../src/services/customer/customer-category.service.js";
import {
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  createAppointment,
  markNoShow,
  reopenAppointment,
} from "../src/services/appointment.service.js";
import {
  addAppointmentLine,
  listAppointmentLines,
  removeAppointmentLine,
} from "../src/services/appointment/appointment-lines.service.js";
import { getCustomerCommercialSummary } from "../src/services/customer/customer-metrics.service.js";
import { listCustomerFollowUps } from "../src/services/customer/customer-followups.service.js";
import { createRule } from "../src/services/automation/automation-rules.service.js";
import { recurrenceEntityId } from "../src/services/appointment/service-recurrence.js";

const PREFIX = "__history_test__";
const createdTenantIds: string[] = [];

let phoneSeed = 8_200_000;
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

/** Servicio del catálogo, con recurrencia opcional. */
async function createService(
  tenantId: string,
  name: string,
  options: { price?: number; recurrenceDays?: number } = {}
) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      itemType: "SERVICE",
      price: new (await import("@prisma/client")).Prisma.Decimal(options.price ?? 800),
      stock: null,
      ...(options.recurrenceDays
        ? {
            recurrenceEnabled: true,
            recurrenceInterval: options.recurrenceDays,
            recurrenceUnit: "DAYS" as const,
          }
        : {}),
    },
  });
}

async function createProduct(tenantId: string, name: string, price = 350) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      itemType: "PRODUCT",
      price: new (await import("@prisma/client")).Prisma.Decimal(price),
      stock: 10,
    },
  });
}

/** Cita futura (la disponibilidad rechaza el pasado). */
function futureDate(hoursFromNow = 24): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

async function newAppointment(
  tenantId: string,
  options: { name?: string; service?: string; catalogItemId?: string } = {}
) {
  return createAppointment(tenantId, {
    customerName: options.name ?? "María López",
    customerPhone: uniquePhone(),
    scheduledAt: futureDate(),
    serviceOrProduct: options.service ?? "Coloración",
    catalogItemId: options.catalogItemId ?? null,
    priority: "NORMAL",
    status: "CONFIRMED",
    source: "MANUAL",
  });
}

/** Regla real de mantenimiento: es la que convierte SERVICE_USED en un job. */
async function createMaintenanceRule(tenantId: string) {
  return createRule(tenantId, {
    name: "Recordatorio de mantenimiento",
    eventType: "SERVICE_USED",
    status: "ACTIVE",
    enabled: true,
    actionType: "SEND_WHATSAPP_MESSAGE",
    actionConfig: { template: "Hola {{nombre}}, ya toca tu {{servicio}}." },
    scheduleStrategy: "RELATIVE_TO_FIELD",
    scheduleConfig: {
      field: "nextRecommendedAt",
      offsetMinutes: 0,
      dedupeWindow: "occurrence",
      dedupeTag: "service-maintenance",
    },
    cancelOnEventTypes: ["SERVICE_USED"],
    priority: 5,
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

// ─── Cierre de la cita ───────────────────────────────────────────────────────

test("cierre: completar una cita la marca, registra la visita y actualiza métricas", async () => {
  const tenantId = await createTenant("complete");
  const appointment = await newAppointment(tenantId);

  const completed = await completeAppointment(tenantId, appointment.id);

  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt, "la cita debe llevar la marca de la visita");
  assert.equal(completed.lines.length, 1, "se materializa la línea de lo que se agendó");
  assert.equal(completed.lines[0].status, "PERFORMED");
  assert.ok(completed.lines[0].performedAt);

  const customer = await getOwnCustomer(tenantId, completed.customerId as string);
  assert.equal(customer.visitCount, 1);
  assert.ok(customer.lastVisitAt);
  assert.ok(customer.firstVisitAt);
  assert.equal(
    customer.firstVisitAt?.getTime(),
    customer.lastVisitAt?.getTime(),
    "con una sola visita, primera y última son la misma"
  );
});

test("cierre: completar dos veces produce UNA visita y UN juego de servicios", async () => {
  const tenantId = await createTenant("idempotent");
  const appointment = await newAppointment(tenantId);

  await completeAppointment(tenantId, appointment.id);
  await completeAppointment(tenantId, appointment.id);
  const third = await completeAppointment(tenantId, appointment.id);

  assert.equal(third.status, "COMPLETED");

  const customer = await getOwnCustomer(tenantId, third.customerId as string);
  assert.equal(customer.visitCount, 1, "un doble clic no puede contar dos visitas");

  const lines = await prisma.appointmentLine.count({
    where: { tenantId, appointmentId: appointment.id },
  });
  assert.equal(lines, 1, "tampoco puede duplicar el historial de servicios");

  const events = await prisma.automationEvent.count({
    where: { tenantId, type: "CUSTOMER_VISITED" },
  });
  assert.equal(events, 1, "ni volver a disparar las automatizaciones");
});

test("cierre: dos peticiones SIMULTÁNEAS dejan una sola visita", async () => {
  const tenantId = await createTenant("concurrent");
  const appointment = await newAppointment(tenantId);

  // Carrera real: dos instancias del backend cerrando la misma cita.
  const results = await Promise.allSettled([
    completeAppointment(tenantId, appointment.id),
    completeAppointment(tenantId, appointment.id),
    completeAppointment(tenantId, appointment.id),
  ]);
  assert.ok(
    results.every((result) => result.status === "fulfilled"),
    "ninguna de las peticiones debe fallar con un 500"
  );

  const customer = await getOwnCustomer(
    tenantId,
    (await prisma.appointment.findFirstOrThrow({ where: { id: appointment.id } })).customerId as string
  );
  assert.equal(customer.visitCount, 1);
  assert.equal(
    await prisma.appointmentLine.count({ where: { tenantId, appointmentId: appointment.id } }),
    1
  );
});

test("cierre: una cita cancelada no se puede completar", async () => {
  const tenantId = await createTenant("cancelled");
  const appointment = await newAppointment(tenantId);
  await cancelAppointment(tenantId, appointment.id, "prueba");

  await assert.rejects(
    () => completeAppointment(tenantId, appointment.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

// ─── Qué cuenta como visita ──────────────────────────────────────────────────

test("visitas: canceladas y no-show NO cuentan; solo la completada", async () => {
  const tenantId = await createTenant("visit-count");
  const phone = uniquePhone();

  const make = (service: string) =>
    createAppointment(tenantId, {
      customerName: "José Pérez",
      customerPhone: phone,
      scheduledAt: futureDate(24 + Math.random() * 100),
      serviceOrProduct: service,
      priority: "NORMAL",
      status: "CONFIRMED",
      source: "MANUAL",
    });

  const cancelada = await make("Corte");
  const noShow = await make("Keratina");
  const completada = await make("Coloración");

  await cancelAppointment(tenantId, cancelada.id, "prueba");
  await markNoShow(tenantId, noShow.id);
  const done = await completeAppointment(tenantId, completada.id);

  const customer = await getOwnCustomer(tenantId, done.customerId as string);
  assert.equal(customer.visitCount, 1, "3 citas, 1 sola visita");
});

test("visitas: tres servicios en una cita son UNA visita y TRES líneas", async () => {
  const tenantId = await createTenant("multi-service");
  const coloracion = await createService(tenantId, "Coloración", { price: 1500 });
  const corte = await createService(tenantId, "Corte", { price: 600 });
  const tratamiento = await createService(tenantId, "Tratamiento", { price: 900 });

  const appointment = await newAppointment(tenantId, { catalogItemId: coloracion.id });
  await addAppointmentLine(tenantId, appointment.id, { productId: corte.id });
  await addAppointmentLine(tenantId, appointment.id, { productId: tratamiento.id });

  const completed = await completeAppointment(tenantId, appointment.id);

  assert.equal(completed.lines.length, 3, "una línea por servicio realizado");
  const customer = await getOwnCustomer(tenantId, completed.customerId as string);
  assert.equal(customer.visitCount, 1, "tres servicios NO son tres visitas");

  const summary = await getCustomerCommercialSummary(tenantId, customer.id);
  assert.equal(summary.services.length, 3);
  assert.equal(summary.serviced.total, 3000, "1500 + 600 + 900 del catálogo del día");
});

// ─── Snapshots ───────────────────────────────────────────────────────────────

test("historial: subir la tarifa NO reescribe lo que se cobró antes", async () => {
  const tenantId = await createTenant("snapshot");
  const service = await createService(tenantId, "Corte Premium", { price: 800 });
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });

  const completed = await completeAppointment(tenantId, appointment.id);
  assert.equal(completed.lines[0].unitPrice, 800);

  // Meses después el negocio sube el precio.
  const { Prisma } = await import("@prisma/client");
  await prisma.product.update({
    where: { id: service.id },
    data: { price: new Prisma.Decimal(1200), name: "Corte Premium Deluxe" },
  });

  const summary = await getCustomerCommercialSummary(tenantId, completed.customerId as string);
  assert.equal(summary.serviced.total, 800, "el historial pasado sigue valiendo 800");
  assert.equal(
    summary.services[0].name,
    "Corte Premium",
    "y conserva el nombre que tenía ese día"
  );
});

test("historial: una cita cerrada no admite editar sus líneas", async () => {
  const tenantId = await createTenant("frozen");
  const service = await createService(tenantId, "Coloración");
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });
  await completeAppointment(tenantId, appointment.id);

  const [line] = await listAppointmentLines(tenantId, appointment.id);

  await assert.rejects(
    () => addAppointmentLine(tenantId, appointment.id, { name: "Servicio colado" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
  await assert.rejects(
    () => removeAppointmentLine(tenantId, appointment.id, line.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test("historial: un servicio marcado como NO realizado no entra al historial", async () => {
  const tenantId = await createTenant("skipped");
  const coloracion = await createService(tenantId, "Coloración", { price: 1500 });
  const extra = await createService(tenantId, "Tratamiento", { price: 900 });

  const appointment = await newAppointment(tenantId, { catalogItemId: coloracion.id });
  const skipped = await addAppointmentLine(tenantId, appointment.id, {
    productId: extra.id,
    status: "SKIPPED",
  });

  const completed = await completeAppointment(tenantId, appointment.id);
  const performed = completed.lines.filter((line) => line.status === "PERFORMED");

  assert.equal(performed.length, 1, "solo entra lo que de verdad se hizo");
  const stillSkipped = completed.lines.find((line) => line.id === skipped.id);
  assert.equal(stillSkipped?.status, "SKIPPED");

  const summary = await getCustomerCommercialSummary(tenantId, completed.customerId as string);
  assert.equal(summary.serviced.total, 1500, "el servicio no realizado no suma importe");
});

// ─── Productos: venta vs uso interno ─────────────────────────────────────────

test("productos: la venta suma al historial y el uso interno NO", async () => {
  const tenantId = await createTenant("products");
  const service = await createService(tenantId, "Coloración", { price: 1500 });
  const champu = await createProduct(tenantId, "Champú post-color", 350);
  const tinte = await createProduct(tenantId, "Tinte profesional", 500);

  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });
  await addAppointmentLine(tenantId, appointment.id, { productId: champu.id }); // se vende
  await addAppointmentLine(tenantId, appointment.id, {
    productId: tinte.id,
    kind: "PRODUCT_USED", // se gasta durante el servicio
  });

  const completed = await completeAppointment(tenantId, appointment.id);
  const usado = completed.lines.find((line) => line.kind === "PRODUCT_USED");
  assert.equal(usado?.total, 0, "el producto usado internamente no se le cobra al cliente");

  const summary = await getCustomerCommercialSummary(tenantId, completed.customerId as string);
  assert.deepEqual(
    summary.products.map((product) => product.name),
    ["Champú post-color"],
    "solo el producto VENDIDO entra en su historial de compras"
  );
  assert.equal(summary.serviced.total, 1850, "1500 del servicio + 350 del champú");

  // Y el evento de compra solo se emite por la venta real.
  const purchases = await prisma.automationEvent.findMany({
    where: { tenantId, type: "PRODUCT_PURCHASED" },
  });
  assert.equal(purchases.length, 1);
  assert.equal(
    (purchases[0].payloadJson as { productId?: string })?.productId,
    champu.id,
    "el tinte gastado NO puede emitir PRODUCT_PURCHASED"
  );
});

// ─── Eventos del Automation Core ─────────────────────────────────────────────

test("automation: el cierre emite APPOINTMENT_COMPLETED, CUSTOMER_VISITED y SERVICE_USED", async () => {
  const tenantId = await createTenant("events");
  const service = await createService(tenantId, "Coloración");
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });

  await completeAppointment(tenantId, appointment.id);

  const types = await prisma.automationEvent.findMany({
    where: { tenantId },
    select: { type: true },
  });
  const emitted = types.map((event) => event.type);

  assert.ok(emitted.includes("APPOINTMENT_COMPLETED"));
  assert.ok(emitted.includes("CUSTOMER_VISITED"));
  assert.ok(emitted.includes("SERVICE_USED"));
  assert.ok(
    !emitted.includes("PRODUCT_PURCHASED"),
    "no hubo venta: no puede haber evento de compra"
  );
});

test("automation: SERVICE_USED viaja con ids, no con el nombre del servicio", async () => {
  const tenantId = await createTenant("event-payload");
  const service = await createService(tenantId, "Keratina", { recurrenceDays: 90 });
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });

  const completed = await completeAppointment(tenantId, appointment.id);

  const event = await prisma.automationEvent.findFirstOrThrow({
    where: { tenantId, type: "SERVICE_USED" },
  });
  const payload = event.payloadJson as { serviceId?: string; nextRecommendedAt?: string };

  assert.equal(payload.serviceId, service.id, "las reglas se configuran por id");
  assert.ok(payload.nextRecommendedAt, "el servicio recurrente lleva su próxima fecha");
  assert.equal(
    event.entityId,
    recurrenceEntityId(completed.customerId as string, service.id),
    "la entidad del evento es la pareja cliente+servicio"
  );
});

// ─── Recurrencias ────────────────────────────────────────────────────────────

test("recurrencia: un servicio con política programa UN seguimiento real", async () => {
  const tenantId = await createTenant("recurrence");
  await createMaintenanceRule(tenantId);
  const service = await createService(tenantId, "Coloración", { recurrenceDays: 40 });
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });

  const completed = await completeAppointment(tenantId, appointment.id);
  const customerId = completed.customerId as string;

  const followUps = await listCustomerFollowUps(tenantId, customerId);
  assert.equal(followUps.length, 1, "un seguimiento, ni cero ni dos");
  assert.equal(followUps[0].serviceId, service.id);
  assert.equal(followUps[0].serviceName, "Coloración");

  // ~40 días desde hoy (tolerancia de un día por la hora local).
  const days = (followUps[0].scheduledFor.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert.ok(days > 38 && days < 42, `esperaba ~40 días, fueron ${days.toFixed(1)}`);
});

test("recurrencia: un servicio SIN política no inventa ningún seguimiento", async () => {
  const tenantId = await createTenant("no-recurrence");
  await createMaintenanceRule(tenantId);
  const service = await createService(tenantId, "Corte"); // sin recurrencia
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });

  const completed = await completeAppointment(tenantId, appointment.id);

  const followUps = await listCustomerFollowUps(tenantId, completed.customerId as string);
  assert.equal(followUps.length, 0, "sin política configurada NO se programa nada");
});

test("recurrencia: volver antes de tiempo cancela el aviso viejo y recalcula el nuevo", async () => {
  const tenantId = await createTenant("recurrence-reset");
  await createMaintenanceRule(tenantId);
  const service = await createService(tenantId, "Coloración", { recurrenceDays: 40 });
  const phone = uniquePhone();

  const book = async () =>
    createAppointment(tenantId, {
      customerName: "María López",
      customerPhone: phone,
      scheduledAt: futureDate(24 + Math.random() * 200),
      serviceOrProduct: "Coloración",
      catalogItemId: service.id,
      priority: "NORMAL",
      status: "CONFIRMED",
      source: "MANUAL",
    });

  const first = await completeAppointment(tenantId, (await book()).id);
  const customerId = first.customerId as string;
  const [before] = await listCustomerFollowUps(tenantId, customerId);
  assert.ok(before, "la primera visita programó su seguimiento");

  // La clienta vuelve a hacerse la MISMA coloración antes del retoque.
  await completeAppointment(tenantId, (await book()).id);

  const after = await listCustomerFollowUps(tenantId, customerId);
  assert.equal(after.length, 1, "sigue habiendo UN solo seguimiento activo");

  // Invariante real: para la pareja cliente+servicio NUNCA queda más de un job
  // vivo. El motor lo consigue cancelando el anterior y reprogramando; si las
  // dos visitas caen en el mismo día la clave de idempotencia es la misma y
  // reutiliza la fila, que es igual de correcto y además no deja basura.
  const jobs = await prisma.automationJob.findMany({
    where: { tenantId, entityId: recurrenceEntityId(customerId, service.id) },
    select: { id: true, status: true, cancelReason: true, scheduledFor: true },
  });
  const active = jobs.filter((job) => job.status === "SCHEDULED");
  assert.equal(active.length, 1, "jamás dos avisos vivos del mismo servicio");

  // Y ningún job se borró: los que dejaron de aplicar quedan CANCELLED con su
  // motivo, para poder auditar por qué no se envió aquel mensaje.
  for (const job of jobs.filter((j) => j.status === "CANCELLED")) {
    assert.ok(job.cancelReason, "un aviso cancelado conserva su motivo");
  }
  assert.ok(
    jobs.some((job) => job.id === active[0].id),
    "el aviso vivo sale del recálculo de la nueva visita"
  );
});

test("recurrencia: repetir un servicio NO toca el seguimiento de otro", async () => {
  const tenantId = await createTenant("recurrence-scope");
  await createMaintenanceRule(tenantId);
  const coloracion = await createService(tenantId, "Coloración", { recurrenceDays: 40 });
  const keratina = await createService(tenantId, "Keratina", { recurrenceDays: 120 });
  const phone = uniquePhone();

  const book = async (name: string, catalogItemId: string) =>
    createAppointment(tenantId, {
      customerName: "Gabriela Pérez",
      customerPhone: phone,
      scheduledAt: futureDate(24 + Math.random() * 200),
      serviceOrProduct: name,
      catalogItemId,
      priority: "NORMAL",
      status: "CONFIRMED",
      source: "MANUAL",
    });

  const firstVisit = await completeAppointment(tenantId, (await book("Keratina", keratina.id)).id);
  const customerId = firstVisit.customerId as string;
  await completeAppointment(tenantId, (await book("Coloración", coloracion.id)).id);

  let followUps = await listCustomerFollowUps(tenantId, customerId);
  assert.equal(followUps.length, 2, "dos servicios recurrentes, dos seguimientos");

  const keratinaBefore = followUps.find((item) => item.serviceId === keratina.id);
  assert.ok(keratinaBefore);

  // Se repite SOLO la coloración.
  await completeAppointment(tenantId, (await book("Coloración", coloracion.id)).id);

  followUps = await listCustomerFollowUps(tenantId, customerId);
  assert.equal(followUps.length, 2, "el mantenimiento de keratina debe seguir vivo");
  const keratinaAfter = followUps.find((item) => item.serviceId === keratina.id);
  assert.equal(
    keratinaAfter?.id,
    keratinaBefore.id,
    "repetir la coloración NO puede cancelar la keratina"
  );
});

// ─── Reapertura y reconciliación ─────────────────────────────────────────────

test("reapertura: revierte la visita, recalcula métricas y cancela sus seguimientos", async () => {
  const tenantId = await createTenant("reopen");
  await createMaintenanceRule(tenantId);
  const service = await createService(tenantId, "Coloración", { recurrenceDays: 40 });
  const appointment = await newAppointment(tenantId, { catalogItemId: service.id });

  const completed = await completeAppointment(tenantId, appointment.id);
  const customerId = completed.customerId as string;
  assert.equal((await getOwnCustomer(tenantId, customerId)).visitCount, 1);
  assert.equal((await listCustomerFollowUps(tenantId, customerId)).length, 1);

  const reopened = await reopenAppointment(tenantId, appointment.id, "cerrada por error");

  assert.equal(reopened.status, "CONFIRMED");
  assert.equal(reopened.completedAt, null, "deja de estar marcada como visita");
  assert.equal(reopened.lines[0].status, "PLANNED");
  assert.equal(reopened.lines[0].performedAt, null);

  const customer = await getOwnCustomer(tenantId, customerId);
  assert.equal(customer.visitCount, 0, "no puede quedar una visita fantasma");
  assert.equal(customer.lastVisitAt, null);

  assert.equal(
    (await listCustomerFollowUps(tenantId, customerId)).length,
    0,
    "los seguimientos de esa visita se cancelan"
  );

  // Y se puede volver a cerrar correctamente.
  const again = await completeAppointment(tenantId, appointment.id);
  assert.equal(again.status, "COMPLETED");
  assert.equal((await getOwnCustomer(tenantId, customerId)).visitCount, 1);
});

test("reapertura: reabrir una cita que no está cerrada es un no-op", async () => {
  const tenantId = await createTenant("reopen-noop");
  const appointment = await newAppointment(tenantId);
  await confirmAppointment(tenantId, appointment.id);

  const result = await reopenAppointment(tenantId, appointment.id);
  assert.equal(result.status, "CONFIRMED");
});

// ─── Aislamiento multi-tenant ────────────────────────────────────────────────

test("aislamiento: el tenant B no puede completar ni tocar la cita del tenant A", async () => {
  const tenantA = await createTenant("iso-a");
  const tenantB = await createTenant("iso-b");
  const appointment = await newAppointment(tenantA);

  for (const action of [
    () => completeAppointment(tenantB, appointment.id),
    () => reopenAppointment(tenantB, appointment.id),
    () => listAppointmentLines(tenantB, appointment.id),
    () => addAppointmentLine(tenantB, appointment.id, { name: "Colado" }),
  ]) {
    await assert.rejects(
      action,
      (error: unknown) => error instanceof AppError && error.statusCode === 404
    );
  }

  const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
  assert.equal(untouched.status, "CONFIRMED");
  assert.equal(untouched.completedAt, null);
});

test("aislamiento: no se puede meter un producto de otra empresa en una cita propia", async () => {
  const tenantA = await createTenant("iso-product-a");
  const tenantB = await createTenant("iso-product-b");
  const serviceOfB = await createService(tenantB, "Servicio ajeno");
  const appointment = await newAppointment(tenantA);

  await assert.rejects(
    () => addAppointmentLine(tenantA, appointment.id, { productId: serviceOfB.id }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
  assert.equal(
    await prisma.appointmentLine.count({ where: { productId: serviceOfB.id } }),
    0
  );
});

test("aislamiento: los seguimientos de otro cliente no se pueden leer ni mover", async () => {
  const tenantA = await createTenant("iso-follow-a");
  const tenantB = await createTenant("iso-follow-b");
  await createMaintenanceRule(tenantA);
  const service = await createService(tenantA, "Coloración", { recurrenceDays: 40 });
  const appointment = await newAppointment(tenantA, { catalogItemId: service.id });
  const completed = await completeAppointment(tenantA, appointment.id);

  await assert.rejects(
    () => listCustomerFollowUps(tenantB, completed.customerId as string),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
});
