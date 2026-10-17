/**
 * AGENTS — ciclo de vida completo por HTTP.
 *
 * Contrato externo (src/services/agents-crud.service.ts): el frontend habla
 * con nombres distintos a los de Prisma, y esta suite verifica AMBOS lados:
 *
 *   API                      Prisma
 *   basePrompt           →   systemPrompt
 *   aiModel              →   openAiModel
 *   whatsappNumber       →   whatsappDisplayPhone
 *   whatsappPhoneNumberId→   whatsappPhoneNumberId
 *   status ACTIVE|INACTIVE → status ACTIVE|DISABLED
 *
 * "Eliminar" (DELETE) es un SOFT DELETE: pasa a DISABLED y la fila se queda,
 * para no romper conversaciones ni cotizaciones vinculadas.
 *
 * La prueba del agente (`POST /:id/test`) usa el runtime real con OpenAI
 * interceptado (helpers/external-mocks.ts): se comprueba que el modelo
 * llamado es el `aiModel` del agente y que el `basePrompt` viaja en el
 * mensaje de sistema. Ninguna llamada sale a internet.
 *
 * Ejecutar: npm run test:http:agents
 */
import "dotenv/config";
import test, { after, before, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import { env } from "../../src/config/env.js";
import {
  cleanupTestData,
  createTenantWithOwner,
  createTestUser,
  giveActiveSubscription,
  PREFIX,
  type TestUser,
} from "../helpers/factories.js";
import { createTestConversation, createTestCustomer } from "../helpers/fixtures.js";
import {
  deleteAs,
  getAs,
  loginAs,
  patchAs,
  postAs,
  putAs,
} from "../helpers/http.js";
import {
  installExternalMocks,
  metaCalls,
  openAiCalls,
  resetExternalCalls,
} from "../helpers/external-mocks.js";
import { createConnectedIntegration, deliverWebhook, fakeWaId } from "../helpers/whatsapp.js";

type Empresa = {
  tenantId: string;
  owner: TestUser;
  cookie: string;
};

let A: Empresa;
let B: Empresa;
let operatorCookieA: string;
let restoreMocks: () => void;

async function montarEmpresa(label: string): Promise<Empresa> {
  const { tenantId, owner } = await createTenantWithOwner(label);
  // maxAgents holgado: esta suite crea varios agentes por empresa.
  await giveActiveSubscription(tenantId, { maxAgents: 50 });
  return { tenantId, owner, cookie: await loginAs(owner) };
}

/** Alta por HTTP con los campos mínimos; devuelve el id. */
async function crearAgente(cookie: string, body: Record<string, unknown> = {}): Promise<string> {
  const res = await postAs(cookie, "/api/agents", {
    name: `${PREFIX}agente-${Math.random().toString(36).slice(2, 8)}`,
    ...body,
  });
  assert.equal(res.status, 201, `alta de agente falló: ${JSON.stringify(res.body)}`);
  return res.body.data.id as string;
}

before(async () => {
  restoreMocks = installExternalMocks();
  A = await montarEmpresa("agents-a");
  B = await montarEmpresa("agents-b");
  const operator = await createTestUser({
    role: "AGENT_OPERATOR",
    tenantId: A.tenantId,
    label: "agents-a-operator",
  });
  operatorCookieA = await loginAs(operator);
});

beforeEach(() => resetExternalCalls());

after(async () => {
  restoreMocks();
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("crear agente", () => {
  test("201 con el contrato externo, y en la base con los nombres de Prisma", async () => {
    const res = await postAs(A.cookie, "/api/agents", {
      name: `${PREFIX}ventas`,
      type: "SALES",
      description: "Agente de ventas de prueba",
      basePrompt: "Eres el vendedor de prueba. Responde siempre en español.",
      tone: "cercano",
      aiModel: "gpt-test-model-create",
      whatsappNumber: "+18095550001",
      allowAudio: true,
      allowHumanIntervention: false,
    });

    assert.equal(res.status, 201);
    const dto = res.body.data;
    assert.equal(dto.status, "ACTIVE", "un agente nuevo nace ACTIVE");
    assert.equal(dto.basePrompt, "Eres el vendedor de prueba. Responde siempre en español.");
    assert.equal(dto.aiModel, "gpt-test-model-create");
    assert.equal(dto.whatsappNumber, "+18095550001");
    assert.equal(dto.allowAudio, true);
    assert.equal(dto.allowHumanIntervention, false);
    assert.ok(!("systemPrompt" in dto), "el DTO no expone nombres internos");
    assert.ok(!("tenantId" in dto), "el DTO no expone el tenantId");

    const row = await prisma.agent.findUniqueOrThrow({ where: { id: dto.id } });
    assert.equal(row.tenantId, A.tenantId);
    assert.equal(row.systemPrompt, "Eres el vendedor de prueba. Responde siempre en español.");
    assert.equal(row.openAiModel, "gpt-test-model-create");
    assert.equal(row.whatsappDisplayPhone, "+18095550001");
    assert.equal(row.allowAudioMessages, true);
    assert.equal(row.allowHumanHandoff, false);
    assert.equal(row.status, "ACTIVE");
  });

  test("sin aiModel toma OPENAI_DEFAULT_MODEL del entorno", async () => {
    const id = await crearAgente(A.cookie);
    const row = await prisma.agent.findUniqueOrThrow({ where: { id } });
    assert.equal(row.openAiModel, env.OPENAI_DEFAULT_MODEL);
  });

  test("status INACTIVE en el alta se guarda como DISABLED", async () => {
    const id = await crearAgente(A.cookie, { status: "INACTIVE" });
    const row = await prisma.agent.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "DISABLED");
  });

  test("el tenantId del payload se ignora: el agente es de la empresa de la sesión", async () => {
    const res = await postAs(A.cookie, "/api/agents", {
      name: `${PREFIX}intruso`,
      tenantId: B.tenantId,
    });
    assert.equal(res.status, 201);
    const row = await prisma.agent.findUniqueOrThrow({ where: { id: res.body.data.id } });
    assert.equal(row.tenantId, A.tenantId, "🚨 el payload fijó el tenant del agente");
  });

  test("payload inválido → 400 y no crea nada", async () => {
    const antes = await prisma.agent.count({ where: { tenantId: A.tenantId } });

    const sinNombre = await postAs(A.cookie, "/api/agents", { basePrompt: "x" });
    assert.equal(sinNombre.status, 400);
    assert.ok(sinNombre.body.errors?.name, "el error señala el campo name");

    const tipoMalo = await postAs(A.cookie, "/api/agents", { name: `${PREFIX}x`, type: "ROBOT" });
    assert.equal(tipoMalo.status, 400);

    const estadoInterno = await postAs(A.cookie, "/api/agents", {
      name: `${PREFIX}x`,
      status: "DISABLED",
    });
    assert.equal(estadoInterno.status, 400, "DISABLED es interno; la API solo acepta ACTIVE|INACTIVE");

    const despues = await prisma.agent.count({ where: { tenantId: A.tenantId } });
    assert.equal(despues, antes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("editar agente", () => {
  test("PUT cambia basePrompt, aiModel y nombre", async () => {
    const id = await crearAgente(A.cookie, { basePrompt: "prompt v1", aiModel: "gpt-v1" });

    const res = await putAs(A.cookie, `/api/agents/${id}`, {
      name: `${PREFIX}renombrado`,
      basePrompt: "prompt v2",
      aiModel: "gpt-v2",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.basePrompt, "prompt v2");
    assert.equal(res.body.data.aiModel, "gpt-v2");

    const row = await prisma.agent.findUniqueOrThrow({ where: { id } });
    assert.equal(row.systemPrompt, "prompt v2");
    assert.equal(row.openAiModel, "gpt-v2");
    assert.equal(row.name, `${PREFIX}renombrado`);
  });

  test("PUT parcial no borra lo que no se envía", async () => {
    const id = await crearAgente(A.cookie, { basePrompt: "se queda", aiModel: "gpt-keep" });

    const res = await putAs(A.cookie, `/api/agents/${id}`, { tone: "formal" });
    assert.equal(res.status, 200);

    const row = await prisma.agent.findUniqueOrThrow({ where: { id } });
    assert.equal(row.tone, "formal");
    assert.equal(row.systemPrompt, "se queda");
    assert.equal(row.openAiModel, "gpt-keep");
  });

  test("PUT con status interno (DISABLED) → 400", async () => {
    const id = await crearAgente(A.cookie);
    const res = await putAs(A.cookie, `/api/agents/${id}`, { status: "DISABLED" });
    assert.equal(res.status, 400);
  });

  test("PUT sobre un id inexistente → 404", async () => {
    const res = await putAs(A.cookie, "/api/agents/no-existe-123", { name: "x" });
    assert.equal(res.status, 404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("activar / desactivar", () => {
  test("PATCH /status INACTIVE → DISABLED en base; ACTIVE lo reactiva", async () => {
    const id = await crearAgente(A.cookie);

    const off = await patchAs(A.cookie, `/api/agents/${id}/status`, { status: "INACTIVE" });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.status, "INACTIVE");
    assert.equal((await prisma.agent.findUniqueOrThrow({ where: { id } })).status, "DISABLED");

    const on = await patchAs(A.cookie, `/api/agents/${id}/status`, { status: "ACTIVE" });
    assert.equal(on.status, 200);
    assert.equal(on.body.data.status, "ACTIVE");
    assert.equal((await prisma.agent.findUniqueOrThrow({ where: { id } })).status, "ACTIVE");
  });

  test("PATCH /status con valor inválido o vacío → 400 y no cambia", async () => {
    const id = await crearAgente(A.cookie);

    assert.equal((await patchAs(A.cookie, `/api/agents/${id}/status`, { status: "PAUSED" })).status, 400);
    assert.equal((await patchAs(A.cookie, `/api/agents/${id}/status`, {})).status, 400);
    assert.equal((await prisma.agent.findUniqueOrThrow({ where: { id } })).status, "ACTIVE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("eliminar (soft delete)", () => {
  test("DELETE desactiva: la fila sigue existiendo, DISABLED, y se sigue listando", async () => {
    const id = await crearAgente(A.cookie);

    const res = await deleteAs(A.cookie, `/api/agents/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "INACTIVE");

    const row = await prisma.agent.findUnique({ where: { id } });
    assert.ok(row, "DELETE borró la fila: se esperaba soft delete");
    assert.equal(row.status, "DISABLED");

    const uno = await getAs(A.cookie, `/api/agents/${id}`);
    assert.equal(uno.status, 200);
    assert.equal(uno.body.data.status, "INACTIVE");

    const lista = await getAs(A.cookie, "/api/agents");
    assert.ok(lista.body.data.some((a: { id: string }) => a.id === id));
  });

  test("DELETE no rompe las conversaciones vinculadas al agente", async () => {
    const id = await crearAgente(A.cookie);
    const customerId = await createTestCustomer(A.tenantId, "agents-soft");
    const conversationId = await createTestConversation(A.tenantId, customerId, id);

    assert.equal((await deleteAs(A.cookie, `/api/agents/${id}`)).status, 200);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.agentId, id, "la conversación perdió su agente");
  });

  test("DELETE dos veces es idempotente (200, sigue DISABLED)", async () => {
    const id = await crearAgente(A.cookie);
    assert.equal((await deleteAs(A.cookie, `/api/agents/${id}`)).status, 200);
    assert.equal((await deleteAs(A.cookie, `/api/agents/${id}`)).status, 200);
    assert.equal((await prisma.agent.findUniqueOrThrow({ where: { id } })).status, "DISABLED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("permisos: AGENT_OPERATOR lee pero no administra", () => {
  test("lee (200) y recibe 403 en crear, editar, cambiar estado y eliminar; nada cambia", async () => {
    const id = await crearAgente(A.cookie, { basePrompt: "intacto" });

    assert.equal((await getAs(operatorCookieA, `/api/agents/${id}`)).status, 200);
    assert.equal((await postAs(operatorCookieA, "/api/agents", { name: `${PREFIX}op` })).status, 403);
    assert.equal((await putAs(operatorCookieA, `/api/agents/${id}`, { basePrompt: "hack" })).status, 403);
    assert.equal(
      (await patchAs(operatorCookieA, `/api/agents/${id}/status`, { status: "INACTIVE" })).status,
      403
    );
    assert.equal((await deleteAs(operatorCookieA, `/api/agents/${id}`)).status, 403);

    const row = await prisma.agent.findUniqueOrThrow({ where: { id } });
    assert.equal(row.systemPrompt, "intacto");
    assert.equal(row.status, "ACTIVE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("asociar número de WhatsApp", () => {
  test("PUT guarda whatsappPhoneNumberId y whatsappNumber, y el GET los devuelve", async () => {
    const id = await crearAgente(A.cookie);
    const { phoneNumberId } = await createConnectedIntegration(A.tenantId, "agents-own");

    const res = await putAs(A.cookie, `/api/agents/${id}`, {
      whatsappPhoneNumberId: phoneNumberId,
      whatsappNumber: "+18095550000",
    });
    assert.equal(res.status, 200);

    const row = await prisma.agent.findUniqueOrThrow({ where: { id } });
    assert.equal(row.whatsappPhoneNumberId, phoneNumberId);
    assert.equal(row.whatsappDisplayPhone, "+18095550000");

    const uno = await getAs(A.cookie, `/api/agents/${id}`);
    assert.equal(uno.body.data.whatsappPhoneNumberId, phoneNumberId);
    assert.equal(uno.body.data.whatsappNumber, "+18095550000");
  });

  /*
   * REGRESIÓN F2 (detectada 2026-09-14, corregida 2026-09-23) — invariante 3 de QA_RULES §6.
   *
   * El flujo oficial (`assignAgentToWhatsApp`, whatsapp-integration.service.ts
   * §1422) exige que el número sea de una integración DEL TENANT. El PUT
   * genérico de /api/agents no valida nada: cualquier OWNER puede ponerle a
   * su agente el phoneNumberId de otra empresa, y el webhook
   * (`resolveAgentByPhoneNumberId`, whatsapp.service.ts §478) rutea por ese
   * campo SIN mirar el tenant de la integración.
   *
   * Corrección: `assertPhoneNumberBelongsToTenant` (agents-crud.service) y
   * `resolveAgentByPhoneNumberId` restringido al tenant de la integración.
   */
  test(
    "un OWNER no puede asignar a su agente el número de OTRA empresa",
    async () => {
      const { phoneNumberId: numeroDeA } = await createConnectedIntegration(A.tenantId, "agents-victim");
      const agenteDeB = await crearAgente(B.cookie);

      const res = await putAs(B.cookie, `/api/agents/${agenteDeB}`, {
        whatsappPhoneNumberId: numeroDeA,
      });

      const row = await prisma.agent.findUniqueOrThrow({ where: { id: agenteDeB } });
      assert.notEqual(
        row.whatsappPhoneNumberId,
        numeroDeA,
        `🚨 el agente de B quedó con el número de A (PUT respondió ${res.status})`
      );
      assert.ok(res.status >= 400, `🚨 PUT aceptó un número de otra empresa (${res.status})`);
    }
  );

  test(
    "los mensajes que llegan al número de A nunca se procesan en la empresa B",
    async () => {
      // Empresa víctima con su número CONNECTED y un agente activo que aún no
      // tiene el número asignado (caso soportado a propósito: el webhook usa
      // el agente activo del tenant de la integración).
      const victima = await createTenantWithOwner("agents-victim2");
      await giveActiveSubscription(victima.tenantId);
      const { phoneNumberId: numeroVictima } = await createConnectedIntegration(
        victima.tenantId,
        "agents-victim2"
      );
      await prisma.agent.create({
        data: { tenantId: victima.tenantId, name: `${PREFIX}agente-victima`, status: "ACTIVE" },
      });

      // B se asigna el número de la víctima por el PUT genérico.
      const agenteDeB = await crearAgente(B.cookie);
      await putAs(B.cookie, `/api/agents/${agenteDeB}`, { whatsappPhoneNumberId: numeroVictima });

      const cliente = fakeWaId();
      await deliverWebhook({
        phoneNumberId: numeroVictima,
        from: cliente,
        text: "Mensaje privado para la empresa víctima",
      });

      const enB = await prisma.message.count({
        where: { tenantId: B.tenantId, textContent: "Mensaje privado para la empresa víctima" },
      });
      assert.equal(enB, 0, "🚨 el mensaje de un cliente de la víctima quedó en la empresa B");

      const enVictima = await prisma.message.count({
        where: {
          tenantId: victima.tenantId,
          textContent: "Mensaje privado para la empresa víctima",
        },
      });
      assert.equal(enVictima, 1, "el mensaje no llegó a la empresa dueña del número");
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe("tenant ownership: B no toca los agentes de A", () => {
  let agenteDeA: string;

  before(async () => {
    agenteDeA = await crearAgente(A.cookie, {
      basePrompt: "prompt privado de A",
      aiModel: "gpt-a-privado",
    });
  });

  test("A lee su agente (200) — contraste obligatorio", async () => {
    assert.equal((await getAs(A.cookie, `/api/agents/${agenteDeA}`)).status, 200);
  });

  test("B: GET, PUT, PATCH /status, DELETE y POST /test → 404", async () => {
    const base = `/api/agents/${agenteDeA}`;
    const rutas = [
      ["GET", await getAs(B.cookie, base)],
      ["PUT", await putAs(B.cookie, base, { basePrompt: "robado", name: "hack" })],
      ["PATCH /status", await patchAs(B.cookie, `${base}/status`, { status: "INACTIVE" })],
      ["DELETE", await deleteAs(B.cookie, base)],
      ["POST /test", await postAs(B.cookie, `${base}/test`, { message: "hola" })],
    ] as const;
    for (const [ruta, res] of rutas) {
      assert.equal(res.status, 404, `${ruta} → ${res.status}`);
      assert.ok(!JSON.stringify(res.body).includes("prompt privado de A"));
    }
    assert.equal(openAiCalls.length, 0, "la prueba cruzada llegó a gastar IA");
  });

  test("tras los intentos de B, el agente de A sigue exactamente igual", async () => {
    const row = await prisma.agent.findUniqueOrThrow({ where: { id: agenteDeA } });
    assert.equal(row.tenantId, A.tenantId);
    assert.equal(row.systemPrompt, "prompt privado de A");
    assert.equal(row.openAiModel, "gpt-a-privado");
    assert.equal(row.status, "ACTIVE");
    assert.ok(!row.name.includes("hack"));
  });

  test("el listado de B no menciona el agente ni el prompt de A", async () => {
    const res = await getAs(B.cookie, "/api/agents");
    assert.equal(res.status, 200);
    const texto = JSON.stringify(res.body);
    assert.ok(!texto.includes(agenteDeA));
    assert.ok(!texto.includes("prompt privado de A"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("prueba del agente (POST /:id/test, dry-run con OpenAI simulado)", () => {
  test("llama al modelo del agente con su basePrompt y no persiste conversación", async () => {
    const id = await crearAgente(A.cookie, {
      basePrompt: "PROMPT-UNICO-DE-PRUEBA-7F3A",
      aiModel: "gpt-test-dryrun",
    });
    const convAntes = await prisma.conversation.count({ where: { tenantId: A.tenantId } });
    const msgAntes = await prisma.message.count({ where: { tenantId: A.tenantId } });

    const res = await postAs(A.cookie, `/api/agents/${id}/test`, {
      message: "¿Tienen cemento gris?",
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.model, "gpt-test-dryrun");
    assert.equal(openAiCalls.length, 1);
    assert.equal(openAiCalls[0].model, "gpt-test-dryrun", "no se usó el aiModel del agente");
    assert.ok(
      openAiCalls[0].system.includes("PROMPT-UNICO-DE-PRUEBA-7F3A"),
      "el basePrompt no llegó al mensaje de sistema"
    );
    assert.equal(openAiCalls[0].user.currentMessage, "¿Tienen cemento gris?");
    assert.equal(metaCalls.length, 0, "la prueba del panel envió algo por WhatsApp");

    assert.equal(await prisma.conversation.count({ where: { tenantId: A.tenantId } }), convAntes);
    assert.equal(await prisma.message.count({ where: { tenantId: A.tenantId } }), msgAntes);
  });

  test("mensaje vacío → 400 sin llamar a la IA", async () => {
    const id = await crearAgente(A.cookie);
    const res = await postAs(A.cookie, `/api/agents/${id}/test`, { message: "" });
    assert.equal(res.status, 400);
    assert.equal(openAiCalls.length, 0);
  });
});
