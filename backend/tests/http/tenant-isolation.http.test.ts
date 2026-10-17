/**
 * Aislamiento entre empresas, recurso por recurso.
 *
 * Dos empresas de prueba (A y B), cada una con su OWNER y con un recurso de
 * cada tipo. Para cada módulo se comprueba lo mismo, siempre POR CONTRASTE:
 *
 *   1. El OWNER de A LEE lo suyo            → 200 (si no, la prueba no vale)
 *   2. El OWNER de A LEE lo de B por id     → nunca 200
 *   3. El OWNER de A MODIFICA lo de B       → nunca 200, y B no cambia
 *   4. El listado de A no menciona nada de B
 *
 * Sin el paso 1, un endpoint roto que respondiera 404 a todo produciría un
 * falso verde. Sin el paso 3, un GET protegido con un PUT abierto pasaría
 * desapercibido: leer y escribir se autorizan por separado.
 *
 * Comportamiento REAL del backend (verificado ejecutando): un recurso de otra
 * empresa responde **404**, no 403. Es deliberado — un 403 confirmaría que el
 * id existe. Ver `src/services/customer/customer.service.ts` §170.
 *
 * Los recursos se crean con Prisma (helpers/fixtures.ts), no por HTTP: la
 * prueba de aislamiento no puede depender de que el alta funcione.
 *
 * Ejecutar: npm run test:http:isolation
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import {
  cleanupTestData,
  createTenantWithOwner,
  giveActiveSubscription,
  PREFIX,
  type TestUser,
} from "../helpers/factories.js";
import { createTenantResources } from "../helpers/fixtures.js";
import { getAs, loginAs } from "../helpers/http.js";
import request from "supertest";
import { app } from "../../src/app.js";

type Empresa = {
  tenantId: string;
  owner: TestUser;
  cookie: string;
  planName: string;
  recursos: Awaited<ReturnType<typeof createTenantResources>>;
};

let A: Empresa;
let B: Empresa;

async function montarEmpresa(label: string): Promise<Empresa> {
  const { tenantId, owner } = await createTenantWithOwner(label);
  const { planId } = await giveActiveSubscription(tenantId);
  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { name: true } });
  const recursos = await createTenantResources(tenantId, label);
  const cookie = await loginAs(owner);
  return { tenantId, owner, cookie, planName: plan!.name, recursos };
}

/** Un cuerpo de respuesta que NO puede contener ni un rastro de la otra empresa. */
function noMenciona(body: unknown, ...agujas: string[]): void {
  const texto = JSON.stringify(body ?? {});
  for (const aguja of agujas) {
    assert.ok(!texto.includes(aguja), `la respuesta filtra "${aguja}" de la otra empresa`);
  }
}

/** Lectura cruzada: nunca 200. Se acepta 403 o 404 (el backend usa 404). */
function assertLecturaBloqueada(status: number, ruta: string): void {
  assert.notEqual(status, 200, `🚨 ${ruta} devolvió 200 con un recurso de OTRA empresa`);
  assert.ok(
    status === 403 || status === 404,
    `${ruta} respondió ${status}; se esperaba 403 o 404`
  );
}

/** Escritura cruzada: nunca 2xx. */
function assertEscrituraBloqueada(status: number, ruta: string): void {
  assert.ok(
    status < 200 || status >= 300,
    `🚨 ${ruta} aceptó una escritura sobre un recurso de OTRA empresa (${status})`
  );
  assert.ok(
    status === 403 || status === 404,
    `${ruta} respondió ${status}; se esperaba 403 o 404`
  );
}

before(async () => {
  A = await montarEmpresa("iso-a");
  B = await montarEmpresa("iso-b");
});

after(async () => {
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

describe("punto de partida: las dos empresas existen y son distintas", () => {
  test("cada OWNER ve su propia empresa en /api/auth/me", async () => {
    const meA = await getAs(A.cookie, "/api/auth/me");
    const meB = await getAs(B.cookie, "/api/auth/me");

    assert.equal(meA.body.data.tenantId, A.tenantId);
    assert.equal(meB.body.data.tenantId, B.tenantId);
    assert.notEqual(A.tenantId, B.tenantId);
  });

  test("los recursos de prueba están creados en la empresa correcta", async () => {
    const agente = await prisma.agent.findUnique({
      where: { id: B.recursos.agentId },
      select: { tenantId: true },
    });
    assert.equal(agente!.tenantId, B.tenantId, "el fixture quedó en la empresa equivocada");
  });
});

describe("agents", () => {
  test("A lee su propio agente (200)", async () => {
    const res = await getAs(A.cookie, `/api/agents/${A.recursos.agentId}`);
    assert.equal(res.status, 200, "A no puede leer lo suyo: el resto de la prueba no valdría");
  });

  test("A NO puede leer el agente de B por id", async () => {
    const res = await getAs(A.cookie, `/api/agents/${B.recursos.agentId}`);
    assertLecturaBloqueada(res.status, "GET /api/agents/:id");
  });

  test("A NO puede modificar el agente de B", async () => {
    const res = await request(app)
      .put(`/api/agents/${B.recursos.agentId}`)
      .set("Cookie", A.cookie)
      .send({ name: "secuestrado-por-A" });

    assertEscrituraBloqueada(res.status, "PUT /api/agents/:id");

    const enDb = await prisma.agent.findUnique({
      where: { id: B.recursos.agentId },
      select: { name: true },
    });
    assert.ok(enDb!.name.startsWith(`${PREFIX}agent-iso-b`), "🚨 el agente de B fue modificado");
  });

  test("A NO puede desactivar el agente de B", async () => {
    const res = await request(app)
      .delete(`/api/agents/${B.recursos.agentId}`)
      .set("Cookie", A.cookie);

    assertEscrituraBloqueada(res.status, "DELETE /api/agents/:id");

    const enDb = await prisma.agent.findUnique({
      where: { id: B.recursos.agentId },
      select: { status: true },
    });
    assert.equal(enDb!.status, "ACTIVE", "🚨 el agente de B fue desactivado desde A");
  });

  test("el listado de A no incluye agentes de B", async () => {
    const res = await getAs(A.cookie, "/api/agents");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.recursos.agentId, B.tenantId);
  });
});

describe("customers", () => {
  test("A lee su propio cliente (200)", async () => {
    const res = await getAs(A.cookie, `/api/customers/${A.recursos.customerId}`);
    assert.equal(res.status, 200);
  });

  test("A NO puede leer el cliente de B por id", async () => {
    const res = await getAs(A.cookie, `/api/customers/${B.recursos.customerId}`);
    assertLecturaBloqueada(res.status, "GET /api/customers/:id");
  });

  test("A NO puede leer el timeline del cliente de B", async () => {
    const res = await getAs(A.cookie, `/api/customers/${B.recursos.customerId}/timeline`);
    assertLecturaBloqueada(res.status, "GET /api/customers/:id/timeline");
  });

  test("A NO puede modificar el cliente de B", async () => {
    const res = await request(app)
      .patch(`/api/customers/${B.recursos.customerId}`)
      .set("Cookie", A.cookie)
      .send({ notes: "escrito-por-A" });

    assertEscrituraBloqueada(res.status, "PATCH /api/customers/:id");

    const enDb = await prisma.customer.findUnique({
      where: { id: B.recursos.customerId },
      select: { notes: true },
    });
    assert.notEqual(enDb!.notes, "escrito-por-A", "🚨 el cliente de B fue modificado desde A");
  });

  test("el listado de A no incluye clientes de B", async () => {
    const res = await getAs(A.cookie, "/api/customers");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.recursos.customerId, B.tenantId);
  });

  test("los contadores de A no cuentan clientes de B", async () => {
    const res = await getAs(A.cookie, "/api/customers/counters");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.tenantId);
  });
});

describe("conversations", () => {
  test("A lee su propia conversación (200)", async () => {
    const res = await getAs(A.cookie, `/api/conversations/${A.recursos.conversationId}`);
    assert.equal(res.status, 200);
  });

  test("A NO puede leer la conversación de B", async () => {
    const res = await getAs(A.cookie, `/api/conversations/${B.recursos.conversationId}`);
    assertLecturaBloqueada(res.status, "GET /api/conversations/:id");
  });

  test("A NO puede leer los mensajes de la conversación de B", async () => {
    const res = await getAs(A.cookie, `/api/conversations/${B.recursos.conversationId}/messages`);
    assertLecturaBloqueada(res.status, "GET /api/conversations/:id/messages");
  });

  test("A NO puede cerrar la conversación de B", async () => {
    const res = await request(app)
      .post(`/api/conversations/${B.recursos.conversationId}/close`)
      .set("Cookie", A.cookie)
      .send({});

    assertEscrituraBloqueada(res.status, "POST /api/conversations/:id/close");

    const enDb = await prisma.conversation.findUnique({
      where: { id: B.recursos.conversationId },
      select: { status: true },
    });
    assert.notEqual(enDb!.status, "CLOSED", "🚨 A cerró una conversación de B");
  });

  test("el listado de A no incluye conversaciones de B", async () => {
    const res = await getAs(A.cookie, "/api/conversations");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.recursos.conversationId, B.tenantId);
  });
});

describe("catálogo: servicios y productos", () => {
  test("A lee su propio servicio (200)", async () => {
    const res = await getAs(A.cookie, `/api/catalog/items/${A.recursos.serviceId}`);
    assert.equal(res.status, 200);
  });

  test("A NO puede leer el servicio de B", async () => {
    const res = await getAs(A.cookie, `/api/catalog/items/${B.recursos.serviceId}`);
    assertLecturaBloqueada(res.status, "GET /api/catalog/items/:id");
  });

  test("A NO puede leer el producto de B", async () => {
    const res = await getAs(A.cookie, `/api/catalog/items/${B.recursos.productId}`);
    assertLecturaBloqueada(res.status, "GET /api/catalog/items/:id (producto)");
  });

  test("A NO puede modificar el servicio de B", async () => {
    const res = await request(app)
      .put(`/api/catalog/items/${B.recursos.serviceId}`)
      .set("Cookie", A.cookie)
      .send({ name: "servicio-secuestrado", price: 1 });

    assertEscrituraBloqueada(res.status, "PUT /api/catalog/items/:id");

    const enDb = await prisma.product.findUnique({
      where: { id: B.recursos.serviceId },
      select: { name: true },
    });
    assert.ok(enDb!.name.startsWith(`${PREFIX}service-iso-b`), "🚨 el servicio de B fue modificado");
  });

  test("A NO puede borrar el servicio de B", async () => {
    const res = await request(app)
      .delete(`/api/catalog/items/${B.recursos.serviceId}`)
      .set("Cookie", A.cookie);

    assertEscrituraBloqueada(res.status, "DELETE /api/catalog/items/:id");

    const sigueVivo = await prisma.product.findUnique({ where: { id: B.recursos.serviceId } });
    assert.ok(sigueVivo, "🚨 A borró un ítem de catálogo de B");
  });

  test("el listado de A no incluye ítems de B", async () => {
    const res = await getAs(A.cookie, "/api/catalog/items");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.recursos.serviceId, B.recursos.productId, B.tenantId);
  });
});

describe("appointments", () => {
  test("A lee su propia cita (200)", async () => {
    const res = await getAs(A.cookie, `/api/appointments/${A.recursos.appointmentId}`);
    assert.equal(res.status, 200);
  });

  test("A NO puede leer la cita de B", async () => {
    const res = await getAs(A.cookie, `/api/appointments/${B.recursos.appointmentId}`);
    assertLecturaBloqueada(res.status, "GET /api/appointments/:id");
  });

  test("A NO puede cancelar la cita de B", async () => {
    const res = await request(app)
      .post(`/api/appointments/${B.recursos.appointmentId}/cancel`)
      .set("Cookie", A.cookie)
      .send({ reason: "cancelada-por-A" });

    assertEscrituraBloqueada(res.status, "POST /api/appointments/:id/cancel");

    const enDb = await prisma.appointment.findUnique({
      where: { id: B.recursos.appointmentId },
      select: { status: true },
    });
    assert.equal(enDb!.status, "PENDING", "🚨 A cambió el estado de una cita de B");
  });

  test("A NO puede reprogramar la cita de B", async () => {
    const enUnMes = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post(`/api/appointments/${B.recursos.appointmentId}/reschedule`)
      .set("Cookie", A.cookie)
      .send({ scheduledAt: enUnMes });

    assertEscrituraBloqueada(res.status, "POST /api/appointments/:id/reschedule");
  });

  test("el listado de A no incluye citas de B", async () => {
    const res = await getAs(A.cookie, "/api/appointments");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.recursos.appointmentId, B.tenantId);
  });
});

describe("integraciones de WhatsApp", () => {
  test("A ve su propia integración (200)", async () => {
    const res = await getAs(A.cookie, "/api/integrations/whatsapp");

    assert.equal(res.status, 200);
    const texto = JSON.stringify(res.body);
    assert.ok(texto.includes(A.recursos.whatsappIntegrationId), "A no ve su propia integración");
  });

  test("🔒 A NO puede pedir la integración de B con ?tenantId=", async () => {
    // `resolveTenantId` solo honra ?tenantId= si el rol es SUPER_ADMIN; para
    // cualquier otro usa el tenant de la sesión. Esto lo comprueba.
    const res = await getAs(A.cookie, `/api/integrations/whatsapp?tenantId=${B.tenantId}`);

    assert.equal(res.status, 200, "la ruta debería seguir respondiendo con lo de A");
    noMenciona(res.body, B.recursos.whatsappIntegrationId, B.tenantId);
    assert.ok(
      JSON.stringify(res.body).includes(A.recursos.whatsappIntegrationId),
      "el parámetro cambió la empresa consultada"
    );
  });

  test("el ACCESS TOKEN de Meta nunca sale en la respuesta", async () => {
    const res = await getAs(A.cookie, "/api/integrations/whatsapp");
    const texto = JSON.stringify(res.body);

    // Lo que el serializador (`toPublic`) sí puede devolver: hasToken y
    // tokenLastFour. Lo que no puede salir nunca: el token cifrado.
    assert.ok(!texto.includes("accessTokenEncrypted"), "la respuesta expone el token cifrado");
    assert.ok(texto.includes("hasToken"), "el contrato de la respuesta cambió");
  });

  test("el verifyToken del tenant sale en SU respuesta (por diseño) y nunca en la de otro", async () => {
    // COMPORTAMIENTO DOCUMENTADO AQUÍ: `verifyToken` SÍ viaja al OWNER/ADMIN de
    // su propia empresa — el cliente tiene que pegarlo en el panel de Meta al
    // configurar el webhook. Lo que sería un fallo es que apareciera el de OTRA
    // empresa; eso es lo que comprueba este caso.
    const propio = await prisma.whatsAppIntegration.findUnique({
      where: { id: A.recursos.whatsappIntegrationId },
      select: { verifyToken: true },
    });
    const ajeno = await prisma.whatsAppIntegration.findUnique({
      where: { id: B.recursos.whatsappIntegrationId },
      select: { verifyToken: true },
    });

    const res = await getAs(A.cookie, "/api/integrations/whatsapp");
    const texto = JSON.stringify(res.body);

    assert.ok(texto.includes(propio!.verifyToken), "A no recibe su propio verifyToken");
    assert.ok(!texto.includes(ajeno!.verifyToken), "🚨 A recibe el verifyToken de B");
  });

  test("el health check tampoco acepta ?tenantId= de un OWNER", async () => {
    const res = await getAs(A.cookie, `/api/integrations/whatsapp/health?tenantId=${B.tenantId}`);
    noMenciona(res.body, B.tenantId, B.recursos.whatsappIntegrationId);
  });
});

describe("datos de facturación", () => {
  test("cada empresa ve SU plan y no el de la otra", async () => {
    const resA = await getAs(A.cookie, "/api/billing/subscription");
    const resB = await getAs(B.cookie, "/api/billing/subscription");

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);

    const textoA = JSON.stringify(resA.body);
    assert.ok(textoA.includes(A.planName), "A no ve su propio plan");
    assert.ok(!textoA.includes(B.planName), "🚨 A ve el plan de B");

    const textoB = JSON.stringify(resB.body);
    assert.ok(textoB.includes(B.planName), "B no ve su propio plan");
    assert.ok(!textoB.includes(A.planName), "🚨 B ve el plan de A");
  });

  test("el estado de facturación de A no menciona a B", async () => {
    const res = await getAs(A.cookie, "/api/billing/status");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.tenantId, B.planName);
  });

  test("el consumo de A no menciona a B", async () => {
    const res = await getAs(A.cookie, "/api/billing/usage");
    assert.equal(res.status, 200);
    noMenciona(res.body, B.tenantId, B.planName);
  });
});

describe("el dashboard no mezcla empresas", () => {
  test("el resumen de A no menciona recursos de B", async () => {
    const res = await getAs(A.cookie, "/api/dashboard/summary?fresh=1");

    assert.equal(res.status, 200);
    noMenciona(
      res.body,
      B.tenantId,
      B.recursos.agentId,
      B.recursos.customerId,
      B.recursos.conversationId
    );
  });
});
