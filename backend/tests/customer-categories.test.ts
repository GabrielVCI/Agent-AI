/**
 * Tests de integración del Módulo 2 (Categorías y segmentación) contra
 * PostgreSQL.
 *
 * Seguridad de los datos: cada corrida crea SUS PROPIOS tenants con prefijo
 * `__category_test__` y los borra al final (el cascade limpia categorías,
 * asignaciones, clientes y eventos). No lee, modifica ni borra nada
 * preexistente. Si no hay base de datos alcanzable, la suite falla con un
 * mensaje claro en vez de "pasar" silenciosamente.
 *
 * Ejecutar: npm run test:db:categories  (o npm test, que corre todo)
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
  createCustomer,
  listCustomers,
  updateCustomer,
} from "../src/services/customer/customer.service.js";
import {
  applyAutomationAssignment,
  assignCategory,
  bulkAssignCategory,
  clearSystemCategoryCache,
  createCategory,
  ensureSystemCategories,
  getCategory,
  getCustomerCategories,
  listCategories,
  removeCategory,
  setCategoryArchived,
  syncCategoryManagement,
  updateCategory,
} from "../src/services/customer/customer-category.service.js";
import { archiveRule, createRule } from "../src/services/automation/automation-rules.service.js";

const PREFIX = "__category_test__";
const createdTenantIds: string[] = [];

let phoneSeed = 7_100_000;
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

async function newCustomer(tenantId: string, firstName = "Cliente"): Promise<string> {
  const customer = await createCustomer(tenantId, {
    firstName,
    lastName: "Prueba",
    phone: uniquePhone(),
  });
  return customer.id;
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

// ─── Categorías: alta, unicidad y edición ────────────────────────────────────

test("categorías: se crean como MANUAL y con el nombre tal cual lo escribió el negocio", async () => {
  const tenantId = await createTenant("create");

  const category = await createCategory(tenantId, {
    name: "  Coloración  ",
    description: "Clientas de color",
    color: "info",
  });

  assert.equal(category.name, "Coloración", "el nombre se recorta pero conserva su tilde");
  assert.equal(category.slug, "coloracion");
  assert.equal(category.type, "MANUAL");
  assert.equal(category.status, "ACTIVE");
  assert.equal(category.color, "info");
  assert.equal(category.customerCount, 0);
});

test("categorías: 'VIP', ' vip ' y 'Vip' NO crean tres categorías distintas", async () => {
  const tenantId = await createTenant("dupe");
  const first = await createCategory(tenantId, { name: "Keratina" });

  for (const name of ["keratina", " KERATINA ", "Keratina"]) {
    await assert.rejects(
      () => createCategory(tenantId, { name }),
      (error: unknown) => {
        assert.ok(error instanceof AppError, `no fue AppError con "${name}"`);
        assert.equal(error.statusCode, 409, `debe ser 409, no 500, con "${name}"`);
        assert.equal((error.details as { categoryId?: string })?.categoryId, first.id);
        return true;
      }
    );
  }

  const total = await prisma.customerCategory.count({
    where: { tenantId, slug: "keratina" },
  });
  assert.equal(total, 1, "solo debe existir una categoría");
});

test("categorías: dos empresas distintas pueden tener ambas 'VIP'", async () => {
  const tenantA = await createTenant("same-name-a");
  const tenantB = await createTenant("same-name-b");

  const inA = await createCategory(tenantA, { name: "Corporativo" });
  const inB = await createCategory(tenantB, { name: "Corporativo" });

  assert.notEqual(inA.id, inB.id);
  assert.equal(inA.slug, inB.slug, "el slug es el mismo: la unicidad NO es global");
});

test("categorías: no se acepta marcado ni un color fuera de la paleta", async () => {
  const tenantId = await createTenant("sanitize");

  const category = await createCategory(tenantId, {
    name: '<img src=x onerror="alert(1)">Spa',
    color: "rojo-inventado",
  });

  assert.ok(!category.name.includes("<"), "el nombre no puede llevar marcado");
  assert.ok(!category.name.includes(">"));
  assert.equal(category.color, "purple", "un color inválido cae al de por defecto");
});

test("categorías: el nombre vacío o solo con signos se rechaza", async () => {
  const tenantId = await createTenant("empty-name");

  for (const name of ["   ", "-", "¿?"]) {
    await assert.rejects(
      () => createCategory(tenantId, { name }),
      (error: unknown) => error instanceof AppError && error.statusCode === 400
    );
  }
});

test("categorías: renombrar recalcula el slug y sigue impidiendo duplicados", async () => {
  const tenantId = await createTenant("rename");
  const uno = await createCategory(tenantId, { name: "Tratamientos" });
  const dos = await createCategory(tenantId, { name: "Peinados" });

  const renamed = await updateCategory(tenantId, uno.id, { name: "Tratamiento capilar" });
  assert.equal(renamed.slug, "tratamiento-capilar");

  await assert.rejects(
    () => updateCategory(tenantId, uno.id, { name: "peinados" }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal((error.details as { categoryId?: string })?.categoryId, dos.id);
      return true;
    }
  );
});

// ─── Aislamiento multi-tenant ────────────────────────────────────────────────

test("aislamiento: el tenant B no ve, ni edita, ni archiva la categoría del tenant A", async () => {
  const tenantA = await createTenant("iso-a");
  const tenantB = await createTenant("iso-b");
  const category = await createCategory(tenantA, { name: "Coloración" });

  // No la ve
  const visibleForB = await listCategories(tenantB);
  assert.equal(
    visibleForB.some((item) => item.id === category.id),
    false,
    "la categoría de otra empresa NO puede aparecer en el listado"
  );

  // No la edita ni la archiva: 404, no 403 (no se confirma que exista)
  await assert.rejects(
    () => updateCategory(tenantB, category.id, { name: "Robada" }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
  await assert.rejects(
    () => setCategoryArchived(tenantB, category.id, true),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );

  const untouched = await prisma.customerCategory.findUnique({ where: { id: category.id } });
  assert.equal(untouched?.name, "Coloración");
  assert.equal(untouched?.status, "ACTIVE");
});

test("aislamiento: no se puede asignar la categoría de otra empresa a un cliente propio", async () => {
  const tenantA = await createTenant("cross-a");
  const tenantB = await createTenant("cross-b");
  const categoryOfA = await createCategory(tenantA, { name: "Coloración" });
  const customerOfB = await newCustomer(tenantB, "Ajeno");

  await assert.rejects(
    () => assignCategory(tenantB, customerOfB, categoryOfA.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );

  const leaked = await prisma.customerCategoryAssignment.count({
    where: { categoryId: categoryOfA.id },
  });
  assert.equal(leaked, 0, "no puede existir NINGUNA asignación cruzada");
});

test("aislamiento: no se puede asignar una categoría propia a un cliente de otra empresa", async () => {
  const tenantA = await createTenant("cross-c");
  const tenantB = await createTenant("cross-d");
  const categoryOfA = await createCategory(tenantA, { name: "Keratina" });
  const customerOfB = await newCustomer(tenantB, "Ajeno");

  // El caso inverso: la categoría SÍ es del tenant, el cliente no. Comprobar
  // solo la categoría dejaría pasar esta escritura.
  await assert.rejects(
    () => assignCategory(tenantA, customerOfB, categoryOfA.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
  assert.equal(
    await prisma.customerCategoryAssignment.count({ where: { customerId: customerOfB } }),
    0
  );
});

// ─── Asignaciones ────────────────────────────────────────────────────────────

test("asignación: un cliente puede llevar varias categorías a la vez", async () => {
  const tenantId = await createTenant("many");
  const customerId = await newCustomer(tenantId, "Gabriela");
  const vip = await createCategory(tenantId, { name: "Clienta preferente" });
  const color = await createCategory(tenantId, { name: "Coloración" });
  const frecuente = await createCategory(tenantId, { name: "Frecuente" });

  await assignCategory(tenantId, customerId, vip.id);
  await assignCategory(tenantId, customerId, color.id);
  const all = await assignCategory(tenantId, customerId, frecuente.id);

  assert.equal(all.length, 3);
  assert.deepEqual(
    all.map((item) => item.name).sort(),
    ["Clienta preferente", "Coloración", "Frecuente"]
  );
});

test("asignación: asignar dos veces deja UNA sola pertenencia y no lanza error", async () => {
  const tenantId = await createTenant("idempotent");
  const customerId = await newCustomer(tenantId);
  const category = await createCategory(tenantId, { name: "Coloración" });

  // Doble clic: la segunda llamada no puede devolver 500.
  await assignCategory(tenantId, customerId, category.id);
  const second = await assignCategory(tenantId, customerId, category.id);
  await assignCategory(tenantId, customerId, category.id);

  assert.equal(second.length, 1);
  const rows = await prisma.customerCategoryAssignment.count({
    where: { customerId, categoryId: category.id },
  });
  assert.equal(rows, 1, "la constraint impide más de una asignación activa");
});

test("asignación: quitar y volver a quitar tampoco falla", async () => {
  const tenantId = await createTenant("remove");
  const customerId = await newCustomer(tenantId);
  const category = await createCategory(tenantId, { name: "Coloración" });

  await assignCategory(tenantId, customerId, category.id);
  const after = await removeCategory(tenantId, customerId, category.id);
  assert.equal(after.length, 0);

  const again = await removeCategory(tenantId, customerId, category.id);
  assert.equal(again.length, 0, "quitar algo que ya no está es un no-op, no un error");
});

test("asignación: queda registrado quién la hizo y por qué", async () => {
  const tenantId = await createTenant("trace");
  const customerId = await newCustomer(tenantId);
  const category = await createCategory(tenantId, { name: "Coloración" });

  await assignCategory(tenantId, customerId, category.id, {
    source: "MANUAL",
    userId: "user_demo",
    reason: "alta desde la ficha",
  });

  const [assignment] = await getCustomerCategories(tenantId, customerId);
  assert.equal(assignment.source, "MANUAL");
  assert.equal(assignment.reason, "alta desde la ficha");
  assert.ok(assignment.assignedAt instanceof Date);

  const row = await prisma.customerCategoryAssignment.findFirst({
    where: { tenantId, customerId, categoryId: category.id },
  });
  assert.equal(row?.assignedByUserId, "user_demo");
});

// ─── Manual vs automática ────────────────────────────────────────────────────

test("automáticas: VIP y Riesgo de abandono existen desde el primer listado", async () => {
  const tenantId = await createTenant("system");
  const categories = await listCategories(tenantId);

  const vip = categories.find((item) => item.name === "VIP");
  const risk = categories.find((item) => item.name === "Riesgo de abandono");

  assert.ok(vip, "debe provisionarse la categoría VIP");
  assert.ok(risk, "debe provisionarse la de riesgo");
  assert.equal(vip.type, "AUTOMATIC");
  assert.equal(vip.isSystem, true);
  assert.equal(vip.managedBy, "Customer.isVip");
  assert.equal(risk.managedBy, "Customer.riskStatus");

  // Idempotente: llamarlo de nuevo no duplica nada.
  clearSystemCategoryCache(tenantId);
  await ensureSystemCategories(tenantId);
  assert.equal(
    await prisma.customerCategory.count({ where: { tenantId, isSystem: true } }),
    2
  );
});

test("automáticas: la ficha manda — marcar VIP aplica la categoría y quitarlo la retira", async () => {
  const tenantId = await createTenant("vip-sync");
  const customerId = await newCustomer(tenantId, "Gabriela");

  // Sin VIP no hay insignia
  assert.equal((await getCustomerCategories(tenantId, customerId)).length, 0);

  await updateCustomer(tenantId, customerId, { isVip: true });
  const withVip = await getCustomerCategories(tenantId, customerId);
  assert.equal(withVip.length, 1);
  assert.equal(withVip[0].name, "VIP");
  assert.equal(withVip[0].source, "SYSTEM");

  // Y al revés: no puede quedar un isVip=false con la insignia puesta.
  await updateCustomer(tenantId, customerId, { isVip: false });
  assert.equal((await getCustomerCategories(tenantId, customerId)).length, 0);
});

test("automáticas: el riesgo de abandono sigue al campo riskStatus", async () => {
  const tenantId = await createTenant("risk-sync");
  const customerId = await newCustomer(tenantId);

  await updateCustomer(tenantId, customerId, { riskStatus: "HIGH" });
  let current = await getCustomerCategories(tenantId, customerId);
  assert.equal(current.length, 1);
  assert.equal(current[0].name, "Riesgo de abandono");

  await updateCustomer(tenantId, customerId, { riskStatus: "LOW" });
  current = await getCustomerCategories(tenantId, customerId);
  assert.equal(current.length, 0, "riesgo bajo no es riesgo de abandono");
});

test("automáticas: no se pueden asignar ni quitar a mano", async () => {
  const tenantId = await createTenant("automatic-manual");
  const customerId = await newCustomer(tenantId);
  await ensureSystemCategories(tenantId);
  const vip = await prisma.customerCategory.findFirstOrThrow({
    where: { tenantId, systemKey: "VIP" },
  });

  await assert.rejects(
    () => assignCategory(tenantId, customerId, vip.id),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal((error.details as { automatic?: boolean })?.automatic, true);
      return true;
    }
  );

  await updateCustomer(tenantId, customerId, { isVip: true });
  await assert.rejects(
    () => removeCategory(tenantId, customerId, vip.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );

  // La insignia sigue puesta: la política es que no se toca a mano.
  assert.equal((await getCustomerCategories(tenantId, customerId)).length, 1);
});

test("automáticas: una categoría de sistema no se archiva", async () => {
  const tenantId = await createTenant("system-archive");
  await ensureSystemCategories(tenantId);
  const vip = await prisma.customerCategory.findFirstOrThrow({
    where: { tenantId, systemKey: "VIP" },
  });

  await assert.rejects(
    () => setCategoryArchived(tenantId, vip.id, true),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test("manuales: un reevaluador automático NO borra una categoría puesta a mano", async () => {
  const tenantId = await createTenant("manual-survives");
  const customerId = await newCustomer(tenantId);
  const coloracion = await createCategory(tenantId, { name: "Coloración" });
  await assignCategory(tenantId, customerId, coloracion.id);

  // El cliente entra y sale de VIP varias veces: la sincronización de dominio
  // solo toca SUS categorías, nunca las manuales.
  await updateCustomer(tenantId, customerId, { isVip: true });
  await updateCustomer(tenantId, customerId, { isVip: false });
  await updateCustomer(tenantId, customerId, { riskStatus: "HIGH" });

  const current = await getCustomerCategories(tenantId, customerId);
  const names = current.map((item) => item.name).sort();
  assert.deepEqual(names, ["Coloración", "Riesgo de abandono"]);
  const manual = current.find((item) => item.name === "Coloración");
  assert.equal(manual?.source, "MANUAL", "sigue siendo una asignación manual");
});

// ─── Archivado ───────────────────────────────────────────────────────────────

test("archivado: la categoría deja de asignarse pero los clientes conservan su historial", async () => {
  const tenantId = await createTenant("archive");
  const yaAsignado = await newCustomer(tenantId, "Antiguo");
  const nuevo = await newCustomer(tenantId, "Nuevo");
  const category = await createCategory(tenantId, { name: "Promo verano" });

  await assignCategory(tenantId, yaAsignado, category.id);
  const archived = await setCategoryArchived(tenantId, category.id, true);
  assert.equal(archived.status, "ARCHIVED");
  assert.equal(archived.customerCount, 1, "la asignación existente NO se borra");

  // No se puede volver a asignar…
  await assert.rejects(
    () => assignCategory(tenantId, nuevo, category.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );

  // …y el cliente que ya la tenía sigue funcionando.
  const stillThere = await getCustomerCategories(tenantId, yaAsignado);
  assert.equal(stillThere.length, 1);
  assert.equal(stillThere[0].status, "ARCHIVED");

  // Restaurar la devuelve al juego.
  await setCategoryArchived(tenantId, category.id, false);
  await assignCategory(tenantId, nuevo, category.id);
  assert.equal((await getCustomerCategories(tenantId, nuevo)).length, 1);
});

test("archivado: la categoría archivada desaparece del listado por defecto", async () => {
  const tenantId = await createTenant("archive-list");
  const category = await createCategory(tenantId, { name: "Promo vieja" });
  await setCategoryArchived(tenantId, category.id, true);

  const activas = await listCategories(tenantId);
  assert.equal(activas.some((item) => item.id === category.id), false);

  const todas = await listCategories(tenantId, { includeArchived: true });
  assert.equal(todas.some((item) => item.id === category.id), true);
});

// ─── Filtros del listado de clientes ─────────────────────────────────────────

test("filtros: 'VIP + Coloración' con match ALL solo devuelve a quien tiene AMBAS", async () => {
  const tenantId = await createTenant("filter-all");
  const ambas = await newCustomer(tenantId, "Gabriela");
  const soloUna = await newCustomer(tenantId, "Jose");

  const preferente = await createCategory(tenantId, { name: "Preferente" });
  const coloracion = await createCategory(tenantId, { name: "Coloración" });

  await assignCategory(tenantId, ambas, preferente.id);
  await assignCategory(tenantId, ambas, coloracion.id);
  await assignCategory(tenantId, soloUna, preferente.id);

  // Filtro por UNA: salen los dos.
  const porUna = await listCustomers(tenantId, { categoryIds: [preferente.id] });
  assert.equal(porUna.total, 2);

  // Filtro ALL por las DOS: solo el que las tiene ambas.
  const porAmbas = await listCustomers(tenantId, {
    categoryIds: [preferente.id, coloracion.id],
    categoryMatch: "all",
  });
  assert.equal(porAmbas.total, 1, "el `total` es el total FILTRADO, no el del tenant");
  assert.equal(porAmbas.items[0].id, ambas);

  // Y con ANY vuelven los dos.
  const porAlguna = await listCustomers(tenantId, {
    categoryIds: [preferente.id, coloracion.id],
    categoryMatch: "any",
  });
  assert.equal(porAlguna.total, 2);
});

test("filtros: la categoría se combina con búsqueda y orden sin romper la paginación", async () => {
  const tenantId = await createTenant("filter-combo");
  const maria = await createCustomer(tenantId, {
    firstName: "María",
    lastName: "López",
    phone: uniquePhone(),
  });
  const otra = await createCustomer(tenantId, {
    firstName: "María",
    lastName: "Núñez",
    phone: uniquePhone(),
  });
  const category = await createCategory(tenantId, { name: "Coloración" });
  await assignCategory(tenantId, maria.id, category.id);
  await assignCategory(tenantId, otra.id, category.id);

  const result = await listCustomers(tenantId, {
    search: "López",
    categoryIds: [category.id],
    sortBy: "name",
    sortOrder: "asc",
    page: 1,
    limit: 20,
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, maria.id);
  assert.equal(result.pages, 1);
});

test("filtros: el listado devuelve las insignias del cliente sin consultas por fila", async () => {
  const tenantId = await createTenant("badges");
  const customerId = await newCustomer(tenantId, "Gabriela");
  const uno = await createCategory(tenantId, { name: "Coloración" });
  const dos = await createCategory(tenantId, { name: "Keratina" });
  await assignCategory(tenantId, customerId, uno.id);
  await assignCategory(tenantId, customerId, dos.id);

  const result = await listCustomers(tenantId, {});
  const item = result.items.find((row) => row.id === customerId);
  assert.ok(item);
  assert.deepEqual(item.categories.map((c) => c.name).sort(), ["Coloración", "Keratina"]);
});

test("filtros: un id de categoría de otra empresa no devuelve clientes", async () => {
  const tenantA = await createTenant("filter-iso-a");
  const tenantB = await createTenant("filter-iso-b");
  const categoryOfA = await createCategory(tenantA, { name: "Coloración" });
  const customerOfA = await newCustomer(tenantA);
  await assignCategory(tenantA, customerOfA, categoryOfA.id);
  await newCustomer(tenantB);

  const leaked = await listCustomers(tenantB, { categoryIds: [categoryOfA.id] });
  assert.equal(leaked.total, 0, "filtrar por una categoría ajena no puede devolver nada");
});

// ─── Conteo ──────────────────────────────────────────────────────────────────

test("conteo: el listado de categorías trae el número real de clientes", async () => {
  const tenantId = await createTenant("count");
  const category = await createCategory(tenantId, { name: "Coloración" });

  for (let i = 0; i < 3; i += 1) {
    const customerId = await newCustomer(tenantId, `Cliente${i}`);
    await assignCategory(tenantId, customerId, category.id);
  }

  const [found] = (await listCategories(tenantId)).filter((item) => item.id === category.id);
  assert.equal(found.customerCount, 3);
});

// ─── Operaciones masivas ─────────────────────────────────────────────────────

test("masiva: asigna a varios clientes, es idempotente y omite los de otra empresa", async () => {
  const tenantA = await createTenant("bulk-a");
  const tenantB = await createTenant("bulk-b");
  const category = await createCategory(tenantA, { name: "Promo" });

  const ids = [await newCustomer(tenantA), await newCustomer(tenantA)];
  const ajeno = await newCustomer(tenantB);

  const first = await bulkAssignCategory(tenantA, category.id, [...ids, ajeno], "assign");
  assert.equal(first.applied, 2);
  assert.equal(first.skipped, 1, "el cliente de otra empresa se omite");

  const second = await bulkAssignCategory(tenantA, category.id, ids, "assign");
  assert.equal(second.applied, 0);
  assert.equal(second.alreadyDone, 2, "repetir no duplica nada");

  assert.equal(
    await prisma.customerCategoryAssignment.count({ where: { customerId: ajeno } }),
    0
  );
});

// ─── Integración con el Automation Core ──────────────────────────────────────

test("automation: una regla puede asignar una categoría y el evento queda registrado", async () => {
  const tenantId = await createTenant("automation-assign");
  const customerId = await newCustomer(tenantId);
  const category = await createCategory(tenantId, { name: "Frecuente" });

  const result = await applyAutomationAssignment(
    tenantId,
    customerId,
    category.id,
    "assign",
    { reason: "regla: visitas frecuentes" }
  );
  assert.equal(result.changed, true);

  const [assignment] = await getCustomerCategories(tenantId, customerId);
  assert.equal(assignment.source, "AUTOMATION");
  assert.equal(assignment.reason, "regla: visitas frecuentes");

  const events = await prisma.automationEvent.count({
    where: { tenantId, type: "CUSTOMER_CATEGORY_ASSIGNED" },
  });
  assert.equal(events, 1);
});

test("automation: reasignar lo mismo NO emite otro evento (esto es lo que corta los bucles)", async () => {
  const tenantId = await createTenant("automation-loop");
  const customerId = await newCustomer(tenantId);
  const category = await createCategory(tenantId, { name: "Frecuente" });

  // Cinco pasadas del motor sobre el mismo estado: solo la primera cambia algo.
  for (let i = 0; i < 5; i += 1) {
    const result = await applyAutomationAssignment(tenantId, customerId, category.id, "assign");
    assert.equal(result.changed, i === 0, `la pasada ${i} no debería cambiar nada`);
  }

  const events = await prisma.automationEvent.count({
    where: { tenantId, type: "CUSTOMER_CATEGORY_ASSIGNED" },
  });
  assert.equal(
    events,
    1,
    "sin evento nuevo no hay reglas que disparar: una cadena de categorías se apaga sola"
  );
  assert.equal(
    await prisma.customerCategoryAssignment.count({ where: { customerId } }),
    1
  );
});

test("automation: el payload del evento trae los IDs de categoría para las condiciones", async () => {
  const tenantId = await createTenant("automation-payload");
  const customerId = await newCustomer(tenantId);
  const uno = await createCategory(tenantId, { name: "Coloración" });
  const dos = await createCategory(tenantId, { name: "Keratina" });

  await applyAutomationAssignment(tenantId, customerId, uno.id, "assign");
  await applyAutomationAssignment(tenantId, customerId, dos.id, "assign");

  const last = await prisma.automationEvent.findFirst({
    where: { tenantId, type: "CUSTOMER_CATEGORY_ASSIGNED" },
    orderBy: { createdAt: "desc" },
  });
  const payload = last?.payloadJson as { categoryIds?: string[]; categoryId?: string } | null;

  assert.equal(payload?.categoryId, dos.id);
  // `categoryIds` permite "el cliente tiene la categoría X" con el evaluador de
  // condiciones que YA existe, usando ids y no nombres.
  assert.deepEqual([...(payload?.categoryIds ?? [])].sort(), [uno.id, dos.id].sort());
});

test("automation: una regla no puede mover una categoría de sistema", async () => {
  const tenantId = await createTenant("automation-system");
  const customerId = await newCustomer(tenantId);
  await ensureSystemCategories(tenantId);
  const vip = await prisma.customerCategory.findFirstOrThrow({
    where: { tenantId, systemKey: "VIP" },
  });

  await assert.rejects(
    () => applyAutomationAssignment(tenantId, customerId, vip.id, "assign"),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );
});

test("automation: la asignación de una categoría de otra empresa se rechaza", async () => {
  const tenantA = await createTenant("automation-iso-a");
  const tenantB = await createTenant("automation-iso-b");
  const categoryOfA = await createCategory(tenantA, { name: "Coloración" });
  const customerOfB = await newCustomer(tenantB);

  await assert.rejects(
    () => applyAutomationAssignment(tenantB, customerOfB, categoryOfA.id, "assign"),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
});

// ─── Puente con el panel de automatizaciones ─────────────────────────────────

test("panel: crear una regla que asigna una categoría la vuelve AUTOMÁTICA", async () => {
  const tenantId = await createTenant("managed");
  const category = await createCategory(tenantId, { name: "Frecuente" });
  assert.equal(category.type, "MANUAL", "nace manual");

  // Lo que hace el panel al guardar la regla (el controller llama a esto).
  const rule = await createRule(
    tenantId,
    {
      name: "Marcar frecuentes",
      eventType: "SERVICE_USED",
      status: "ACTIVE",
      enabled: true,
      actionType: "ASSIGN_CUSTOMER_CATEGORY",
      actionConfig: { categoryId: category.id },
      scheduleStrategy: "IMMEDIATE",
    },
    "user_test"
  );
  await syncCategoryManagement(tenantId);

  const managed = await getCategory(tenantId, category.id);
  assert.equal(managed.type, "AUTOMATIC", "la mantiene una regla: ya no es manual");
  assert.equal(managed.isSystem, false);

  // Y por tanto deja de poder asignarse a mano.
  const customerId = await newCustomer(tenantId);
  await assert.rejects(
    () => assignCategory(tenantId, customerId, category.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 409
  );

  // Al archivar la regla vuelve a ser manual: no puede quedar marcada como
  // automática sin nada detrás manteniéndola (§79).
  await archiveRule(tenantId, rule.id);
  await syncCategoryManagement(tenantId);
  assert.equal((await getCategory(tenantId, category.id)).type, "MANUAL");

  // Y vuelve a poder asignarse a mano.
  await assignCategory(tenantId, customerId, category.id);
  assert.equal((await getCustomerCategories(tenantId, customerId)).length, 1);
});

test("panel: una categoría de sistema NUNCA se marca como gestionada por regla", async () => {
  const tenantId = await createTenant("managed-system");
  await ensureSystemCategories(tenantId);
  const vip = await prisma.customerCategory.findFirstOrThrow({
    where: { tenantId, systemKey: "VIP" },
  });

  await createRule(
    tenantId,
    {
      name: "Regla que apunta a VIP",
      eventType: "CUSTOMER_VISITED",
      status: "ACTIVE",
      enabled: true,
      actionType: "ASSIGN_CUSTOMER_CATEGORY",
      actionConfig: { categoryId: vip.id },
      scheduleStrategy: "IMMEDIATE",
    },
    "user_test"
  );
  await syncCategoryManagement(tenantId);

  const after = await getCategory(tenantId, vip.id);
  assert.equal(after.isSystem, true);
  assert.equal(
    after.managedBy,
    "Customer.isVip",
    "VIP sigue derivando de la ficha, no de la regla"
  );
});
