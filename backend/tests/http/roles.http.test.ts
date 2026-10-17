/**
 * Pruebas HTTP de roles y aislamiento por empresa.
 *
 * Verifican los middlewares `requireRole`, `requireTenantAccess` y
 * `requireSuperAdmin`, que hasta ahora no tenían ninguna prueba pese a ser lo
 * único que separa a una empresa de otra.
 *
 * Ejecutar: npm run test:http:roles
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import {
  cleanupTestData,
  createTenantWithOwner,
  createTestUser,
  giveActiveSubscription,
  type TestUser,
} from "../helpers/factories.js";
import { anon, errorCode, getAs, loginAs, postAs } from "../helpers/http.js";

let tenantA: string;
let ownerA: TestUser;
let adminA: TestUser;
let operadorA: TestUser;

let tenantB: string;
let ownerB: TestUser;

let superAdmin: TestUser;

before(async () => {
  const a = await createTenantWithOwner("roles-A");
  tenantA = a.tenantId;
  ownerA = a.owner;
  await giveActiveSubscription(tenantA);

  adminA = await createTestUser({ role: "ADMIN", tenantId: tenantA, label: "roles-A-admin" });
  operadorA = await createTestUser({
    role: "AGENT_OPERATOR",
    tenantId: tenantA,
    label: "roles-A-operador",
  });

  const b = await createTenantWithOwner("roles-B");
  tenantB = b.tenantId;
  ownerB = b.owner;
  await giveActiveSubscription(tenantB);

  superAdmin = await createTestUser({ role: "SUPER_ADMIN", tenantId: null, label: "roles-super" });
});

after(async () => {
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

describe("requireAuth: nada pasa sin sesión", () => {
  test("GET /api/agents sin cookie devuelve 401", async () => {
    const res = await anon().get("/api/agents");

    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), "UNAUTHENTICATED");
  });

  test("GET /api/admin/tenants sin cookie devuelve 401, no 403", async () => {
    // Importa el orden: primero se comprueba quién eres, después qué puedes.
    const res = await anon().get("/api/admin/tenants");

    assert.equal(res.status, 401);
  });
});

describe("requireRole", () => {
  test("un AGENT_OPERATOR no puede crear agentes (403)", async () => {
    const cookie = await loginAs(operadorA);
    const res = await postAs(cookie, "/api/agents", { name: "no debería crearse" });

    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), "FORBIDDEN");
  });

  test("un OWNER sí pasa el control de rol de esa misma ruta", async () => {
    const cookie = await loginAs(ownerA);
    const res = await postAs(cookie, "/api/agents", {});

    // No se afirma 200: el cuerpo va vacío a propósito, así que la validación
    // responderá 400. Lo que importa es que NO lo frenó el rol.
    assert.notEqual(res.status, 403);
    assert.notEqual(res.status, 401);
  });

  test("un ADMIN también pasa el control de rol", async () => {
    const cookie = await loginAs(adminA);
    const res = await postAs(cookie, "/api/agents", {});

    assert.notEqual(res.status, 403);
  });

  test("los roles del tenant sí pueden LEER agentes", async () => {
    for (const usuario of [ownerA, adminA, operadorA]) {
      const cookie = await loginAs(usuario);
      const res = await getAs(cookie, "/api/agents");

      assert.notEqual(res.status, 403, `${usuario.role} no pudo leer /api/agents`);
      assert.notEqual(res.status, 401, `${usuario.role} salió como no autenticado`);
    }
  });
});

describe("requireSuperAdmin: el panel de administración", () => {
  test("un OWNER NO entra al panel de administración (403)", async () => {
    const cookie = await loginAs(ownerA);
    const res = await getAs(cookie, "/api/admin/tenants");

    assert.equal(res.status, 403);
    assert.equal(errorCode(res.body), "FORBIDDEN");
  });

  test("un ADMIN de empresa tampoco: ADMIN ≠ SUPER_ADMIN", async () => {
    // Confusión clásica de nombres. ADMIN es un rol dentro de una empresa;
    // SUPER_ADMIN es el equipo de Sendwary.
    const cookie = await loginAs(adminA);
    const res = await getAs(cookie, "/api/admin/tenants");

    assert.equal(res.status, 403);
  });

  test("un SUPER_ADMIN sí entra", async () => {
    const cookie = await loginAs(superAdmin);
    const res = await getAs(cookie, "/api/admin/tenants");

    assert.equal(res.status, 200);
  });
});

describe("aislamiento entre empresas", () => {
  test("el OWNER de A no ve los agentes de B", async () => {
    // Se crea un agente en cada empresa y se comprueba que cada quien ve solo
    // el suyo. Es el invariante más importante de un SaaS multiempresa.
    const agenteB = await prisma.agent.create({
      data: {
        tenantId: tenantB,
        name: "__http_test__agente-de-B",
        status: "ACTIVE",
      },
    });

    const cookie = await loginAs(ownerA);
    const res = await getAs(cookie, "/api/agents");

    assert.equal(res.status, 200);

    const serializado = JSON.stringify(res.body);
    assert.doesNotMatch(
      serializado,
      new RegExp(agenteB.id),
      "un usuario de la empresa A recibió un agente de la empresa B"
    );
    assert.doesNotMatch(serializado, /agente-de-B/);
  });

  test("el OWNER de A no puede leer un agente de B por su id (404 o 403, nunca 200)", async () => {
    const agenteB = await prisma.agent.create({
      data: {
        tenantId: tenantB,
        name: "__http_test__agente-directo-B",
        status: "ACTIVE",
      },
    });

    const cookie = await loginAs(ownerA);
    const res = await getAs(cookie, `/api/agents/${agenteB.id}`);

    assert.notEqual(
      res.status,
      200,
      "acceso directo por id atraviesa la frontera entre empresas"
    );
  });

  test("cada OWNER ve su propia empresa en /api/auth/me", async () => {
    const cookieA = await loginAs(ownerA);
    const cookieB = await loginAs(ownerB);

    const meA = await getAs(cookieA, "/api/auth/me");
    const meB = await getAs(cookieB, "/api/auth/me");

    const tenantDe = (body: unknown) =>
      (body as { data?: { tenantId?: string }; tenantId?: string }).data?.tenantId ??
      (body as { tenantId?: string }).tenantId;

    assert.equal(tenantDe(meA.body), tenantA);
    assert.equal(tenantDe(meB.body), tenantB);
    assert.notEqual(tenantDe(meA.body), tenantDe(meB.body));
  });
});
