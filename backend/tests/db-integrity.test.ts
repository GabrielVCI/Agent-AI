/**
 * QA de BASE DE DATOS — integridad a nivel de PostgreSQL.
 *
 * Las demás suites prueban reglas de negocio; esta prueba lo que la BASE
 * garantiza por sí sola (o no): unique constraints, foreign keys y sus reglas
 * ON DELETE, nullability, defaults, rollback de transacciones y las carreras
 * que solo una constraint puede cerrar.
 *
 * Convención (QA_RULES / QA_HTTP_TESTS): un fallo real del producto se deja
 * como prueba con `{ todo: "FALLA ABIERTA Fn" }`; `ℹ todo` ≠ 0 no es verde.
 *
 * Seguridad de los datos: solo corre con la guarda `use-test-db.ts` (base
 * `_test`). Crea SUS PROPIOS tenants/planes con prefijo `__dbqa_test__` y los
 * borra al final. No lee, modifica ni borra nada preexistente.
 *
 * Ejecutar: npm run test:db:integrity  (incluida en npm run test:db)
 */
import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../src/config/prisma.js";
import { closeRedis } from "../src/config/redis.js";
import { findOrCreateActiveConversation } from "../src/services/conversation.service.js";
import { findOrCreateCustomer } from "../src/services/customer/customer.service.js";
import { reserveIdempotency } from "../src/lib/idempotency.js";
import { createUserForTenant } from "../src/services/admin.service.js";
import { hashPassword, loginUser } from "../src/services/auth.service.js";
import { findUserByEmail } from "../src/services/user-lookup.service.js";

const PREFIX = "__dbqa_test__";
const tenantIds: string[] = [];
const planIds: string[] = [];
const userIds: string[] = [];

const sfx = () => randomUUID().slice(0, 8);
let phoneSeed = 9_400_000 + Math.floor(Math.random() * 50_000);
const uniquePhone = () => `+1809${String(++phoneSeed).padStart(7, "0")}`;

async function newTenant(label: string) {
  const t = await prisma.tenant.create({ data: { name: `${PREFIX}${label}-${sfx()}` } });
  tenantIds.push(t.id);
  return t;
}

async function newPlan() {
  const p = await prisma.plan.create({
    data: {
      name: `${PREFIX}plan-${sfx()}`,
      maxAgents: 1,
      maxWhatsappNumbers: 1,
      maxMonthlyConversations: 10,
      maxMonthlyQuotes: 10,
      maxStorageMb: 10,
      priceMonthly: new Prisma.Decimal("1.00"),
      isActive: false,
    },
  });
  planIds.push(p.id);
  return p;
}

async function newCustomer(tenantId: string, phone = uniquePhone()) {
  return prisma.customer.create({ data: { tenantId, phone } });
}

function prismaCode(err: unknown): string | undefined {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
}

async function expectCode(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (err) => {
    assert.equal(prismaCode(err), code, `se esperaba ${code}, llegó ${String(err)}`);
    return true;
  });
}

after(async () => {
  // Orden: tenants (arrastran todo por cascada) → etiquetas huérfanas (sin FK)
  // → usuarios sueltos → planes (Subscription→Plan es RESTRICT).
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.conversationLabel.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.$disconnect();
  await closeRedis().catch(() => {});
});

// ─── Unique constraints ──────────────────────────────────────────────────────

test("unique: Customer (tenantId, phone) rechaza el duplicado dentro del tenant", async () => {
  const t = await newTenant("uq-cust");
  const phone = uniquePhone();
  await newCustomer(t.id, phone);
  await expectCode(newCustomer(t.id, phone), "P2002");
});

test("unique + aislamiento: el mismo teléfono SÍ puede existir en dos tenants", async () => {
  const a = await newTenant("iso-a");
  const b = await newTenant("iso-b");
  const phone = uniquePhone();
  await newCustomer(a.id, phone);
  await newCustomer(b.id, phone);
  const n = await prisma.customer.count({ where: { phone, tenantId: { in: [a.id, b.id] } } });
  assert.equal(n, 2);
});

test("unique: Product (tenantId, sku) duplicado en el tenant, libre entre tenants", async () => {
  const a = await newTenant("uq-sku-a");
  const b = await newTenant("uq-sku-b");
  const sku = `SKU-${sfx()}`;
  await prisma.product.create({ data: { tenantId: a.id, name: "p", price: 1, sku } });
  await expectCode(
    prisma.product.create({ data: { tenantId: a.id, name: "p2", price: 1, sku } }),
    "P2002"
  );
  await prisma.product.create({ data: { tenantId: b.id, name: "p", price: 1, sku } });
});

test("unique: una sola Subscription por tenant", async () => {
  const t = await newTenant("uq-sub");
  const plan = await newPlan();
  const period = { currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 864e5) };
  await prisma.subscription.create({ data: { tenantId: t.id, planId: plan.id, ...period } });
  await expectCode(
    prisma.subscription.create({ data: { tenantId: t.id, planId: plan.id, ...period } }),
    "P2002"
  );
});

test("unique: User.email exacto duplicado → P2002", async () => {
  const email = `${PREFIX}dup-${sfx()}@qa.local`;
  const u = await prisma.user.create({ data: { name: "qa", email, role: "OWNER" } });
  userIds.push(u.id);
  await expectCode(prisma.user.create({ data: { name: "qa", email, role: "OWNER" } }), "P2002");
});

test(
  "unique: User.email NO distingue mayúsculas en toda ruta de alta (alta por admin)", // regresión F4
  async () => {
    const t = await newTenant("email-case");
    const mixed = `${PREFIX}Mixto-${sfx()}@QA.local`;
    const created = await createUserForTenant({
      tenantId: t.id,
      name: "qa",
      email: mixed,
      password: "Prueba-Local-1234",
      role: "ADMIN",
    });
    userIds.push(created.id);
    // registerUser/login/password-reset buscan por el email en minúsculas.
    const lower = mixed.toLowerCase();
    const found = await prisma.user.findUnique({ where: { email: lower } });
    assert.ok(found, "el usuario creado por admin debe ser localizable por su email normalizado");
    // El login tampoco depende de cómo escriba el usuario las mayúsculas.
    const { user } = await loginUser(mixed.toUpperCase(), "Prueba-Local-1234", {});
    assert.equal(user.id, created.id);
  }
);

test("F4: una fila legada con mayúsculas se encuentra y ya no admite un duplicado en minúsculas", async () => {
  const t = await newTenant("email-legacy");
  const legacy = `${PREFIX}Legado-${sfx()}@QA.local`;
  // Fila anterior a la corrección, escrita tal cual (sin normalizar).
  const u = await prisma.user.create({
    data: {
      name: "qa",
      email: legacy,
      role: "ADMIN",
      tenantId: t.id,
      passwordHash: await hashPassword("Prueba-Local-1234"),
    },
  });
  userIds.push(u.id);

  assert.equal((await findUserByEmail(legacy.toLowerCase()))?.id, u.id);
  const { user } = await loginUser(legacy.toLowerCase(), "Prueba-Local-1234", {});
  assert.equal(user.id, u.id);
  await assert.rejects(
    createUserForTenant({
      tenantId: t.id,
      name: "qa",
      email: legacy.toLowerCase(),
      password: "Prueba-Local-1234",
      role: "ADMIN",
    }),
    /Ya existe un usuario con ese email/
  );
});

// ─── Nullability y defaults ──────────────────────────────────────────────────

test("nullability: Message sin tenantId es rechazado por la base", async () => {
  await assert.rejects(
    prisma.$executeRaw`INSERT INTO "Message" (id, "tenantId", "conversationId", direction, "senderType")
      VALUES (${`${PREFIX}${sfx()}`}, NULL, 'x', 'INBOUND', 'CUSTOMER')`,
    /null value|not-null|23502/i
  );
});

test("defaults: Tenant, Customer, Conversation y Product nacen con los valores del schema", async () => {
  const t = await newTenant("defaults");
  assert.equal(t.status, "ACTIVE");
  assert.equal(t.timezone, "America/Santo_Domingo");
  const c = await newCustomer(t.id);
  const conv = await prisma.conversation.create({ data: { tenantId: t.id, customerId: c.id } });
  assert.equal(conv.status, "BOT_ACTIVE");
  const p = await prisma.product.create({ data: { tenantId: t.id, name: "p", price: 1 } });
  assert.equal(p.taxRate.toString(), "0.18");
  assert.equal(p.unit, "unidad");
});

// ─── Foreign keys y reglas ON DELETE ─────────────────────────────────────────

test("FK: no se puede crear un Customer de un tenant inexistente (P2003)", async () => {
  await expectCode(newCustomer(`${PREFIX}no-existe-${sfx()}`), "P2003");
});

test("ON DELETE RESTRICT: no se borra un Plan con suscripciones", async () => {
  const t = await newTenant("restrict");
  const plan = await newPlan();
  await prisma.subscription.create({
    data: {
      tenantId: t.id,
      planId: plan.id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 864e5),
    },
  });
  // Con @prisma/adapter-pg la violación RESTRICT NO llega como P2003
  // (PrismaClientKnownRequestError) sino como DriverAdapterError: se valida la
  // barrera de la base por su mensaje (SQLSTATE 23001). Ver RIESGO R15.
  await assert.rejects(prisma.plan.delete({ where: { id: plan.id } }), /violates RESTRICT|foreign key/i);
  assert.ok(await prisma.plan.findUnique({ where: { id: plan.id } }), "el plan debe seguir existiendo");
});

test("ON DELETE SET NULL: borrar Agent/Product deja la conversación y la cita con FK nula", async () => {
  const t = await newTenant("setnull");
  const c = await newCustomer(t.id);
  const agent = await prisma.agent.create({ data: { tenantId: t.id, name: "a", type: "SALES" } });
  const prod = await prisma.product.create({ data: { tenantId: t.id, name: "s", price: 1 } });
  const conv = await prisma.conversation.create({
    data: { tenantId: t.id, customerId: c.id, agentId: agent.id },
  });
  const appt = await prisma.appointment.create({
    data: {
      tenantId: t.id,
      customerId: c.id,
      catalogItemId: prod.id,
      customerName: "qa",
      customerPhone: c.phone,
      serviceOrProduct: "qa",
      scheduledAt: new Date(Date.now() + 864e5),
    },
  });
  await prisma.agent.delete({ where: { id: agent.id } });
  await prisma.product.delete({ where: { id: prod.id } });
  assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).agentId, null);
  assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).catalogItemId, null);
});

test("ON DELETE CASCADE: borrar el tenant elimina su grafo; ConversationLabel queda huérfana (sin FK)", async () => {
  const t = await newTenant("cascade");
  const c = await newCustomer(t.id);
  const conv = await prisma.conversation.create({ data: { tenantId: t.id, customerId: c.id } });
  await prisma.message.create({
    data: { tenantId: t.id, conversationId: conv.id, direction: "INBOUND", senderType: "CUSTOMER", textContent: "hola" },
  });
  await prisma.humanHandoff.create({ data: { tenantId: t.id, conversationId: conv.id, reason: "qa" } });
  const label = await prisma.conversationLabel.create({ data: { tenantId: t.id, name: `${PREFIX}l` } });
  await prisma.conversationLabelAssignment.create({ data: { conversationId: conv.id, labelId: label.id } });

  await prisma.tenant.delete({ where: { id: t.id } });

  const left = {
    customer: await prisma.customer.count({ where: { tenantId: t.id } }),
    conversation: await prisma.conversation.count({ where: { tenantId: t.id } }),
    message: await prisma.message.count({ where: { tenantId: t.id } }),
    handoff: await prisma.humanHandoff.count({ where: { tenantId: t.id } }),
    labelAssignment: await prisma.conversationLabelAssignment.count({ where: { labelId: label.id } }),
  };
  assert.deepEqual(left, { customer: 0, conversation: 0, message: 0, handoff: 0, labelAssignment: 0 });
  // RIESGO R14 (caracterización): ConversationLabel.tenantId no tiene FK.
  assert.equal(await prisma.conversationLabel.count({ where: { tenantId: t.id } }), 1);
});

// ─── Transacciones ───────────────────────────────────────────────────────────

test("rollback: un error dentro de $transaction no deja escrituras parciales", async () => {
  const t = await newTenant("rollback");
  const phone = uniquePhone();
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await tx.customer.create({ data: { tenantId: t.id, phone } });
      await tx.customer.create({ data: { tenantId: t.id, phone } }); // P2002 → aborta todo
    })
  );
  assert.equal(await prisma.customer.count({ where: { tenantId: t.id } }), 0);
});

// ─── Condiciones de carrera ──────────────────────────────────────────────────

test("carrera: 8 findOrCreateCustomer simultáneos con el mismo teléfono → 1 fila", async () => {
  const t = await newTenant("race-cust");
  const phone = uniquePhone();
  const rows = await Promise.all(
    Array.from({ length: 8 }, () => findOrCreateCustomer({ tenantId: t.id, phone }))
  );
  assert.equal(new Set(rows.map((r) => r.id)).size, 1);
  assert.equal(await prisma.customer.count({ where: { tenantId: t.id } }), 1);
});

test("carrera: 8 reservas simultáneas de la misma idempotency key → exactamente 1 gana", async () => {
  const t = await newTenant("race-idem");
  const key = `${PREFIX}wa:${sfx()}`;
  const res = await Promise.all(
    Array.from({ length: 8 }, () => reserveIdempotency(key, "webhook", t.id))
  );
  assert.equal(res.filter((r) => r.reserved).length, 1);
  await prisma.idempotencyKey.deleteMany({ where: { key } });
});

test(
  "carrera: mensajes simultáneos de un cliente nuevo abren UNA sola conversación activa", // regresión F5
  async () => {
    const t = await newTenant("race-conv");
    // 10 rondas × 10 llamadas simultáneas, cada ronda con un cliente nuevo.
    const counts: number[] = [];
    for (let round = 0; round < 10; round++) {
      const c = await newCustomer(t.id);
      await Promise.all(
        Array.from({ length: 10 }, () =>
          findOrCreateActiveConversation({ tenantId: t.id, customerId: c.id })
        )
      );
      counts.push(
        await prisma.conversation.count({
          where: { customerId: c.id, status: { in: ["BOT_ACTIVE", "HUMAN_ACTIVE", "OPEN"] } },
        })
      );
    }
    assert.deepEqual(counts, Array(10).fill(1), `activas por cliente: ${counts.join(",")}`);
  }
);
