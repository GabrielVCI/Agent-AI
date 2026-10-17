/**
 * Tests de integración del Maestro de Clientes (Módulo 1) contra PostgreSQL.
 *
 * Seguridad de los datos: cada corrida crea SUS PROPIOS tenants con prefijo
 * `__customer_test__` y los borra al final (el cascade limpia clientes, citas,
 * conversaciones y eventos). No lee, modifica ni borra nada preexistente. Si
 * no hay base de datos alcanzable, la suite falla con un mensaje claro en vez
 * de "pasar" silenciosamente.
 *
 * Ejecutar: npm run test:customers  (o npm test, que corre todo)
 */
import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";

import { prisma } from "../src/config/prisma.js";
import { closeRedis } from "../src/config/redis.js";
import { AppError } from "../src/errors/AppError.js";
import {
  clearTenantPhoneCountryCache,
  createCustomer,
  findOrCreateCustomer,
  getOwnCustomer,
  listCustomers,
  promoteToClient,
  recalculateCustomerVisitStats,
  updateCustomer,
} from "../src/services/customer/customer.service.js";
import { getCustomerCommercialSummary } from "../src/services/customer/customer-metrics.service.js";
import { importCustomers } from "../src/services/customer/customer-import.service.js";
import {
  completeAppointment,
  confirmAppointment,
  createAppointment,
} from "../src/services/appointment.service.js";

const PREFIX = "__customer_test__";
const createdTenantIds: string[] = [];

/** Teléfono dominicano válido y único por corrida (evita choques entre runs). */
let phoneSeed = 5_000_000;
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
  return tenant.id;
}

/** Cuenta los eventos que el motor registró para un tenant. */
async function countEvents(tenantId: string, type: "CUSTOMER_CREATED" | "CUSTOMER_VISITED") {
  return prisma.automationEvent.count({ where: { tenantId, type } });
}

async function buildXlsx(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Clientes");
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

before(async () => {
  // Falla temprano y claro si no hay DB: nunca se reporta "verde" sin haber
  // ejercitado nada.
  await prisma.$queryRaw`SELECT 1`;
});

after(async () => {
  for (const tenantId of createdTenantIds) {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  }
  await prisma.$disconnect();
  await closeRedis().catch(() => {});
});

// ─── Alta manual ─────────────────────────────────────────────────────────────

test("alta manual: crea el cliente con teléfono canónico y nombre compuesto", async () => {
  const tenantId = await createTenant("manual");

  const customer = await createCustomer(tenantId, {
    firstName: "  Gabriela ",
    lastName: "Pérez",
    phone: "809-555-0101",
    email: "  GABRIELA@Ejemplo.COM ",
    birthDate: "1992-04-18",
    notes: "Prefiere las mañanas",
  });

  assert.equal(customer.name, "Gabriela Pérez");
  assert.equal(customer.firstName, "Gabriela");
  assert.equal(customer.lastName, "Pérez");
  assert.equal(customer.phoneNormalized, "+18095550101");
  assert.equal(customer.email, "gabriela@ejemplo.com", "el email se normaliza a minúsculas");
  assert.equal(customer.birthDate, "1992-04-18", "la fecha llega sin hora ni zona");
  assert.equal(customer.stage, "CLIENT", "un alta manual es un cliente confirmado");
  assert.equal(customer.source, "MANUAL");
});

test("alta manual: rechaza un teléfono que no es un número real", async () => {
  const tenantId = await createTenant("manual-invalid");
  await assert.rejects(
    () =>
      createCustomer(tenantId, {
        firstName: "Juan",
        lastName: "Pérez",
        phone: "123",
      }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test("alta manual: la fecha de nacimiento no puede ser futura", async () => {
  const tenantId = await createTenant("manual-birth");
  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await assert.rejects(
    () =>
      createCustomer(tenantId, {
        firstName: "Juan",
        lastName: "Pérez",
        phone: uniquePhone(),
        birthDate: future,
      }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

// ─── Deduplicación ───────────────────────────────────────────────────────────

test("duplicados: el mismo número en otro formato NO crea un segundo cliente", async () => {
  const tenantId = await createTenant("dupe");

  const first = await createCustomer(tenantId, {
    firstName: "Ana",
    lastName: "Gómez",
    phone: "8095550202",
  });

  // Mismo número escrito de otras cuatro formas: todas deben chocar.
  for (const phone of ["+18095550202", "1-809-555-0202", "(809) 555-0202", "1 809 555 0202"]) {
    await assert.rejects(
      () => createCustomer(tenantId, { firstName: "Ana", lastName: "Gómez", phone }),
      (error: unknown) => {
        assert.ok(error instanceof AppError, `no fue AppError con "${phone}"`);
        assert.equal(error.statusCode, 409, `debe ser 409, no 500, con "${phone}"`);
        // La UI necesita el id para ofrecer "ver la ficha existente"
        assert.equal((error.details as { customerId?: string })?.customerId, first.id);
        return true;
      }
    );
  }

  const total = await prisma.customer.count({ where: { tenantId } });
  assert.equal(total, 1, "solo debe existir un cliente");
});

test("multi-tenant: el mismo número puede existir en dos empresas distintas", async () => {
  const tenantA = await createTenant("tenant-a");
  const tenantB = await createTenant("tenant-b");
  const phone = "+18095550303";

  const inA = await createCustomer(tenantA, { firstName: "Luis", lastName: "Mora", phone });
  const inB = await createCustomer(tenantB, { firstName: "Luis", lastName: "Mora", phone });

  assert.notEqual(inA.id, inB.id);
  assert.equal(inA.phoneNormalized, inB.phoneNormalized);
});

test("concurrencia: dos altas simultáneas del mismo número dejan UN solo cliente", async () => {
  const tenantId = await createTenant("race");
  const phone = "8095550404";

  // Ambas rutas de alta a la vez: la unique constraint es la última barrera.
  const results = await Promise.allSettled([
    findOrCreateCustomer({ tenantId, phone, customerName: "Carrera 1" }),
    findOrCreateCustomer({ tenantId, phone: `+1${phone}`, customerName: "Carrera 2" }),
    createCustomer(tenantId, { firstName: "Carrera", lastName: "Tres", phone: `1-809-555-0404` }),
  ]);

  const total = await prisma.customer.count({ where: { tenantId } });
  assert.equal(total, 1, "la carrera no puede producir duplicados");

  // Al menos una operación tuvo éxito (las que pierden devuelven la existente
  // o un 409 explicativo, nunca un 500).
  assert.ok(results.some((r) => r.status === "fulfilled"));
  for (const result of results) {
    if (result.status === "rejected") {
      assert.ok(
        result.reason instanceof AppError && result.reason.statusCode === 409,
        "la perdedora debe ser un 409 amigable"
      );
    }
  }

  // Y un solo evento CUSTOMER_CREATED: nada de avisar dos veces al motor.
  assert.equal(await countEvents(tenantId, "CUSTOMER_CREATED"), 1);
});

// ─── Aislamiento entre tenants ───────────────────────────────────────────────

test("aislamiento: un tenant no puede leer el cliente de otro conociendo su id", async () => {
  const tenantA = await createTenant("iso-a");
  const tenantB = await createTenant("iso-b");

  const customerOfB = await createCustomer(tenantB, {
    firstName: "Privado",
    lastName: "Ajeno",
    phone: uniquePhone(),
  });

  await assert.rejects(
    () => getOwnCustomer(tenantA, customerOfB.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
    "debe ser 404 (ni siquiera confirma que ese id existe)"
  );

  await assert.rejects(
    () => updateCustomer(tenantA, customerOfB.id, { firstName: "Hackeado" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );

  const listOfA = await listCustomers(tenantA, {});
  assert.equal(
    listOfA.items.some((c) => c.id === customerOfB.id),
    false,
    "el listado jamás debe filtrar clientes de otra empresa"
  );
});

// ─── Alta automática desde citas ─────────────────────────────────────────────

test("alta automática: una cita confirmada crea el cliente UNA vez y lo promueve", async () => {
  const tenantId = await createTenant("appointment");
  const phone = "8095550505";

  const appointment = await createAppointment(tenantId, {
    customerName: "Rosa Martínez",
    customerPhone: phone,
    scheduledAt: new Date(Date.now() + 3 * 86_400_000),
    serviceOrProduct: "Keratina",
    status: "PENDING",
  });

  // Cita PENDIENTE: el contacto existe pero todavía NO es cliente.
  const afterCreate = await prisma.customer.findMany({ where: { tenantId } });
  assert.equal(afterCreate.length, 1);
  assert.equal(afterCreate[0].stage, "CONTACT", "una cita sin confirmar no crea un cliente");
  assert.equal(afterCreate[0].phoneNormalized, "+18095550505");
  assert.equal(appointment.customerId, afterCreate[0].id, "la cita queda vinculada al maestro");

  // Al confirmarla, pasa a CLIENTE.
  await confirmAppointment(tenantId, appointment.id);
  const afterConfirm = await prisma.customer.findMany({ where: { tenantId } });
  assert.equal(afterConfirm.length, 1, "no se crea un segundo cliente");
  assert.equal(afterConfirm[0].stage, "CLIENT");
  assert.ok(afterConfirm[0].clientSince, "debe registrar desde cuándo es cliente");

  // Un único CUSTOMER_CREATED pese a los tres eventos de cita.
  assert.equal(await countEvents(tenantId, "CUSTOMER_CREATED"), 1);
});

test("alta automática: un mensaje suelto de WhatsApp NO crea un cliente confirmado", async () => {
  const tenantId = await createTenant("whatsapp-hola");

  const contact = await findOrCreateCustomer({
    tenantId,
    phone: "18095550606",
    customerName: "Gaby",
  });

  assert.equal(contact.stage, "CONTACT", "quien solo escribe 'Hola' es un contacto");
  assert.equal(contact.source, "WHATSAPP");
  assert.equal(contact.firstName, "Gaby");
  assert.equal(contact.lastName, null, "no se inventa un apellido");

  const listed = await listCustomers(tenantId, { stage: "CLIENT" });
  assert.equal(listed.total, 0, "no aparece al filtrar por clientes");
});

test("visitas: completar una cita cuenta UNA visita y emite CUSTOMER_VISITED", async () => {
  const tenantId = await createTenant("visits");
  const phone = uniquePhone();

  const appointment = await createAppointment(tenantId, {
    customerName: "Pedro Núñez",
    customerPhone: phone,
    scheduledAt: new Date(Date.now() - 86_400_000),
    serviceOrProduct: "Mantenimiento",
    status: "CONFIRMED",
  });
  await completeAppointment(tenantId, appointment.id);

  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId } });
  assert.equal(customer.visitCount, 1);
  assert.ok(customer.lastVisitAt, "debe registrar la última visita");
  assert.equal(
    customer.firstVisitAt?.getTime(),
    customer.lastVisitAt?.getTime(),
    "con una sola visita, primera y última coinciden"
  );
  assert.equal(await countEvents(tenantId, "CUSTOMER_VISITED"), 1);

  // Una cita cancelada NO suma visita.
  const cancelled = await createAppointment(tenantId, {
    customerName: "Pedro Núñez",
    customerPhone: phone,
    scheduledAt: new Date(Date.now() + 86_400_000),
    serviceOrProduct: "Revisión",
  });
  await prisma.appointment.update({
    where: { id: cancelled.id },
    data: { status: "CANCELLED" },
  });
  const stats = await recalculateCustomerVisitStats(tenantId, customer.id);
  assert.equal(stats.visitCount, 1, "solo cuentan las citas COMPLETED");

  const summary = await getCustomerCommercialSummary(tenantId, customer.id);
  assert.equal(summary.visitCount, 1);
  assert.equal(summary.appointments.total, 2);
  assert.equal(summary.appointments.completed, 1);
  assert.equal(summary.appointments.cancelled, 1);
  assert.equal(summary.quotes.totalQuoted, 0, "sin cotizaciones el importe es cero real, no inventado");
});

// ─── Búsqueda y filtros ──────────────────────────────────────────────────────

test("búsqueda: escribir el teléfono sin formato encuentra el canónico", async () => {
  const tenantId = await createTenant("search");
  await createCustomer(tenantId, {
    firstName: "Marta",
    lastName: "Sánchez",
    phone: "+18095550707",
    email: "marta@ejemplo.com",
  });

  for (const query of ["8095550707", "+18095550707", "0707", "Marta", "marta@ejemplo.com", "sánchez"]) {
    const result = await listCustomers(tenantId, { search: query });
    assert.equal(result.total, 1, `la búsqueda "${query}" debería encontrarlo`);
  }

  const miss = await listCustomers(tenantId, { search: "8299999999" });
  assert.equal(miss.total, 0);
});

test("filtros: 'sin regresar' usa la última visita real y excluye a quien nunca vino", async () => {
  const tenantId = await createTenant("inactive");

  const visited = await createCustomer(tenantId, {
    firstName: "Antiguo",
    lastName: "Cliente",
    phone: uniquePhone(),
  });
  await prisma.customer.update({
    where: { id: visited.id },
    data: { lastVisitAt: new Date(Date.now() - 45 * 86_400_000), visitCount: 3 },
  });

  await createCustomer(tenantId, {
    firstName: "Nunca",
    lastName: "Vino",
    phone: uniquePhone(),
  });

  const inactive30 = await listCustomers(tenantId, { inactiveDays: 30 });
  assert.equal(inactive30.total, 1);
  assert.equal(inactive30.items[0].id, visited.id);

  const inactive60 = await listCustomers(tenantId, { inactiveDays: 60 });
  assert.equal(inactive60.total, 0, "45 días no entra en el corte de 60+");

  const withoutVisits = await listCustomers(tenantId, { hasVisits: false });
  assert.equal(withoutVisits.total, 1);
  assert.equal(withoutVisits.items[0].firstName, "Nunca");
});

test("listado: la paginación devuelve el total FILTRADO y no se salta filas", async () => {
  const tenantId = await createTenant("pagination");
  for (let i = 0; i < 7; i++) {
    await createCustomer(tenantId, {
      firstName: `Cliente${i}`,
      lastName: "Paginado",
      phone: uniquePhone(),
    });
  }

  const first = await listCustomers(tenantId, { page: 1, limit: 3, sortBy: "createdAt" });
  const second = await listCustomers(tenantId, { page: 2, limit: 3, sortBy: "createdAt" });
  const third = await listCustomers(tenantId, { page: 3, limit: 3, sortBy: "createdAt" });

  assert.equal(first.total, 7);
  assert.equal(first.pages, 3);
  assert.equal(first.items.length, 3);
  assert.equal(third.items.length, 1);

  const ids = new Set([...first.items, ...second.items, ...third.items].map((c) => c.id));
  assert.equal(ids.size, 7, "ninguna fila se repite ni se pierde entre páginas");
});

test("listado: el DTO no expone cédula, dirección ni notas", async () => {
  const tenantId = await createTenant("dto");
  await createCustomer(tenantId, {
    firstName: "Datos",
    lastName: "Sensibles",
    phone: uniquePhone(),
    documentId: "001-1234567-8",
    address: "Calle secreta 1",
    notes: "Nota interna",
  });

  const result = await listCustomers(tenantId, {});
  const item = result.items[0] as unknown as Record<string, unknown>;
  assert.equal("documentId" in item, false);
  assert.equal("address" in item, false);
  assert.equal("notes" in item, false);
  assert.equal("birthDate" in item, false);
});

// ─── Importación ─────────────────────────────────────────────────────────────

const CSV_HEADER = "Nombre,Apellido,Teléfono,Email,Fecha de nacimiento,Cédula,Dirección,Notas,Etiquetas";

test("importación CSV: cuenta creados, existentes, repetidos y erróneos", async () => {
  const tenantId = await createTenant("import-csv");

  // Ya existe uno para probar la deduplicación contra el maestro.
  await createCustomer(tenantId, {
    firstName: "Ya",
    lastName: "Existe",
    phone: "+18095551001",
  });

  const csv = [
    CSV_HEADER,
    "Ana,Torres,8095551002,ana@ejemplo.com,1990-01-15,,,Cliente nueva,VIP",
    "Luis,Peña,(809) 555-1003,,,,,,",
    "Ya,Existe,+1 809 555 1001,,,,,,", // ya está en el maestro
    "Ana,Torres,1-809-555-1002,,,,,,", // repetida dentro del archivo
    ",Sinnombre,8095551004,,,,,,", // nombre vacío
    "Mal,Telefono,123,,,,,,", // teléfono inválido
    "Fecha,Mala,8095551005,,2099-01-01,,,,", // cumpleaños futuro
  ].join("\n");

  const file = {
    originalname: "clientes.csv",
    mimetype: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  };

  // Vista previa: NO escribe nada.
  const preview = await importCustomers(tenantId, file, { preview: true });
  assert.equal(preview.preview, true);
  assert.equal(preview.processed, 7, "las 7 filas con contenido del archivo");
  assert.equal(preview.created, 0, "el preview nunca inserta");
  assert.equal(await prisma.customer.count({ where: { tenantId } }), 1);

  // Import real.
  const result = await importCustomers(tenantId, file, { preview: false });
  assert.equal(result.created, 2, "Ana y Luis");
  assert.equal(result.existing, 1, "el que ya estaba en el maestro");
  assert.equal(result.duplicatesInFile, 1, "Ana repetida en otro formato");
  assert.equal(result.invalid, 3, "sin nombre, teléfono inválido y fecha futura");
  assert.equal(await prisma.customer.count({ where: { tenantId } }), 3);

  // Los errores se reportan POR FILA, sin abortar las demás.
  const badPhoneRow = result.rows.find((r) => r.phone === "123");
  assert.ok(badPhoneRow?.errors.some((e) => e.includes("Teléfono")));

  // Idempotencia: reimportar el mismo archivo no duplica nada.
  const again = await importCustomers(tenantId, file, { preview: false });
  assert.equal(again.created, 0);
  assert.equal(again.existing, 3);
  assert.equal(await prisma.customer.count({ where: { tenantId } }), 3);
});

test("importación XLSX: acepta la plantilla oficial y normaliza los teléfonos", async () => {
  const tenantId = await createTenant("import-xlsx");
  const buffer = await buildXlsx([
    ["Nombre", "Apellido", "Teléfono", "Email"],
    ["Carmen", "Díaz", "809-555-2001", "carmen@ejemplo.com"],
    ["Jorge", "Ramos", "+1 (809) 555-2002", ""],
  ]);

  const result = await importCustomers(
    tenantId,
    { originalname: "clientes.xlsx", mimetype: "", buffer },
    { preview: false }
  );

  assert.equal(result.created, 2);
  const saved = await prisma.customer.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
  assert.deepEqual(
    saved.map((c) => c.phoneNormalized).sort(),
    ["+18095552001", "+18095552002"]
  );
  assert.equal(saved.every((c) => c.source === "IMPORT" && c.stage === "CLIENT"), true);
});

test("importación: rechaza un archivo sin las columnas obligatorias", async () => {
  const tenantId = await createTenant("import-headers");
  const csv = "Correo,Comentario\nana@ejemplo.com,hola";
  await assert.rejects(
    () =>
      importCustomers(
        tenantId,
        { originalname: "malo.csv", mimetype: "text/csv", buffer: Buffer.from(csv) },
        { preview: true }
      ),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

test("importación: rechaza extensiones que no son .csv ni .xlsx", async () => {
  const tenantId = await createTenant("import-ext");
  await assert.rejects(
    () =>
      importCustomers(
        tenantId,
        { originalname: "malicioso.exe", mimetype: "application/octet-stream", buffer: Buffer.from("MZ") },
        { preview: true }
      ),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
});

// ─── Enriquecimiento automático ──────────────────────────────────────────────

test("datos automáticos: WhatsApp rellena huecos pero nunca pisa lo escrito a mano", async () => {
  const tenantId = await createTenant("merge");
  const phone = uniquePhone();

  const manual = await createCustomer(tenantId, {
    firstName: "Nombre",
    lastName: "Correcto",
    phone,
    email: "correcto@ejemplo.com",
  });

  // El perfil de WhatsApp trae otro nombre y otro correo: no debe pisarlos.
  const afterWhatsapp = await findOrCreateCustomer({
    tenantId,
    phone,
    customerName: "apodo raro",
    email: "otro@ejemplo.com",
  });

  assert.equal(afterWhatsapp.id, manual.id);
  assert.equal(afterWhatsapp.name, "Nombre Correcto");
  assert.equal(afterWhatsapp.email, "correcto@ejemplo.com");
});

test("datos automáticos: el placeholder 'Cliente' sí se reemplaza por un nombre real", async () => {
  const tenantId = await createTenant("placeholder");
  const phone = uniquePhone();

  const first = await findOrCreateCustomer({ tenantId, phone });
  assert.equal(first.name, "Cliente");

  const second = await findOrCreateCustomer({ tenantId, phone, customerName: "Sofía Reyes" });
  assert.equal(second.id, first.id);
  assert.equal(second.name, "Sofía Reyes");
  assert.equal(second.firstName, "Sofía");
  assert.equal(second.lastName, "Reyes");
});

test("promoción: es idempotente y no revive a un cliente archivado", async () => {
  const tenantId = await createTenant("promote");
  const contact = await findOrCreateCustomer({ tenantId, phone: uniquePhone() });

  const promoted = await promoteToClient(tenantId, contact.id, "test");
  assert.equal(promoted?.stage, "CLIENT");
  const firstSince = promoted?.clientSince?.getTime();

  const again = await promoteToClient(tenantId, contact.id, "test");
  assert.equal(again?.clientSince?.getTime(), firstSince, "no reescribe la fecha");

  await prisma.customer.update({
    where: { id: contact.id },
    data: { stage: "ARCHIVED", archivedAt: new Date() },
  });
  const archived = await promoteToClient(tenantId, contact.id, "test");
  assert.equal(archived?.stage, "ARCHIVED", "un flujo automático no desarchiva");
});
