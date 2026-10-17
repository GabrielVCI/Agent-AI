/**
 * El invariante de SUPER_ADMIN frente a los TRES gates comerciales.
 *
 * `GET /api/billing/activation-status` es el endpoint que consulta el gate del
 * frontend para decidir qué pantalla mostrar:
 *   verificar correo · implementación · paywall · dashboard.
 *
 * Un SUPER_ADMIN no puede quedar atrapado en ninguna de las tres. La regla
 * está en `src/controllers/billing.controller.ts` (corte explícito por rol) y
 * en `src/services/billing.service.ts` (`getTenantActivationState`).
 *
 * Cada bypass se prueba POR CONTRASTE, como exige QA_RULES §8: primero el caso
 * que SÍ debe quedar bloqueado (un tenant normal en esa misma situación), luego
 * el SUPER_ADMIN. Sin el primero, un endpoint que no aplicara ningún gate
 * produciría un falso verde.
 *
 * Ejecutar: npm run test:http:gates
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import {
  cleanupTestData,
  createTestTenant,
  createTestUser,
  giveActiveSubscription,
  type TestUser,
} from "../helpers/factories.js";
import { anon, getAs, loginAs } from "../helpers/http.js";

const ACTIVATION = "/api/billing/activation-status";

type ActivationState = {
  emailVerified: boolean;
  lifecycleStatus: string | null;
  shouldShowPaywall: boolean;
  shouldShowImplementationScreen: boolean;
  hasActiveSubscription: boolean;
  reason: string;
};

async function activationFor(user: TestUser): Promise<{ status: number; data: ActivationState }> {
  const cookie = await loginAs(user);
  const res = await getAs(cookie, ACTIVATION);
  return { status: res.status, data: res.body?.data as ActivationState };
}

let superAdmin: TestUser;
let superAdminSinVerificar: TestUser;

// Tenant 1: correo SIN verificar → debe caer en el gate de verificación.
let ownerSinVerificar: TestUser;
// Tenant 2: en implementación → debe caer en la pantalla de implementación.
let ownerEnImplementacion: TestUser;
// Tenant 3: activo y SIN suscripción → debe caer en el paywall.
let ownerSinPlan: TestUser;
// Tenant 4: activo CON suscripción → debe pasar al dashboard.
let ownerConPlan: TestUser;

before(async () => {
  superAdmin = await createTestUser({ role: "SUPER_ADMIN", tenantId: null, label: "gates-sa" });
  superAdminSinVerificar = await createTestUser({
    role: "SUPER_ADMIN",
    tenantId: null,
    label: "gates-sa-nover",
    emailVerified: false,
  });

  const tSinVerificar = await createTestTenant("gates-nover", {
    lifecycleStatus: "EMAIL_PENDING",
    emailVerifiedAt: null,
  });
  ownerSinVerificar = await createTestUser({
    role: "OWNER",
    tenantId: tSinVerificar,
    label: "gates-nover-owner",
    emailVerified: false,
  });

  const tImplementacion = await createTestTenant("gates-impl", {
    lifecycleStatus: "IMPLEMENTATION_IN_PROGRESS",
  });
  ownerEnImplementacion = await createTestUser({
    role: "OWNER",
    tenantId: tImplementacion,
    label: "gates-impl-owner",
  });

  const tSinPlan = await createTestTenant("gates-paywall", { lifecycleStatus: "ACTIVE" });
  ownerSinPlan = await createTestUser({
    role: "OWNER",
    tenantId: tSinPlan,
    label: "gates-paywall-owner",
  });

  const tConPlan = await createTestTenant("gates-ok", { lifecycleStatus: "ACTIVE" });
  await giveActiveSubscription(tConPlan);
  ownerConPlan = await createTestUser({
    role: "OWNER",
    tenantId: tConPlan,
    label: "gates-ok-owner",
  });
});

after(async () => {
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

describe("el endpoint del gate existe y exige sesión", () => {
  test("sin cookie devuelve 401", async () => {
    const res = await anon().get(ACTIVATION);
    assert.equal(res.status, 401);
  });

  test("un usuario con sesión y sin empresa NO recibe 403: el gate debe poder consultarse", async () => {
    // Un recién registrado todavía no tiene tenant y el frontend necesita
    // preguntar qué pantalla mostrarle.
    const reciente = await createTestUser({ role: "OWNER", tenantId: null, label: "gates-sin-tenant" });
    const { status } = await activationFor(reciente);

    assert.equal(status, 200, "el gate bloquea a quien todavía no tiene empresa");
  });
});

describe("contraste: los tenants SÍ quedan bloqueados", () => {
  test("correo sin verificar → EMAIL_NOT_VERIFIED", async () => {
    const { status, data } = await activationFor(ownerSinVerificar);

    assert.equal(status, 200);
    assert.equal(data.emailVerified, false);
    assert.equal(data.reason, "EMAIL_NOT_VERIFIED");
  });

  test("tenant en implementación → pantalla de implementación", async () => {
    const { data } = await activationFor(ownerEnImplementacion);

    assert.equal(data.shouldShowImplementationScreen, true, "no muestra la pantalla de implementación");
    assert.equal(data.shouldShowPaywall, false, "en implementación nunca se cobra");
    assert.equal(data.reason, "IMPLEMENTATION");
  });

  test("tenant activo sin suscripción → paywall", async () => {
    const { data } = await activationFor(ownerSinPlan);

    assert.equal(data.shouldShowPaywall, true, "un tenant sin plan no ve el paywall");
    assert.equal(data.hasActiveSubscription, false);
  });

  test("tenant activo con suscripción → dashboard", async () => {
    const { data } = await activationFor(ownerConPlan);

    assert.equal(data.shouldShowPaywall, false);
    assert.equal(data.shouldShowImplementationScreen, false);
    assert.equal(data.hasActiveSubscription, true);
  });
});

describe("🔒 SUPER_ADMIN: ningún gate lo detiene", () => {
  test("responde 200 aunque no pertenezca a ninguna empresa", async () => {
    const { status, data } = await activationFor(superAdmin);

    assert.equal(status, 200);
    assert.equal(data.reason, "SUPER_ADMIN", "el gate no reconoce al SUPER_ADMIN");
  });

  test("🔒 no lo frena la VERIFICACIÓN DE CORREO", async () => {
    const { data } = await activationFor(superAdmin);
    assert.equal(data.emailVerified, true, "el SUPER_ADMIN caería en la pantalla de verificar correo");
  });

  test("🔒 sigue sin frenarlo aunque su emailVerifiedAt sea null en la base", async () => {
    const enDb = await prisma.user.findUnique({
      where: { id: superAdminSinVerificar.id },
      select: { emailVerifiedAt: true },
    });
    assert.equal(enDb!.emailVerifiedAt, null, "el fixture no quedó sin verificar: la prueba no valdría");

    const { status, data } = await activationFor(superAdminSinVerificar);

    assert.equal(status, 200);
    assert.equal(data.emailVerified, true);
    assert.equal(data.reason, "SUPER_ADMIN");
  });

  test("🔒 no lo frena la IMPLEMENTACIÓN", async () => {
    const { data } = await activationFor(superAdmin);

    assert.equal(data.shouldShowImplementationScreen, false);
    assert.equal(data.lifecycleStatus, null, "al SUPER_ADMIN no le aplica ningún lifecycle");
  });

  test("🔒 no lo frena el PAYWALL", async () => {
    const { data } = await activationFor(superAdmin);

    assert.equal(data.shouldShowPaywall, false, "🚨 el SUPER_ADMIN vería el paywall");
    assert.equal(data.hasActiveSubscription, false, "y lo hace SIN tener suscripción, que es el punto");
  });

  test("🔒 /api/auth/me lo declara verificado aunque no lo esté en la base", async () => {
    const cookie = await loginAs(superAdminSinVerificar);
    const res = await getAs(cookie, "/api/auth/me");

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, "SUPER_ADMIN");
    assert.equal(res.body.data.emailVerified, true);
  });
});

describe("el bypass es del rol, no del endpoint", () => {
  test("un OWNER no puede fingir ser SUPER_ADMIN pidiendo el mismo endpoint", async () => {
    const { data } = await activationFor(ownerSinPlan);
    assert.notEqual(data.reason, "SUPER_ADMIN");
  });

  test("un ADMIN de empresa tampoco: ADMIN ≠ SUPER_ADMIN", async () => {
    const tenantId = await createTestTenant("gates-admin", { lifecycleStatus: "ACTIVE" });
    const admin = await createTestUser({ role: "ADMIN", tenantId, label: "gates-admin-user" });

    const { data } = await activationFor(admin);

    assert.notEqual(data.reason, "SUPER_ADMIN");
    assert.equal(data.shouldShowPaywall, true, "un ADMIN sin plan debería ver el paywall");
  });
});
