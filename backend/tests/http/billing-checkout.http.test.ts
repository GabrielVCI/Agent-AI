/**
 * POST /api/billing/create-checkout — el único punto por el que un tenant puede
 * iniciar un pago.
 *
 * Lo que aquí se protege:
 *   · Sin sesión no se crea nada.
 *   · El tenant SIEMPRE sale de la cookie, nunca del body.
 *   · Los ids de LemonSqueezy (variante, store) los pone el backend: un cliente
 *     no puede inducir qué se compra.
 *   · La API key viaja a LemonSqueezy y JAMÁS vuelve al navegador.
 *
 * La API de LemonSqueezy está interceptada (tests/helpers/lemonsqueezy.ts):
 * ninguna prueba sale a internet.
 *
 * Ejecutar: npm run test:http:checkout
 */
import "dotenv/config";
import test, { after, afterEach, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import {
  PREFIX,
  cleanupTestData,
  createTestTenant,
  createTestUser,
  type TestUser,
} from "../helpers/factories.js";
import { anon, errorCode, loginAs, postAs } from "../helpers/http.js";
import {
  checkoutCreatedResponse,
  installLemonSqueezyMock,
  lemonCalls,
  queueLemonResponse,
  resetLemonSqueezyMock,
  restoreLemonSqueezyMock,
} from "../helpers/lemonsqueezy.js";

const CHECKOUT = "/api/billing/create-checkout";

/** Variante de LemonSqueezy del plan "bueno" de estas pruebas. */
const PLAN_VARIANT_ID = "2001";

let owner: TestUser;
let ownerSinTenant: TestUser;
let tenantId: string;
let planConfiguradoId: string;
let planSinVarianteId: string;

before(async () => {
  installLemonSqueezyMock();

  tenantId = await createTestTenant("checkout");
  owner = await createTestUser({ role: "OWNER", tenantId, label: "checkout-owner" });
  ownerSinTenant = await createTestUser({
    role: "OWNER",
    tenantId: null,
    label: "checkout-sin-tenant",
  });

  const planConfigurado = await prisma.plan.create({
    data: {
      name: `${PREFIX}plan-con-variante`,
      maxAgents: 2,
      maxWhatsappNumbers: 2,
      maxMonthlyConversations: 100,
      maxMonthlyQuotes: 100,
      maxStorageMb: 100,
      priceMonthly: 60,
      lemonSqueezyVariantId: PLAN_VARIANT_ID,
      lemonSqueezyProductId: "1001",
    },
  });
  planConfiguradoId = planConfigurado.id;

  const planSinVariante = await prisma.plan.create({
    data: {
      name: `${PREFIX}plan-sin-variante`,
      maxAgents: 2,
      maxWhatsappNumbers: 2,
      maxMonthlyConversations: 100,
      maxMonthlyQuotes: 100,
      maxStorageMb: 100,
      priceMonthly: 40,
    },
  });
  planSinVarianteId = planSinVariante.id;
});

afterEach(() => {
  resetLemonSqueezyMock();
});

after(async () => {
  restoreLemonSqueezyMock();
  await cleanupTestData();
  await prisma.$disconnect();
  await closeRedis();
});

describe("acceso", () => {
  test("sin sesión: 401 y ninguna llamada a LemonSqueezy", async () => {
    const res = await anon().post(CHECKOUT).send({ planId: planConfiguradoId });
    assert.equal(res.status, 401);
    assert.equal(lemonCalls.length, 0, "no se puede tocar LemonSqueezy sin sesión");
  });

  test("usuario sin empresa: error controlado, no 500", async () => {
    const cookie = await loginAs(ownerSinTenant);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });
    assert.ok(res.status === 403 || res.status === 401, `status inesperado: ${res.status}`);
    assert.equal(res.body?.success, false);
    // Mensaje amigable, jamás "Forbidden" ni un stack.
    assert.ok(typeof res.body?.message === "string" && res.body.message.length > 0);
    assert.doesNotMatch(String(res.body.message), /forbidden|error:/i);
    assert.equal(lemonCalls.length, 0);
  });
});

describe("resolución del plan", () => {
  test("plan inexistente: 404 con mensaje amigable", async () => {
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: "plan-que-no-existe" });
    assert.equal(res.status, 404);
    assert.equal(errorCode(res.body), "RESOURCE_NOT_FOUND");
    assert.equal(lemonCalls.length, 0);
  });

  test("plan sin variante de LemonSqueezy: PLAN_NOT_CONFIGURED", async () => {
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planSinVarianteId });
    assert.equal(errorCode(res.body), "PLAN_NOT_CONFIGURED");
    assert.equal(res.status, 503);
    assert.equal(lemonCalls.length, 0, "no se llama a LS con un plan no configurado");
  });

  test("plan correcto: devuelve checkoutUrl", async () => {
    queueLemonResponse(201, checkoutCreatedResponse("https://sendwary.lemonsqueezy.com/checkout/ok"));
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    assert.equal(res.status, 200);
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.data?.checkoutUrl, "https://sendwary.lemonsqueezy.com/checkout/ok");
  });
});

describe("cómo se construye el checkout", () => {
  test("usa store y variante del backend, embed y custom_data del tenant", async () => {
    queueLemonResponse(201, checkoutCreatedResponse());
    const cookie = await loginAs(owner);
    await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    assert.equal(lemonCalls.length, 1);
    const call = lemonCalls[0];

    // Endpoint y cabeceras JSON:API obligatorias
    assert.match(call.url, /\/v1\/checkouts$/);
    assert.equal(call.method, "POST");
    assert.equal(call.accept, "application/vnd.api+json");
    assert.equal(call.contentType, "application/vnd.api+json");
    assert.match(call.authorization, /^Bearer .+/);

    const data = call.body.data as Record<string, never>;
    const attributes = data.attributes as Record<string, never>;
    const relationships = data.relationships as Record<string, never>;

    // Overlay
    assert.equal((attributes.checkout_options as Record<string, unknown>).embed, true);

    // La variante es la del PLAN, resuelta por el backend
    assert.equal(
      ((relationships.variant as Record<string, never>).data as Record<string, unknown>).id,
      PLAN_VARIANT_ID
    );
    assert.ok(((relationships.store as Record<string, never>).data as Record<string, unknown>).id);

    // custom_data: identificadores internos para correlacionar el webhook
    const custom = (attributes.checkout_data as Record<string, never>).custom as Record<
      string,
      unknown
    >;
    assert.equal(custom.tenant_id, tenantId);
    assert.equal(custom.user_id, owner.id);
    assert.equal(custom.plan_id, planConfiguradoId);

    // Prellenado con lo que ya sabemos, sin PII extra
    assert.equal((attributes.checkout_data as Record<string, never>).email, owner.email);
  });

  test("el checkout muestra el desglose de la suscripción recurrente", async () => {
    queueLemonResponse(201, checkoutCreatedResponse());
    const cookie = await loginAs(owner);
    await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    const attributes = (lemonCalls[0].body.data as Record<string, never>)
      .attributes as Record<string, never>;
    const options = attributes.checkout_options as Record<string, unknown>;

    // Que se vea que es un cobro recurrente no es decorativo: ocultarlo sería
    // cobrar una suscripción sin enseñarla como tal.
    assert.equal(options.subscription_preview, true);
    assert.equal(options.embed, true);
    assert.equal(options.desc, true);
  });

  test("el botón Continuar vuelve al panel: redirect_url sale de FRONTEND_URL", async () => {
    queueLemonResponse(201, checkoutCreatedResponse());
    const cookie = await loginAs(owner);
    await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    const attributes = (lemonCalls[0].body.data as Record<string, never>)
      .attributes as Record<string, never>;
    const redirectUrl = String(
      (attributes.product_options as Record<string, unknown>).redirect_url
    );

    // Dominio configurado, nunca escrito a mano: la misma build vale para
    // local, staging y producción.
    const esperado = `${(process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/+$/, "")}/dashboard`;
    assert.equal(redirectUrl, process.env.LEMONSQUEEZY_SUCCESS_URL ?? esperado);
  });

  test("el frontend NO puede elegir a dónde se redirige tras pagar", async () => {
    queueLemonResponse(201, checkoutCreatedResponse());
    const cookie = await loginAs(owner);
    // Un `redirectUrl` en el body es un intento de open redirect: `.strict()`
    // lo rechaza antes de llegar a LemonSqueezy.
    const res = await postAs(cookie, CHECKOUT, {
      planId: planConfiguradoId,
      redirectUrl: "https://sitio-atacante.example/cobro",
    });

    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), "VALIDATION_ERROR");
    assert.equal(lemonCalls.length, 0, "no se llega a crear el checkout");
  });

  test("la respuesta al navegador no lleva secretos", async () => {
    queueLemonResponse(201, checkoutCreatedResponse());
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    const serialized = JSON.stringify(res.body);
    assert.doesNotMatch(serialized, /test-fake-ls-key/, "la API key jamás vuelve al frontend");
    assert.doesNotMatch(serialized, /Authorization|Bearer/i);
    assert.doesNotMatch(serialized, /webhook-secret/i);
    assert.equal(res.body?.data?.storeId, undefined);
    assert.equal(res.body?.data?.variantId, undefined);
  });
});

describe("seguridad: el cliente no decide qué se compra", () => {
  test("mandar tenantId y variantId ajenos no cambia nada: la request se rechaza", async () => {
    const otroTenant = await createTestTenant("checkout-victima");
    const cookie = await loginAs(owner);

    const res = await postAs(cookie, CHECKOUT, {
      planId: planConfiguradoId,
      tenantId: otroTenant,
      variantId: "9999",
      storeId: "9999",
    });

    // El esquema es estricto: campos no permitidos ⇒ 400, nunca se ignoran
    // en silencio y NUNCA llegan a LemonSqueezy.
    assert.equal(res.status, 400);
    assert.equal(errorCode(res.body), "VALIDATION_ERROR");
    assert.equal(lemonCalls.length, 0);

    // Y por contraste: nada se creó para el tenant ajeno.
    const sub = await prisma.subscription.findUnique({ where: { tenantId: otroTenant } });
    assert.equal(sub, null);
  });

  test("solo con planCode legado el backend sigue resolviendo la variante él mismo", async () => {
    // El contrato anterior mandaba planCode; se acepta, pero el variantId lo
    // sigue poniendo el backend desde el Plan.
    const planPro = await prisma.plan.findFirst({ where: { code: "PRO", isActive: true } });
    if (!planPro?.lemonSqueezyVariantId) {
      // Sin plan PRO configurado en esta base no hay nada que comprobar aquí.
      return;
    }
    queueLemonResponse(201, checkoutCreatedResponse());
    const cookie = await loginAs(owner);
    await postAs(cookie, CHECKOUT, { planCode: "PRO" });

    const relationships = (lemonCalls[0].body.data as Record<string, never>)
      .relationships as Record<string, never>;
    assert.equal(
      ((relationships.variant as Record<string, never>).data as Record<string, unknown>).id,
      planPro.lemonSqueezyVariantId
    );
  });
});

describe("errores del proveedor", () => {
  test("API key rechazada (401 de LS): LEMON_AUTH_ERROR sin exponer la key", async () => {
    queueLemonResponse(401, { errors: [{ status: "401", detail: "Unauthenticated." }] });
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    assert.equal(errorCode(res.body), "LEMON_AUTH_ERROR");
    assert.equal(res.status, 502);
    assert.doesNotMatch(JSON.stringify(res.body), /test-fake-ls-key/);
    // El texto del proveedor no se le repite al usuario.
    assert.doesNotMatch(String(res.body?.message), /Unauthenticated/);
  });

  test("422 de LS: LEMON_VALIDATION_ERROR, sin el JSON del proveedor", async () => {
    queueLemonResponse(422, {
      errors: [{ status: "422", title: "Validation Error", detail: "variant_id is invalid" }],
    });
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    assert.equal(errorCode(res.body), "LEMON_VALIDATION_ERROR");
    assert.doesNotMatch(JSON.stringify(res.body), /variant_id is invalid/);
  });

  test("429 de LS: LEMON_RATE_LIMITED, no un 500 genérico", async () => {
    queueLemonResponse(429, { errors: [{ status: "429" }] });
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    assert.equal(errorCode(res.body), "LEMON_RATE_LIMITED");
    assert.equal(res.status, 429);
  });

  test("5xx de LS: LEMON_API_ERROR con mensaje amigable", async () => {
    queueLemonResponse(503, {});
    const cookie = await loginAs(owner);
    const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });

    assert.equal(errorCode(res.body), "LEMON_API_ERROR");
    assert.match(String(res.body?.message), /intenta nuevamente/i);
  });

  test("todos los errores comparten el mismo sobre estándar", async () => {
    // Contrato único del middleware central: success/message/error.code.
    for (const [status, body] of [
      [401, { errors: [] }],
      [422, { errors: [] }],
      [500, {}],
    ] as const) {
      queueLemonResponse(status, body);
      const cookie = await loginAs(owner);
      const res = await postAs(cookie, CHECKOUT, { planId: planConfiguradoId });
      assert.equal(res.body?.success, false);
      assert.equal(typeof res.body?.message, "string");
      assert.equal(typeof res.body?.error?.code, "string");
      assert.equal(res.body?.error?.message, res.body?.message);
      resetLemonSqueezyMock();
    }
  });
});
