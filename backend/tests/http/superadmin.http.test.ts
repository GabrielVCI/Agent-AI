/**
 * Pruebas HTTP del invariante más delicado del producto:
 *
 *   **SUPER_ADMIN nunca queda bloqueado por paywall, verificación de correo ni
 *   por el estado de implementación de una empresa.**
 *
 * SUPER_ADMIN es el equipo de Sendwary. No pertenece a ninguna empresa
 * (`tenantId = null`) y no tiene suscripción, así que cualquier control pensado
 * para clientes lo dejaría fuera de su propio panel si no se le exceptúa. Está
 * implementado en tres sitios y hasta ahora nada impedía que un refactor
 * rompiera cualquiera de ellos:
 *
 *   1. `roles.middleware.ts`       → requireTenantAccess
 *   2. `plan-limits.middleware.ts` → checkPlanLimit
 *   3. `RequireActiveSubscription.tsx` (frontend, fuera del alcance de esta suite)
 *
 * ── Por qué se prueban los middlewares aislados ──────────────────────────────
 * Contra las rutas reales el resultado se mezcla y no prueba lo que parece: un
 * SUPER_ADMIN recibe 403 en `POST /api/agents`, pero se lo da `requireRole`
 * ("OWNER","ADMIN" — no incluye SUPER_ADMIN) mucho antes de llegar al paywall.
 * Montando el middleware solo, la respuesta significa una única cosa.
 *
 * Eso NO es un fallo del invariante: el SUPER_ADMIN administra desde
 * `/api/admin/*`, no desde las rutas de empresa. Ver §6 de QA_HTTP_TESTS.md.
 *
 * Ejecutar: npm run test:http:superadmin
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import { requireAuth } from "../../src/middlewares/auth.middleware.js";
import { checkPlanLimit } from "../../src/middlewares/plan-limits.middleware.js";
import { requireTenantAccess } from "../../src/middlewares/roles.middleware.js";
import {
  cleanupTestData,
  createTenantWithOwner,
  createTestUser,
  giveActiveSubscription,
  type TestUser,
} from "../helpers/factories.js";
import { errorCode, getAs, loginAs, middlewareApp, probe } from "../helpers/http.js";

let superAdmin: TestUser;

/** Empresa sin suscripción: el paywall SÍ debe frenarla. */
let tenantSinPlan: string;
let ownerSinPlan: TestUser;

/** Empresa con suscripción activa: control de que el paywall no frena de más. */
let ownerConPlan: TestUser;

/** Apps mínimas con los middlewares reales bajo prueba. */
const appPaywall = middlewareApp(requireAuth, checkPlanLimit("agents"));
const appTenant = middlewareApp(requireAuth, requireTenantAccess);

before(async () => {
  superAdmin = await createTestUser({ role: "SUPER_ADMIN", tenantId: null, label: "sa" });

  const sinPlan = await createTenantWithOwner("sa-sin-plan");
  tenantSinPlan = sinPlan.tenantId;
  ownerSinPlan = sinPlan.owner;
  // A propósito: NO se le da suscripción.

  const conPlan = await createTenantWithOwner("sa-con-plan");
  ownerConPlan = conPlan.owner;
  await giveActiveSubscription(conPlan.tenantId);
});

after(async () => {
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

describe("punto de partida", () => {
  test("el SUPER_ADMIN de prueba no tiene empresa", async () => {
    const enBase = await prisma.user.findUnique({ where: { id: superAdmin.id } });

    assert.equal(enBase?.tenantId, null, "el SUPER_ADMIN de prueba tiene empresa");
    assert.equal(enBase?.role, "SUPER_ADMIN");
  });

  test("no tiene ninguna suscripción asociada", async () => {
    const suscripciones = await prisma.subscription.count({
      where: { tenant: { users: { some: { id: superAdmin.id } } } },
    });

    assert.equal(suscripciones, 0);
  });
});

describe("checkPlanLimit: el paywall", () => {
  test("frena a una empresa SIN suscripción", async () => {
    // Sin esta comprobación la prueba siguiente no demostraría nada: si el
    // paywall no frenara a nadie, el SUPER_ADMIN pasaría por accidente.
    const cookie = await loginAs(ownerSinPlan);
    const res = await probe(appPaywall, cookie);

    assert.equal(
      res.status,
      403,
      "una empresa sin suscripción atravesó el paywall: el control no está aplicando"
    );
  });

  test("deja pasar a una empresa CON suscripción activa", async () => {
    const cookie = await loginAs(ownerConPlan);
    const res = await probe(appPaywall, cookie);

    assert.equal(res.status, 200, "el paywall frenó a una empresa que sí pagó");
  });

  test("🔒 NO frena al SUPER_ADMIN, que no tiene suscripción", async () => {
    const cookie = await loginAs(superAdmin);
    const res = await probe(appPaywall, cookie);

    assert.equal(
      res.status,
      200,
      "el SUPER_ADMIN quedó bloqueado por el paywall — INVARIANTE ROTO"
    );
  });
});

describe("requireTenantAccess: la pertenencia a una empresa", () => {
  test("deja pasar a un usuario con empresa", async () => {
    const cookie = await loginAs(ownerConPlan);
    const res = await probe(appTenant, cookie);

    assert.equal(res.status, 200);
  });

  test("frena a un usuario normal SIN empresa", async () => {
    // El contraste: el bypass debe darlo el rol, no el simple hecho de no
    // tener tenantId.
    const huerfano = await createTestUser({
      role: "ADMIN",
      tenantId: null,
      label: "sin-empresa",
    });

    const cookie = await loginAs(huerfano);
    const res = await probe(appTenant, cookie);

    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), "TENANT_REQUIRED");
  });

  test("🔒 NO frena al SUPER_ADMIN, que tampoco tiene empresa", async () => {
    const cookie = await loginAs(superAdmin);
    const res = await probe(appTenant, cookie);

    assert.equal(
      res.status,
      200,
      "el SUPER_ADMIN fue rechazado por no pertenecer a una empresa — INVARIANTE ROTO"
    );
  });
});

describe("el panel de administración", () => {
  test("responde 200 al SUPER_ADMIN", async () => {
    const cookie = await loginAs(superAdmin);
    const res = await getAs(cookie, "/api/admin/tenants");

    assert.equal(res.status, 200);
  });

  test("lista también las empresas sin suscripción", async () => {
    // Si el panel filtrara por estado comercial, el equipo no podría
    // administrar justo a las empresas que necesitan ayuda.
    const cookie = await loginAs(superAdmin);
    const res = await getAs(cookie, "/api/admin/tenants");

    assert.equal(res.status, 200);
    assert.match(
      JSON.stringify(res.body),
      new RegExp(tenantSinPlan),
      "el panel no lista una empresa sin suscripción"
    );
  });

  test("🔒 con el correo SIN verificar sigue entrando", async () => {
    const saSinVerificar = await createTestUser({
      role: "SUPER_ADMIN",
      tenantId: null,
      label: "sa-sin-verificar",
      emailVerified: false,
    });

    const cookie = await loginAs(saSinVerificar);
    const res = await getAs(cookie, "/api/admin/tenants");

    assert.equal(
      res.status,
      200,
      "un SUPER_ADMIN con el correo sin verificar quedó fuera del panel — INVARIANTE ROTO"
    );
  });

  test("🔒 el paywall tampoco lo frena con el correo sin verificar", async () => {
    const saSinVerificar = await createTestUser({
      role: "SUPER_ADMIN",
      tenantId: null,
      label: "sa-sin-verificar-2",
      emailVerified: false,
    });

    const cookie = await loginAs(saSinVerificar);
    const res = await probe(appPaywall, cookie);

    assert.equal(res.status, 200);
  });
});
