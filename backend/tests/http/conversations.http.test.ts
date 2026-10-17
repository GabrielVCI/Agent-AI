/**
 * CONVERSATIONS · HUMAN INTERVENTION · AGENT INACTIVE
 *
 * Flujo real de punta a punta, sin salir a internet:
 *
 *   webhook de Meta (payload sintético) → contacto + conversación → mensaje
 *   INBOUND → runtime IA (OpenAI interceptado) → mensaje OUTBOUND → envío a
 *   Meta (interceptado) con el token de la integración del tenant.
 *
 * Los mensajes entran por el CONTROLADOR REAL del webhook
 * (`helpers/whatsapp.ts#deliverWebhook`), esperando a que termine. La ruta
 * HTTP pública se prueba aparte con espera activa, porque responde 200 a Meta
 * antes de procesar.
 *
 * Estados REALES del sistema (enum ConversationStatus de Prisma):
 *   OPEN · BOT_ACTIVE · HUMAN_ACTIVE · CLOSED
 * El equivalente de "BOT_ACTIVE" y "HUMAN_ACTIVE" del encargo existe con esos
 * mismos identificadores. Una conversación nueva nace BOT_ACTIVE.
 *
 * Remitentes REALES (enum SenderType): CUSTOMER · AGENT (la IA) · HUMAN · SYSTEM.
 *
 * Ejecutar: npm run test:http:conversations
 */
import "dotenv/config";
import test, { after, before, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { app } from "../../src/app.js";
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
import { getAs, loginAs, patchAs, postAs } from "../helpers/http.js";
import {
  installExternalMocks,
  MOCK_AI_REPLY,
  metaCalls,
  openAiCalls,
  queueAiDecision,
  resetExternalCalls,
} from "../helpers/external-mocks.js";
import {
  createConnectedIntegration,
  deliverWebhook,
  fakeMessageId,
  fakeWaId,
  inboundPayload,
} from "../helpers/whatsapp.js";

type Empresa = {
  tenantId: string;
  owner: TestUser;
  ownerCookie: string;
  phoneNumberId: string;
  accessToken: string;
  agentId: string;
};

const PROMPT_A1 = "PROMPT-AGENTE-A1-9C2E";
const PROMPT_A2 = "PROMPT-AGENTE-A2-41BD";
const PROMPT_B1 = "PROMPT-AGENTE-B1-77AA";

let A: Empresa;
let B: Empresa;
let operatorA: TestUser;
let operatorCookieA: string;
let billingCookieA: string;
let restoreMocks: () => void;

async function montarEmpresa(label: string, prompt: string, model: string): Promise<Empresa> {
  const { tenantId, owner } = await createTenantWithOwner(label);
  await giveActiveSubscription(tenantId, { maxAgents: 10 });
  const { phoneNumberId, accessToken } = await createConnectedIntegration(tenantId, label);
  const agent = await prisma.agent.create({
    data: {
      tenantId,
      name: `${PREFIX}agente-${label}`,
      status: "ACTIVE",
      systemPrompt: prompt,
      openAiModel: model,
      whatsappPhoneNumberId: phoneNumberId,
    },
  });
  return {
    tenantId,
    owner,
    ownerCookie: await loginAs(owner),
    phoneNumberId,
    accessToken,
    agentId: agent.id,
  };
}

function mensajesDe(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

async function conversacionDe(tenantId: string, waId: string) {
  return prisma.conversation.findMany({
    where: { tenantId, whatsappPhone: waId },
    orderBy: { createdAt: "asc" },
  });
}

before(async () => {
  restoreMocks = installExternalMocks();
  A = await montarEmpresa("conv-a", PROMPT_A1, "gpt-test-a1");
  B = await montarEmpresa("conv-b", PROMPT_B1, "gpt-test-b1");
  operatorA = await createTestUser({
    role: "AGENT_OPERATOR",
    tenantId: A.tenantId,
    label: "conv-a-operator",
  });
  operatorCookieA = await loginAs(operatorA);
  const billing = await createTestUser({ role: "BILLING", tenantId: A.tenantId, label: "conv-a-billing" });
  billingCookieA = await loginAs(billing);
});

beforeEach(() => resetExternalCalls());

after(async () => {
  restoreMocks();
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════════════════════════
// Hilo principal: un cliente escribe, el bot responde, un humano toma el
// control, lo devuelve. Las pruebas de este bloque van EN ORDEN y comparten
// estado: cada una parte de lo que dejó la anterior.
// ═════════════════════════════════════════════════════════════════════════════
describe("conversación de punta a punta (inbound → IA → outbound)", () => {
  const cliente = fakeWaId();
  const idPrimero = fakeMessageId();
  const idSegundo = fakeMessageId();
  let conversationId: string;

  test("primer mensaje: crea contacto y conversación BOT_ACTIVE del tenant y del agente", async () => {
    const status = await deliverWebhook({
      phoneNumberId: A.phoneNumberId,
      from: cliente,
      name: "Ana Prueba",
      id: idPrimero,
      text: "Buenas tardes, quiero información",
    });
    assert.equal(status, 200, "el webhook siempre responde 200 a Meta");

    const convs = await conversacionDe(A.tenantId, cliente);
    assert.equal(convs.length, 1, "debió crearse exactamente una conversación");
    const conv = convs[0];
    conversationId = conv.id;

    assert.equal(conv.tenantId, A.tenantId);
    assert.equal(conv.agentId, A.agentId, "la conversación no quedó ligada al agente del número");
    assert.equal(conv.status, "BOT_ACTIVE", "una conversación nueva nace BOT_ACTIVE");
    assert.equal(conv.channel, "WHATSAPP");
    assert.equal(conv.customerName, "Ana Prueba");
    assert.equal(conv.assignedToUserId, null);

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: conv.customerId } });
    assert.equal(customer.tenantId, A.tenantId);
    assert.equal(customer.phone, cliente);
    assert.equal(customer.stage, "CONTACT", "quien escribe por WhatsApp nace CONTACT, no CLIENT");
    assert.equal(customer.source, "WHATSAPP");
  });

  test("inbound y outbound quedan guardados, en orden, con dirección y remitente correctos", async () => {
    const msgs = await mensajesDe(conversationId);
    assert.equal(msgs.length, 2);

    assert.equal(msgs[0].direction, "INBOUND");
    assert.equal(msgs[0].senderType, "CUSTOMER");
    assert.equal(msgs[0].textContent, "Buenas tardes, quiero información");
    assert.equal(msgs[0].whatsappMessageId, idPrimero);
    assert.equal(msgs[0].tenantId, A.tenantId);

    assert.equal(msgs[1].direction, "OUTBOUND");
    assert.equal(msgs[1].senderType, "AGENT", "la respuesta de la IA debe ir como AGENT");
    assert.equal(msgs[1].textContent, MOCK_AI_REPLY);
    assert.equal(msgs[1].tenantId, A.tenantId);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.ok(conv.lastInboundAt, "lastInboundAt vacío");
    assert.ok(conv.lastOutboundAt, "lastOutboundAt vacío");
    assert.equal(conv.lastMessagePreview, MOCK_AI_REPLY.slice(0, 120));
  });

  test("segundo mensaje: reutiliza la conversación y la IA recibe el historial", async () => {
    await deliverWebhook({
      phoneNumberId: A.phoneNumberId,
      from: cliente,
      id: idSegundo,
      text: "¿Tienen varilla de 3/8?",
    });

    assert.equal((await conversacionDe(A.tenantId, cliente)).length, 1, "se abrió una segunda conversación");

    const msgs = await mensajesDe(conversationId);
    assert.deepEqual(
      msgs.map((m) => `${m.direction}/${m.senderType}`),
      ["INBOUND/CUSTOMER", "OUTBOUND/AGENT", "INBOUND/CUSTOMER", "OUTBOUND/AGENT"]
    );
    for (let i = 1; i < msgs.length; i++) {
      assert.ok(msgs[i].createdAt >= msgs[i - 1].createdAt, "createdAt no es monótono");
    }

    assert.equal(openAiCalls.length, 1);
    const historial = openAiCalls[0].user.conversationHistory ?? [];
    assert.ok(
      historial.some((h) => h.content === "Buenas tardes, quiero información"),
      "la IA no recibió el mensaje anterior del cliente"
    );
    assert.ok(
      historial.some((h) => h.content === MOCK_AI_REPLY && h.senderType === "AGENT"),
      "la IA no recibió su propia respuesta anterior"
    );
  });

  test("la IA se llama con el aiModel y el basePrompt del agente del número", async () => {
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Gracias" });

    assert.equal(openAiCalls.length, 1);
    assert.equal(openAiCalls[0].model, "gpt-test-a1");
    assert.ok(openAiCalls[0].system.includes(PROMPT_A1), "el basePrompt del agente no llegó");
    assert.ok(!openAiCalls[0].system.includes(PROMPT_B1), "🚨 llegó el prompt de otra empresa");
  });

  test("el envío a Meta usa el número y el token de la integración del tenant", async () => {
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Otra pregunta" });

    assert.equal(metaCalls.length, 1);
    const envio = metaCalls[0];
    assert.ok(envio.url.includes(`/${A.phoneNumberId}/messages`), `URL inesperada: ${envio.url}`);
    assert.equal(envio.to, cliente);
    assert.equal(envio.type, "text");
    assert.equal(envio.text, MOCK_AI_REPLY);
    assert.equal(envio.authorization, `Bearer ${A.accessToken}`);
    assert.notEqual(
      envio.authorization,
      `Bearer ${env.META_WHATSAPP_TOKEN}`,
      "se usó el token global de la plataforma en lugar del del tenant"
    );
  });

  test("reentrega del mismo message id (reintento de Meta) no duplica nada", async () => {
    const antes = await prisma.message.count({ where: { conversationId } });

    await deliverWebhook({
      phoneNumberId: A.phoneNumberId,
      from: cliente,
      id: idSegundo,
      text: "¿Tienen varilla de 3/8?",
    });

    assert.equal(await prisma.message.count({ where: { conversationId } }), antes);
    assert.equal(openAiCalls.length, 0, "el duplicado volvió a gastar IA");
    assert.equal(metaCalls.length, 0, "el duplicado volvió a responder al cliente");
  });

  test("GET /api/conversations lista la conversación con tenant, agente y cliente", async () => {
    const res = await getAs(A.ownerCookie, "/api/conversations?limit=100");
    assert.equal(res.status, 200);
    const fila = res.body.data.find((c: { id: string }) => c.id === conversationId);
    assert.ok(fila, "la conversación no aparece en el listado");
    assert.equal(fila.status, "BOT_ACTIVE");
    assert.equal(fila.agent.id, A.agentId);
    assert.equal(fila.customer.phone, cliente);
    assert.equal(fila.awaitingReply, false, "el bot ya respondió: no está 'por responder'");
    assert.equal(fila.lastMessage.senderType, "AGENT", "lastMessage no es el más reciente");
  });

  test("GET /:id y /:id/messages devuelven el hilo en orden cronológico", async () => {
    const uno = await getAs(A.ownerCookie, `/api/conversations/${conversationId}`);
    assert.equal(uno.status, 200);
    assert.equal(uno.body.data.tenantId, A.tenantId);
    assert.equal(uno.body.data.agent.id, A.agentId);
    assert.equal(uno.body.data.customer.phone, cliente);

    const hilo = await getAs(A.ownerCookie, `/api/conversations/${conversationId}/messages`);
    assert.equal(hilo.status, 200);
    const data = hilo.body.data as Array<{ createdAt: string; direction: string; textContent: string }>;
    assert.equal(data[0].textContent, "Buenas tardes, quiero información");
    for (let i = 1; i < data.length; i++) {
      assert.ok(
        new Date(data[i].createdAt) >= new Date(data[i - 1].createdAt),
        "el hilo no viene en orden cronológico"
      );
    }
  });

  // ── HUMAN TAKEOVER ─────────────────────────────────────────────────────────
  test("TAKEOVER: el operador toma el control → HUMAN_ACTIVE, asignada y con handoff", async () => {
    const res = await postAs(operatorCookieA, `/api/conversations/${conversationId}/takeover`, {
      reason: "cliente pide hablar con alguien",
    });
    assert.equal(res.status, 200);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.status, "HUMAN_ACTIVE");
    assert.equal(conv.assignedToUserId, operatorA.id);

    const handoff = await prisma.humanHandoff.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(handoff, "no se registró el handoff");
    assert.equal(handoff.status, "ASSIGNED");
    assert.equal(handoff.assignedTo, operatorA.id);
    assert.equal(handoff.reason, "cliente pide hablar con alguien");
  });

  test("con HUMAN_ACTIVE el bot NO responde, pero el mensaje del cliente se guarda", async () => {
    await deliverWebhook({
      phoneNumberId: A.phoneNumberId,
      from: cliente,
      text: "¿Hay alguien ahí?",
    });

    assert.equal(openAiCalls.length, 0, "🚨 el bot llamó a la IA con un humano al mando");
    assert.equal(metaCalls.length, 0, "🚨 el bot respondió al cliente con un humano al mando");

    const msgs = await mensajesDe(conversationId);
    const ultimo = msgs[msgs.length - 1];
    assert.equal(ultimo.direction, "INBOUND");
    assert.equal(ultimo.textContent, "¿Hay alguien ahí?");

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.status, "HUMAN_ACTIVE");
    assert.equal(conv.lastMessagePreview, "¿Hay alguien ahí?");

    const lista = await getAs(A.ownerCookie, "/api/conversations?awaiting=true&limit=100");
    assert.ok(
      lista.body.data.some((c: { id: string }) => c.id === conversationId),
      "la conversación no aparece como 'por responder'"
    );
  });

  test("con HUMAN_ACTIVE un mensaje no-texto se guarda sin fallback automático", async () => {
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, type: "image" });

    assert.equal(metaCalls.length, 0, "se envió el fallback automático con un humano al mando");
    const msgs = await mensajesDe(conversationId);
    assert.equal(msgs[msgs.length - 1].messageType, "IMAGE");
  });

  test("los mensajes humanos continúan: POST /reply guarda HUMAN y lo envía por Meta", async () => {
    const res = await postAs(operatorCookieA, `/api/conversations/${conversationId}/reply`, {
      message: "Hola Ana, te atiende un asesor.",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.senderType, "HUMAN");

    const msgs = await mensajesDe(conversationId);
    const ultimo = msgs[msgs.length - 1];
    assert.equal(ultimo.direction, "OUTBOUND");
    assert.equal(ultimo.senderType, "HUMAN");
    assert.equal(ultimo.textContent, "Hola Ana, te atiende un asesor.");

    assert.equal(metaCalls.length, 1);
    assert.equal(metaCalls[0].to, cliente);
    assert.equal(metaCalls[0].text, "Hola Ana, te atiende un asesor.");
    assert.equal(metaCalls[0].authorization, `Bearer ${A.accessToken}`);
    assert.equal(openAiCalls.length, 0, "la respuesta humana no debe pasar por la IA");

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.status, "HUMAN_ACTIVE", "responder no debe devolver el control al bot");
  });

  test("el humano puede seguir escribiendo varias veces seguidas", async () => {
    for (const texto of ["Te envío la cotización.", "¿Algo más?"]) {
      const res = await postAs(operatorCookieA, `/api/conversations/${conversationId}/reply`, {
        message: texto,
      });
      assert.equal(res.status, 200);
    }
    assert.equal(metaCalls.length, 2);
    const msgs = await mensajesDe(conversationId);
    assert.deepEqual(
      msgs.slice(-2).map((m) => `${m.senderType}:${m.textContent}`),
      ["HUMAN:Te envío la cotización.", "HUMAN:¿Algo más?"]
    );
  });

  test("reply con mensaje vacío → 400 y no envía nada", async () => {
    const res = await postAs(operatorCookieA, `/api/conversations/${conversationId}/reply`, {
      message: "",
    });
    assert.equal(res.status, 400);
    assert.equal(metaCalls.length, 0);
  });

  test("un usuario BILLING no puede tomar, responder ni devolver (403)", async () => {
    const base = `/api/conversations/${conversationId}`;
    assert.equal((await postAs(billingCookieA, `${base}/takeover`)).status, 403);
    assert.equal((await postAs(billingCookieA, `${base}/reply`, { message: "x" })).status, 403);
    assert.equal((await postAs(billingCookieA, `${base}/release-to-agent`)).status, 403);
    assert.equal(metaCalls.length, 0);
  });

  // ── RETORNO AL BOT ─────────────────────────────────────────────────────────
  test("RELEASE: devolver al bot → BOT_ACTIVE, sin asignado, handoffs RESOLVED", async () => {
    const res = await postAs(operatorCookieA, `/api/conversations/${conversationId}/release-to-agent`);
    assert.equal(res.status, 200);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.status, "BOT_ACTIVE");
    assert.equal(conv.assignedToUserId, null);

    const abiertos = await prisma.humanHandoff.count({
      where: { conversationId, status: { in: ["OPEN", "ASSIGNED"] } },
    });
    assert.equal(abiertos, 0, "quedaron handoffs abiertos tras devolver al bot");
  });

  test("tras el retorno, el bot vuelve a responder", async () => {
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Sigo aquí" });

    assert.equal(openAiCalls.length, 1);
    assert.equal(metaCalls.length, 1);
    assert.equal(metaCalls[0].text, MOCK_AI_REPLY);
    const msgs = await mensajesDe(conversationId);
    assert.equal(msgs[msgs.length - 1].senderType, "AGENT");
  });

  // ── ESCALAMIENTO POR LA IA ─────────────────────────────────────────────────
  test("si la IA pide humano, la conversación pasa sola a HUMAN_ACTIVE y el bot calla", async () => {
    queueAiDecision({
      intent: "HUMAN_HANDOFF",
      replyText: "Te paso con un asesor.",
      requiresHuman: true,
      actions: [{ type: "HANDOFF", payload: {} }],
      conversationIntent: "HUMAN_REQUEST",
      outcome: "NEEDS_HUMAN",
    });

    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Quiero un descuento" });
    assert.equal(openAiCalls.length, 1);
    assert.equal(metaCalls.length, 1, "el aviso de traspaso sí se envía");

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.status, "HUMAN_ACTIVE", "la petición de humano de la IA no pausó el bot");

    resetExternalCalls();
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "¿Me atienden?" });
    assert.equal(openAiCalls.length, 0, "🚨 el bot siguió respondiendo tras escalar");
    assert.equal(metaCalls.length, 0);

    // Deja el hilo como estaba para las pruebas siguientes.
    await postAs(operatorCookieA, `/api/conversations/${conversationId}/release-to-agent`);
  });

  // ── CIERRE ─────────────────────────────────────────────────────────────────
  test("CLOSED: responder da 409; el siguiente mensaje abre una conversación nueva", async () => {
    assert.equal((await postAs(operatorCookieA, `/api/conversations/${conversationId}/close`)).status, 200);

    const reply = await postAs(operatorCookieA, `/api/conversations/${conversationId}/reply`, {
      message: "¿sigues?",
    });
    assert.equal(reply.status, 409);
    assert.equal(metaCalls.length, 0);

    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Hola de nuevo" });

    const convs = await conversacionDe(A.tenantId, cliente);
    assert.equal(convs.length, 2, "tras cerrar, un mensaje nuevo debe abrir otra conversación");
    assert.equal(convs[0].status, "CLOSED", "la conversación cerrada se reabrió sola");
    assert.equal(convs[1].status, "BOT_ACTIVE");
    assert.equal(convs[1].customerId, convs[0].customerId, "debe ser el mismo contacto");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("takeover sobre una conversación cerrada la reabre en modo humano", () => {
  test("CLOSED → takeover → HUMAN_ACTIVE, y entonces sí se puede responder", async () => {
    const customerId = await createTestCustomer(A.tenantId, "conv-reopen");
    const conversationId = await createTestConversation(A.tenantId, customerId, A.agentId);
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "CLOSED" } });

    assert.equal((await postAs(operatorCookieA, `/api/conversations/${conversationId}/takeover`)).status, 200);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conv.status, "HUMAN_ACTIVE");

    const reply = await postAs(operatorCookieA, `/api/conversations/${conversationId}/reply`, {
      message: "Reabrimos tu caso.",
    });
    assert.equal(reply.status, 200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("tenant: B no lee ni opera las conversaciones de A", () => {
  let convA: string;

  before(async () => {
    const customerId = await createTestCustomer(A.tenantId, "conv-iso");
    convA = await createTestConversation(A.tenantId, customerId, A.agentId);
    await prisma.conversation.update({ where: { id: convA }, data: { status: "BOT_ACTIVE" } });
    await prisma.message.create({
      data: {
        tenantId: A.tenantId,
        conversationId: convA,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        textContent: "secreto de la empresa A",
      },
    });
  });

  test("A lee sus mensajes (200) — contraste obligatorio", async () => {
    const res = await getAs(A.ownerCookie, `/api/conversations/${convA}/messages`);
    assert.equal(res.status, 200);
    assert.ok(JSON.stringify(res.body).includes("secreto de la empresa A"));
  });

  test("B: messages, takeover, release, reply y close → 404, sin tocar nada de A", async () => {
    const base = `/api/conversations/${convA}`;
    const respuestas = [
      ["GET /messages", await getAs(B.ownerCookie, `${base}/messages`)],
      ["POST /takeover", await postAs(B.ownerCookie, `${base}/takeover`)],
      ["POST /release-to-agent", await postAs(B.ownerCookie, `${base}/release-to-agent`)],
      ["POST /reply", await postAs(B.ownerCookie, `${base}/reply`, { message: "mensaje de B" })],
      ["POST /close", await postAs(B.ownerCookie, `${base}/close`)],
    ] as const;
    for (const [ruta, res] of respuestas) {
      assert.equal(res.status, 404, `${ruta} → ${res.status}`);
      assert.ok(!JSON.stringify(res.body).includes("secreto de la empresa A"));
    }

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: convA } });
    assert.equal(conv.status, "BOT_ACTIVE", "🚨 B cambió el estado de una conversación de A");
    assert.equal(conv.assignedToUserId, null);
    assert.equal(await prisma.message.count({ where: { conversationId: convA } }), 1);
    assert.equal(await prisma.humanHandoff.count({ where: { conversationId: convA } }), 0);
    assert.equal(metaCalls.length, 0, "🚨 B envió un WhatsApp a un cliente de A");
  });

  test("el mismo cliente escribiendo al número de B crea datos SOLO en B", async () => {
    const cliente = fakeWaId();
    await deliverWebhook({ phoneNumberId: B.phoneNumberId, from: cliente, text: "Hola B" });

    assert.equal((await conversacionDe(B.tenantId, cliente)).length, 1);
    assert.equal((await conversacionDe(A.tenantId, cliente)).length, 0, "🚨 el mensaje a B cayó en A");

    assert.equal(openAiCalls.length, 1);
    assert.equal(openAiCalls[0].model, "gpt-test-b1");
    assert.ok(openAiCalls[0].system.includes(PROMPT_B1));
    assert.ok(!openAiCalls[0].system.includes(PROMPT_A1), "🚨 B usó el prompt de A");
    assert.equal(metaCalls[0].authorization, `Bearer ${B.accessToken}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
/*
 * REGRESIÓN F3 (detectada 2026-09-14, corregida 2026-09-23) — `getConversationHistory()`
 * (conversation.service.ts §157) hace `orderBy: createdAt asc` + `take: 20`:
 * devuelve los 20 mensajes MÁS ANTIGUOS. En cuanto un hilo supera 20
 * mensajes, `GET /:id/messages` deja de mostrar lo último que pasó, y la IA
 * (que usa la misma función) recibe como "historial" el principio de la
 * conversación en lugar del final.
 *
 * Corrección: se piden los últimos N en orden desc y se invierten.
 */
describe("historial largo", () => {
  test(
    "con más de 20 mensajes, GET /:id/messages incluye el último",
    async () => {
      const customerId = await createTestCustomer(A.tenantId, "conv-long");
      const conversationId = await createTestConversation(A.tenantId, customerId, A.agentId);
      const t0 = Date.now() - 60 * 60 * 1000;
      for (let i = 1; i <= 25; i++) {
        await prisma.message.create({
          data: {
            tenantId: A.tenantId,
            conversationId,
            direction: i % 2 ? "INBOUND" : "OUTBOUND",
            senderType: i % 2 ? "CUSTOMER" : "AGENT",
            textContent: `mensaje ${i}`,
            createdAt: new Date(t0 + i * 1000),
          },
        });
      }

      const res = await getAs(A.ownerCookie, `/api/conversations/${conversationId}/messages`);
      assert.equal(res.status, 200);
      const textos = (res.body.data as Array<{ textContent: string }>).map((m) => m.textContent);
      assert.ok(textos.includes("mensaje 25"), `el último mensaje no aparece (llegaron: ${textos.at(0)} … ${textos.at(-1)})`);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// AGENT INACTIVE
// ═════════════════════════════════════════════════════════════════════════════
describe("agente desactivado no procesa mensajes como agente activo", () => {
  const clienteNuevo = fakeWaId();
  const clienteExistente = fakeWaId();
  let convExistente: string;

  before(async () => {
    // Una conversación viva con el agente A1, creada mientras estaba activo.
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: clienteExistente, text: "Hola" });
    convExistente = (await conversacionDe(A.tenantId, clienteExistente))[0].id;

    // Se desactiva por la API, como lo haría el panel.
    const res = await patchAs(A.ownerCookie, `/api/agents/${A.agentId}/status`, { status: "INACTIVE" });
    assert.equal(res.status, 200);
    // A no puede tener ningún otro agente activo en este punto.
    await prisma.agent.updateMany({
      where: { tenantId: A.tenantId, id: { not: A.agentId } },
      data: { status: "DISABLED" },
    });
  });

  test("cliente nuevo al número del agente desactivado: sin IA, sin respuesta, sin conversación", async () => {
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: clienteNuevo, text: "¿Abren hoy?" });

    assert.equal(openAiCalls.length, 0, "🚨 un agente DISABLED gastó IA");
    assert.equal(metaCalls.length, 0, "🚨 un agente DISABLED respondió al cliente");
    assert.equal((await conversacionDe(A.tenantId, clienteNuevo)).length, 0);
  });

  test("conversación BOT_ACTIVE ya abierta: el agente desactivado tampoco responde", async () => {
    const antes = await prisma.message.count({ where: { conversationId: convExistente } });
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: clienteExistente, text: "¿Sigues?" });

    assert.equal(openAiCalls.length, 0, "🚨 el agente DISABLED respondió en una conversación existente");
    assert.equal(metaCalls.length, 0);
    // Comportamiento observado: el mensaje NO se guarda (ver riesgo en el reporte).
    assert.equal(await prisma.message.count({ where: { conversationId: convExistente } }), antes);
  });

  test("el humano sí puede seguir respondiendo en esa conversación", async () => {
    const res = await postAs(operatorCookieA, `/api/conversations/${convExistente}/reply`, {
      message: "Te atiendo yo mientras el asistente está apagado.",
    });
    assert.equal(res.status, 200);
    assert.equal(metaCalls.length, 1);
    assert.equal(openAiCalls.length, 0);
  });

  test("otro agente ACTIVO del tenant atiende el número; nunca el desactivado", async () => {
    await prisma.agent.create({
      data: {
        tenantId: A.tenantId,
        name: `${PREFIX}agente-a2`,
        status: "ACTIVE",
        systemPrompt: PROMPT_A2,
        openAiModel: "gpt-test-a2",
      },
    });

    const cliente = fakeWaId();
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Buenas" });

    assert.equal(openAiCalls.length, 1);
    assert.equal(openAiCalls[0].model, "gpt-test-a2", "no se usó el agente activo");
    assert.ok(openAiCalls[0].system.includes(PROMPT_A2));
    assert.ok(!openAiCalls[0].system.includes(PROMPT_A1), "🚨 se usó el prompt del agente DISABLED");

    const conv = (await conversacionDe(A.tenantId, cliente))[0];
    assert.notEqual(conv.agentId, A.agentId, "la conversación quedó a nombre del agente DISABLED");
  });

  test("al reactivarlo, el número vuelve a su agente", async () => {
    const res = await patchAs(A.ownerCookie, `/api/agents/${A.agentId}/status`, { status: "ACTIVE" });
    assert.equal(res.status, 200);

    const cliente = fakeWaId();
    await deliverWebhook({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Hola otra vez" });

    assert.equal(openAiCalls.length, 1);
    assert.equal(openAiCalls[0].model, "gpt-test-a1");
    assert.ok(openAiCalls[0].system.includes(PROMPT_A1));
    assert.equal((await conversacionDe(A.tenantId, cliente))[0].agentId, A.agentId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("ruta pública del webhook", () => {
  test("GET de verificación: token del tenant → 200 con el challenge; token falso → 403", async () => {
    const integ = await prisma.whatsAppIntegration.findUniqueOrThrow({
      where: { phoneNumberId: A.phoneNumberId },
      select: { verifyToken: true },
    });

    const ok = await request(app).get("/api/whatsapp/meta").query({
      "hub.mode": "subscribe",
      "hub.verify_token": integ.verifyToken,
      "hub.challenge": "reto-123",
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.text, "reto-123");

    const malo = await request(app).get("/api/whatsapp/meta").query({
      "hub.mode": "subscribe",
      "hub.verify_token": `${PREFIX}token-que-no-existe`,
      "hub.challenge": "reto-123",
    });
    assert.equal(malo.status, 403);
  });

  test("POST /api/whatsapp/meta responde 200 y el mensaje termina en la conversación", async () => {
    const cliente = fakeWaId();
    const res = await request(app)
      .post("/api/whatsapp/meta")
      .send(inboundPayload({ phoneNumberId: A.phoneNumberId, from: cliente, text: "Por la ruta HTTP" }));
    assert.equal(res.status, 200);

    // El controlador responde antes de procesar: espera activa, con techo.
    const limite = Date.now() + 15_000;
    let guardados = 0;
    while (Date.now() < limite) {
      guardados = await prisma.message.count({
        where: { tenantId: A.tenantId, textContent: "Por la ruta HTTP" },
      });
      if (guardados > 0 && metaCalls.length > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(guardados, 1, "el mensaje entrante no se guardó por la ruta HTTP");
    assert.equal(metaCalls.length, 1, "no hubo respuesta por la ruta HTTP");
  });
});
