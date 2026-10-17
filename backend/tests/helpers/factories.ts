/**
 * Factories de datos de prueba, compartidas por las suites HTTP.
 *
 * Reglas que respetan la convención ya establecida por las suites de módulos:
 *   · Todo lo que se crea lleva el prefijo `__http_test__` y se borra al final.
 *   · Nada lee ni modifica datos preexistentes.
 *   · Los identificadores llevan un sufijo aleatorio: dos corridas simultáneas
 *     no chocan entre sí.
 *
 * El borrado se apoya en los `onDelete: Cascade` del esquema: al borrar un
 * Tenant caen sus usuarios, suscripciones, citas y conversaciones; al borrar un
 * User caen sus sesiones.
 */
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { prisma } from "../../src/config/prisma.js";

export const PREFIX = "__http_test__";

/** Contraseña única de todas las cuentas de prueba. No es un secreto real. */
export const TEST_PASSWORD = "Prueba-Local-1234";

/** Hash calculado una sola vez: bcrypt es lento a propósito. */
let cachedHash: string | null = null;
async function passwordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return cachedHash;
}

function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

export type TestUser = {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "OWNER" | "ADMIN" | "AGENT_OPERATOR" | "BILLING";
  tenantId: string | null;
  password: string;
};

/** Crea un tenant de prueba. Por defecto ACTIVE y con el correo verificado. */
export async function createTestTenant(
  label: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${PREFIX}${label}-${uniqueSuffix()}`,
      timezone: "America/Santo_Domingo",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      ...overrides,
    },
  });
  return tenant.id;
}

/**
 * Crea un usuario que puede iniciar sesión con `TEST_PASSWORD`.
 * `tenantId: null` es lo normal para SUPER_ADMIN, que no pertenece a ninguna
 * empresa.
 */
export async function createTestUser(params: {
  role: TestUser["role"];
  tenantId?: string | null;
  label?: string;
  status?: "ACTIVE" | "DISABLED";
  emailVerified?: boolean;
}): Promise<TestUser> {
  const label = params.label ?? params.role.toLowerCase();
  const email = `${PREFIX}${label}-${uniqueSuffix()}@example.test`;

  const user = await prisma.user.create({
    data: {
      email,
      name: `${PREFIX}${label}`,
      role: params.role,
      tenantId: params.tenantId ?? null,
      passwordHash: await passwordHash(),
      status: params.status ?? "ACTIVE",
      emailVerifiedAt: params.emailVerified === false ? null : new Date(),
    },
  });

  return {
    id: user.id,
    email: user.email,
    role: params.role,
    tenantId: user.tenantId,
    password: TEST_PASSWORD,
  };
}

/** Tenant + OWNER listo para usar: el caso más común. */
export async function createTenantWithOwner(
  label: string
): Promise<{ tenantId: string; owner: TestUser }> {
  const tenantId = await createTestTenant(label);
  const owner = await createTestUser({ role: "OWNER", tenantId, label: `${label}-owner` });
  return { tenantId, owner };
}

/**
 * Da al tenant un plan y una suscripción activa, para que el gate de
 * facturación no lo bloquee.
 */
export async function giveActiveSubscription(
  tenantId: string,
  planOverrides: Record<string, unknown> = {}
): Promise<{ planId: string; subscriptionId: string }> {
  const plan = await prisma.plan.create({
    data: {
      name: `${PREFIX}plan-${uniqueSuffix()}`,
      maxAgents: 5,
      maxWhatsappNumbers: 1,
      maxMonthlyConversations: 1000,
      maxMonthlyQuotes: 1000,
      maxStorageMb: 1024,
      priceMonthly: 40,
      ...planOverrides,
    },
  });

  const now = new Date();
  const inAMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await prisma.subscription.create({
    data: {
      tenantId,
      planId: plan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: inAMonth,
    },
  });

  return { planId: plan.id, subscriptionId: subscription.id };
}

/**
 * Borra todo lo creado por esta suite. Se llama en el `after()` de cada
 * archivo; es seguro llamarlo aunque algo haya fallado a mitad.
 *
 * Filtra SIEMPRE por el prefijo: nunca puede alcanzar datos que no creó.
 */
export async function cleanupTestData(): Promise<void> {
  // AgentLog guarda tenantId SIN relación (no hay cascade): lo escribe el
  // runtime de IA en las suites de conversaciones. Se borra por los tenants de
  // prueba antes de que desaparezcan.
  const testTenants = await prisma.tenant.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  if (testTenants.length > 0) {
    await prisma.agentLog.deleteMany({
      where: { tenantId: { in: testTenants.map((t) => t.id) } },
    });
  }

  // Los usuarios con tenant caen por cascade; estos son los que no lo tienen
  // (SUPER_ADMIN), así que hay que borrarlos explícitamente.
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.tenant.deleteMany({ where: { name: { startsWith: PREFIX } } });
  // Los planes no cuelgan de ningún tenant: se borran tras las suscripciones,
  // que sí cayeron con su tenant.
  await prisma.plan.deleteMany({ where: { name: { startsWith: PREFIX } } });
}
