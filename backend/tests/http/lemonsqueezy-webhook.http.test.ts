/**
 * POST /api/webhooks/lemon-squeezy — quién puede activar una suscripción.
 *
 * La regla que esta suite protege por encima de todo:
 *
 *   `subscription_created` NO da acceso. Solo correlaciona.
 *   `subscription_payment_success` con billing_reason=initial y status=paid
 *   es lo ÚNICO que crea y activa la Subscription local.
 *
 * Y alrededor de eso: sin firma válida no se procesa nada; un reintento no
 * ejecuta efectos dos veces; un evento del tenant A no toca al tenant B; una
 * variante que no corresponde al plan no activa nada; y el orden de llegada de
 * los dos webhooks del alta es indiferente.
 *
 * El cuerpo se manda como TEXTO ya serializado: firmar un objeto y dejar que
 * supertest lo vuelva a serializar produciría bytes distintos — que es
 * exactamente el fallo que la verificación de firma debe detectar.
 *
 * Ejecutar: npm run test:http:lswebhook
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import { getTenantBillingStatus } from "../../src/services/billing.service.js";
import {
  PREFIX,
  cleanupTestData,
  createTestTenant,
  createTestUser,
} from "../helpers/factories.js";
import { anon } from "../helpers/http.js";
import {
  installLemonSqueezyMock,
  lemonCalls,
  queueLemonResponse,
  restoreLemonSqueezyMock,
  signedWebhook,
  subscriptionPayload,
} from "../helpers/lemonsqueezy.js";
import {
  invoicePayload,
  subscriptionApiResponse,
} from "../helpers/lemonsqueezy-fixtures.js";

const WEBHOOK = "/api/webhooks/lemon-squeezy";
const LEGACY_WEBHOOK = "/api/billing/lemonsqueezy/webhook";
const SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "test-fake-ls-webhook-secret";

const VARIANT_A = "20010";
const VARIANT_B = "20020";
const PRODUCT_A = "10010";
const PRODUCT_B = "10020";

let tenantA: string;
let tenantB: string;
let tenantC: string;
let tenantD: string;
let planA: string;
let planB: string;

/** Envía un webhook firmado (o con la firma que se indique). */
async function sendWebhook(payload: unknown, options: { signature?: string; path?: string } = {}) {
  const { raw, signature } = signedWebhook(payload, SECRET);
  return anon()
    .post(options.path ?? WEBHOOK)
    .set("Content-Type", "application/json")
    .set("X-Signature", options.signature ?? signature)
    .send(raw);
}

async function subscriptionOf(tenantId: string) {
  return prisma.subscription.findUnique({ where: { tenantId } });
}

async function correlationOf(lemonSubscriptionId: string) {
  return prisma.lemonSqueezySubscriptionCorrelation.findUnique({
    where: { lemonSqueezySubscriptionId: lemonSubscriptionId },
  });
}

before(async () => {
  // Sin el doble, una consulta a la API de LemonSqueezy saldría a internet.
  installLemonSqueezyMock();

  tenantA = await createTestTenant("ls-a");
  tenantB = await createTestTenant("ls-b");
  tenantC = await createTestTenant("ls-c");
  tenantD = await createTestTenant("ls-d");
  await createTestUser({ role: "OWNER", tenantId: tenantA, label: "ls-a-owner" });
  await createTestUser({ role: "OWNER", tenantId: tenantB, label: "ls-b-owner" });

  const base = {
    maxAgents: 2,
    maxWhatsappNumbers: 2,
    maxMonthlyConversations: 100,
    maxMonthlyQuotes: 100,
    maxStorageMb: 100,
  };
  planA = (
    await prisma.plan.create({
      data: {
        ...base,
        name: `${PREFIX}ls-plan-a`,
        priceMonthly: 40,
        lemonSqueezyVariantId: VARIANT_A,
        lemonSqueezyProductId: PRODUCT_A,
      },
    })
  ).id;
  planB = (
    await prisma.plan.create({
      data: {
        ...base,
        name: `${PREFIX}ls-plan-b`,
        priceMonthly: 60,
        lemonSqueezyVariantId: VARIANT_B,
        lemonSqueezyProductId: PRODUCT_B,
      },
    })
  ).id;
});

after(async () => {
  // Ni los eventos ni las correlaciones cuelgan de un tenant: se borran por los
  // ids de LemonSqueezy usados aquí (todos empiezan por 9).
  await prisma.lemonSqueezyWebhookEvent.deleteMany({ where: { resourceId: { startsWith: "9" } } });
  await prisma.lemonSqueezySubscriptionCorrelation.deleteMany({
    where: { lemonSqueezySubscriptionId: { startsWith: "9" } },
  });
  await prisma.unmatchedBillingWebhook.deleteMany({
    where: { lemonSqueezySubscriptionId: { startsWith: "9" } },
  });
  await cleanupTestData();
  restoreLemonSqueezyMock();
  await prisma.$disconnect();
  await closeRedis();
});

describe("firma del webhook", () => {
  test("firma correcta: aceptado", async () => {
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900001",
        tenantId: tenantA,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
      })
    );
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "PROCESSED");
  });

  test("firma incorrecta: 401 y NADA se escribe", async () => {
    const before = await subscriptionOf(tenantB);
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900099",
        tenantId: tenantB,
        planId: planB,
        variantId: VARIANT_B,
        productId: PRODUCT_B,
      }),
      { signature: "a".repeat(64) }
    );
    assert.equal(res.status, 401);
    assert.equal(res.body?.error?.code, "INVALID_WEBHOOK_SIGNATURE");
    assert.deepEqual(await subscriptionOf(tenantB), before, "tenant B no debe cambiar");
    assert.equal(await correlationOf("900099"), null, "ni siquiera se correlaciona");
  });

  test("cuerpo modificado tras firmar: rechazado", async () => {
    const payload = subscriptionPayload({
      eventName: "subscription_created",
      lemonSubscriptionId: "900098",
      tenantId: tenantB,
      planId: planB,
      variantId: VARIANT_B,
      productId: PRODUCT_B,
    });
    const { signature } = signedWebhook(payload, SECRET);

    // Misma firma, cuerpo alterado: el ataque que la verificación frena.
    const tampered = JSON.stringify({
      ...payload,
      meta: { ...payload.meta, custom_data: { tenant_id: tenantA } },
    });

    const res = await anon()
      .post(WEBHOOK)
      .set("Content-Type", "application/json")
      .set("X-Signature", signature)
      .send(tampered);

    assert.equal(res.status, 401);
    assert.equal(await subscriptionOf(tenantB), null);
  });

  test("sin cabecera X-Signature: rechazado", async () => {
    const res = await anon()
      .post(WEBHOOK)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ meta: { event_name: "subscription_created" } }));
    assert.equal(res.status, 401);
  });

  test("la ruta histórica del panel de LemonSqueezy sigue funcionando", async () => {
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900001",
        tenantId: tenantA,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
        updatedAt: "2026-12-16T10:00:00.000000Z",
      }),
      { path: LEGACY_WEBHOOK }
    );
    assert.equal(res.status, 200);
  });
});

describe("subscription_created: correlaciona, NO activa", () => {
  test("guarda la correlación tenant ↔ plan ↔ suscripción de LemonSqueezy", async () => {
    const correlation = await correlationOf("900001");
    assert.ok(correlation, "la correlación debe existir");
    assert.equal(correlation.tenantId, tenantA);
    assert.equal(correlation.planId, planA);
    assert.equal(correlation.expectedVariantId, VARIANT_A);
    assert.equal(correlation.lemonSqueezyVariantId, VARIANT_A);
    assert.equal(correlation.lemonSqueezyCustomerId, "55001");
    assert.equal(correlation.lemonSqueezyOrderId, "77001");
    assert.equal(correlation.testMode, true);
    // Estado TÉCNICO de correlación: el pago todavía no está confirmado.
    assert.equal(correlation.status, "PENDING_PAYMENT");
    assert.equal(correlation.subscriptionId, null);
  });

  test("NO existe Subscription: que LS cree la suscripción no es haber pagado", async () => {
    assert.equal(await subscriptionOf(tenantA), null);
  });

  test("el paywall sigue puesto", async () => {
    const status = await getTenantBillingStatus(tenantA);
    assert.equal(status.hasActivePlan, false);
    assert.equal(status.reason, "NO_SUBSCRIPTION");
  });

  test("pero el cliente NO ve el paywall: su pago está en confirmación", async () => {
    // Esta es la diferencia entre "no ha pagado" y "pagó hace 3 segundos".
    // Sin ella, quien vuelve del checkout antes que el webhook vería otra vez
    // los planes y podría pagar dos veces.
    const status = await getTenantBillingStatus(tenantA);
    assert.equal(status.paymentConfirmationPending, true);
    assert.equal(status.accessState, "PENDING_CONFIRMATION");
  });

  test("no se consulta la API de LemonSqueezy para correlacionar", () => {
    // Correlacionar es leer custom_data y la BD: no hace falta salir a la red.
    assert.equal(
      lemonCalls.filter((c) => c.url.includes("/v1/subscriptions/")).length,
      0
    );
  });
});

describe("subscription_payment_success: el primer pago activa", () => {
  test("initial + paid: crea la Subscription y la deja ACTIVE", async () => {
    queueLemonResponse(
      200,
      subscriptionApiResponse("900001", { variantId: VARIANT_A, productId: PRODUCT_A })
    );

    const res = await sendWebhook(
      invoicePayload({ invoiceId: "900101", lemonSubscriptionId: "900001" })
    );
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "PROCESSED");

    const sub = await subscriptionOf(tenantA);
    assert.ok(sub, "ahora sí debe existir la suscripción");
    assert.equal(sub.tenantId, tenantA);
    assert.equal(sub.planId, planA);
    assert.equal(sub.status, "ACTIVE");
    assert.equal(sub.paymentStatus, "PAID");
    assert.equal(sub.billingMode, "LEMONSQUEEZY");
  });

  test("antes de activar, pregunta a LemonSqueezy por la suscripción real", () => {
    const call = lemonCalls.find((c) => c.url.includes("/v1/subscriptions/900001"));
    assert.ok(call, "debe haberse llamado GET /v1/subscriptions/:id");
    assert.equal(call.method, "GET");
    // La API key viaja en la cabecera del cliente central, nunca en la URL.
    assert.match(call.authorization, /^Bearer /);
    assert.doesNotMatch(call.url, /key|token/i);
  });

  test("guarda los identificadores de LemonSqueezy", async () => {
    const sub = await subscriptionOf(tenantA);
    assert.ok(sub);
    assert.equal(sub.lemonSqueezySubscriptionId, "900001");
    assert.equal(sub.lemonSqueezyCustomerId, "55001");
    assert.equal(sub.lemonSqueezyOrderId, "77001");
    assert.equal(sub.lemonSqueezyVariantId, VARIANT_A);
    assert.equal(sub.lemonSqueezyProductId, PRODUCT_A);
    assert.equal(sub.lemonSqueezyStoreId, "99001");
    assert.equal(sub.lemonSqueezyStatus, "active");
    assert.equal(sub.lemonSqueezyTestMode, true);
    // Marca y últimos 4 dígitos: NO son datos de tarjeta.
    assert.equal(sub.lemonSqueezyCardBrand, "visa");
    assert.equal(sub.lemonSqueezyCardLastFour, "4242");
    assert.ok(sub.lastPaymentAt, "el momento del cobro queda sellado");
  });

  test("las fechas las manda LemonSqueezy: nada de sumar 30 días", async () => {
    const sub = await subscriptionOf(tenantA);
    assert.ok(sub);
    const renews = new Date("2027-01-15T10:00:00.000Z").toISOString();
    assert.equal(sub.renewsAt?.toISOString(), renews);
    assert.equal(sub.nextBillingDate?.toISOString(), renews);
    assert.equal(sub.currentPeriodEnd.toISOString(), renews);
    // El período empieza cuando LS creó la suscripción, no cuando llegó el evento.
    assert.equal(
      sub.currentPeriodStart.toISOString(),
      new Date("2026-12-15T10:00:00.000Z").toISOString()
    );
  });

  test("la correlación queda PROCESSED y apunta a la suscripción creada", async () => {
    const correlation = await correlationOf("900001");
    const sub = await subscriptionOf(tenantA);
    assert.equal(correlation?.status, "PROCESSED");
    assert.equal(correlation?.paidInvoiceId, "900101");
    assert.equal(correlation?.subscriptionId, sub?.id);
    assert.ok(correlation?.processedAt);
  });

  test("el paywall desaparece: BillingService ve la suscripción activa", async () => {
    const status = await getTenantBillingStatus(tenantA);
    assert.equal(status.hasActivePlan, true);
    assert.equal(status.reason, "OK");
    assert.equal(status.billingMode, "LEMONSQUEEZY");
    assert.equal(status.lemonSqueezySubscriptionId, "900001");
    // Y se acabó la espera: el frontend puede entrar directo al panel.
    assert.equal(status.accessState, "ALLOWED");
    assert.equal(status.paymentConfirmationPending, false);
  });

  test("metadataJson guarda lo justo, no el webhook entero", async () => {
    const sub = await subscriptionOf(tenantA);
    const metadata = sub?.metadataJson as Record<string, unknown> | null;
    assert.ok(metadata);
    assert.equal(metadata.activatedBy, "subscription_payment_success");
    assert.equal(metadata.billingReason, "initial");
    assert.equal(metadata.invoiceId, "900101");
    // Nada de datos del comprador ni del cobro.
    assert.equal(metadata.user_email, undefined);
    assert.equal(metadata.total, undefined);
  });
});

describe("idempotencia del primer pago", () => {
  test("el MISMO evento dos veces: una sola suscripción", async () => {
    const payload = invoicePayload({ invoiceId: "900101", lemonSubscriptionId: "900001" });
    const res = await sendWebhook(payload);
    // 200 también en el duplicado: un 4xx/5xx haría que LS reintentara en bucle.
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "DUPLICATE");
    assert.equal(await prisma.subscription.count({ where: { tenantId: tenantA } }), 1);

    const event = await prisma.lemonSqueezyWebhookEvent.findFirst({
      where: { resourceId: "900101", eventName: "subscription_payment_success" },
    });
    assert.equal(event?.attemptCount, 2);
  });

  test("la MISMA factura con otro cuerpo tampoco se aplica dos veces", async () => {
    // Cuerpo distinto (otro updated_at) ⇒ pasa el dedupe por hash. La barrera
    // que queda es la factura ya consumida por la correlación.
    const res = await sendWebhook(
      invoicePayload({
        invoiceId: "900101",
        lemonSubscriptionId: "900001",
        updatedAt: "2026-12-15T11:30:00.000000Z",
      })
    );
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
    assert.equal(await prisma.subscription.count({ where: { tenantId: tenantA } }), 1);
  });
});

describe("factura que NO debe activar", () => {
  test("initial + pending: no se crea ninguna suscripción", async () => {
    await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900002",
        tenantId: tenantB,
        planId: planB,
        variantId: VARIANT_B,
        productId: PRODUCT_B,
      })
    );

    const res = await sendWebhook(
      invoicePayload({
        invoiceId: "900201",
        lemonSubscriptionId: "900002",
        status: "pending",
      })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
    assert.equal(await subscriptionOf(tenantB), null, "pendiente de cobro NO es pagado");

    const status = await getTenantBillingStatus(tenantB);
    assert.equal(status.hasActivePlan, false);

    // La correlación sigue esperando el pago.
    assert.equal((await correlationOf("900002"))?.status, "PENDING_PAYMENT");
  });

  test("renewal: se reconoce, no crea una segunda suscripción", async () => {
    const antes = await subscriptionOf(tenantA);
    assert.ok(antes);

    const res = await sendWebhook(
      invoicePayload({
        invoiceId: "900102",
        lemonSubscriptionId: "900001",
        billingReason: "renewal",
      })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
    assert.match(
      String(
        (
          await prisma.lemonSqueezyWebhookEvent.findFirst({ where: { resourceId: "900102" } })
        )?.lastError
      ),
      /billing_reason=renewal/
    );
    assert.equal(await prisma.subscription.count({ where: { tenantId: tenantA } }), 1);
  });

  test("un recurso que no es factura no se interpreta como pago", async () => {
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_payment_success",
        lemonSubscriptionId: "900001",
        tenantId: tenantA,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
        updatedAt: "2026-12-18T10:00:00.000000Z",
      })
    );
    assert.equal(res.body?.data?.outcome, "IGNORED");
  });
});

describe("carrera de webhooks: el pago llega antes que la correlación", () => {
  test("el pago sin correlación no inventa tenant: queda guardado", async () => {
    const res = await sendWebhook(
      invoicePayload({ invoiceId: "900301", lemonSubscriptionId: "900003" })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");

    const correlation = await correlationOf("900003");
    assert.ok(correlation, "el pago queda registrado para reproceso");
    assert.equal(correlation.status, "PENDING_CORRELATION");
    assert.equal(correlation.paidInvoiceId, "900301");
    assert.equal(correlation.tenantId, null, "no se adivina el tenant");
    assert.equal(await subscriptionOf(tenantC), null);
  });

  test("al llegar subscription_created se completa la activación pendiente", async () => {
    queueLemonResponse(
      200,
      subscriptionApiResponse("900003", { variantId: VARIANT_A, productId: PRODUCT_A })
    );

    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900003",
        tenantId: tenantC,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
      })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "PROCESSED");

    const sub = await subscriptionOf(tenantC);
    assert.ok(sub, "el pago ya confirmado se aplica en cuanto sabemos de quién es");
    assert.equal(sub.status, "ACTIVE");
    assert.equal(sub.paymentStatus, "PAID");
    assert.equal(sub.lemonSqueezySubscriptionId, "900003");

    assert.equal((await correlationOf("900003"))?.status, "PROCESSED");
    assert.equal((await getTenantBillingStatus(tenantC)).hasActivePlan, true);
  });
});

describe("variante manipulada", () => {
  test("custom_data declara un plan y LemonSqueezy cobró otra variante", async () => {
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900888",
        tenantId: tenantD,
        planId: planA, // custom_data dice plan A…
        variantId: VARIANT_B, // …pero LemonSqueezy cobró la variante del plan B
        productId: PRODUCT_B,
      })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "FAILED");

    const event = await prisma.lemonSqueezyWebhookEvent.findFirst({
      where: { resourceId: "900888" },
    });
    assert.equal(event?.status, "FAILED");
    assert.match(String(event?.lastError), /variante inconsistente/);
    assert.equal(await subscriptionOf(tenantD), null, "no se activa nada");
  });

  test("si la suscripción real cobra otra variante, el pago no activa", async () => {
    // Correlación legítima del plan A…
    await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900004",
        tenantId: tenantD,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
      })
    );
    // …pero LemonSqueezy dice que la suscripción real es de la variante B.
    queueLemonResponse(
      200,
      subscriptionApiResponse("900004", { variantId: VARIANT_B, productId: PRODUCT_B })
    );

    const res = await sendWebhook(
      invoicePayload({ invoiceId: "900401", lemonSubscriptionId: "900004" })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "FAILED");
    assert.equal(await subscriptionOf(tenantD), null);

    const correlation = await correlationOf("900004");
    assert.equal(correlation?.status, "INVALID");
    assert.ok(correlation?.lastError, "queda el motivo técnico para revisión");
  });
});

describe("tenant inexistente", () => {
  test("custom_data con un tenant que no existe no crea nada", async () => {
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900777",
        tenantId: "tenant-que-no-existe",
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
        email: "desconocido@example.test",
      })
    );
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
    assert.equal(await correlationOf("900777"), null);

    // Queda registrado para revisión del SUPER_ADMIN, sin tocar ningún tenant.
    const unmatched = await prisma.unmatchedBillingWebhook.findFirst({
      where: { lemonSqueezySubscriptionId: "900777" },
    });
    assert.ok(unmatched, "el evento sin tenant debe quedar registrado");
  });
});

describe("estado de acceso (lo que decide qué pantalla ve el cliente)", () => {
  test("un tenant que nunca pagó ve el paywall, no la espera", async () => {
    const tenant = await createTestTenant("ls-nuevo");
    const status = await getTenantBillingStatus(tenant);
    assert.equal(status.paymentConfirmationPending, false);
    assert.equal(status.accessState, "PAYWALL_REQUIRED");
  });

  test("una correlación INVÁLIDA no deja al cliente esperando para siempre", async () => {
    // tenantD quedó con la correlación de 900004 marcada INVALID (variante que
    // no correspondía). Eso NO es un pago en vuelo: debe volver el paywall.
    const status = await getTenantBillingStatus(tenantD);
    assert.equal(status.paymentConfirmationPending, false);
    assert.equal(status.accessState, "PAYWALL_REQUIRED");
  });
});

describe("concurrencia", () => {
  test("dos pagos iniciales simultáneos del mismo tenant: UNA suscripción", async () => {
    const tenant = await createTestTenant("ls-race");
    await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900005",
        tenantId: tenant,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
      })
    );

    // Dos facturas distintas del mismo primer cobro (el dedupe por hash no las
    // frena): lo único que impide duplicar es el UNIQUE por tenant + upsert.
    queueLemonResponse(
      200,
      subscriptionApiResponse("900005", { variantId: VARIANT_A, productId: PRODUCT_A })
    );
    queueLemonResponse(
      200,
      subscriptionApiResponse("900005", { variantId: VARIANT_A, productId: PRODUCT_A })
    );

    const [a, b] = await Promise.all([
      sendWebhook(invoicePayload({ invoiceId: "900501", lemonSubscriptionId: "900005" })),
      sendWebhook(invoicePayload({ invoiceId: "900502", lemonSubscriptionId: "900005" })),
    ]);

    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(
      await prisma.subscription.count({ where: { tenantId: tenant } }),
      1,
      "jamás dos suscripciones para el mismo tenant"
    );
    assert.equal((await getTenantBillingStatus(tenant)).hasActivePlan, true);
  });
});

describe("LemonSqueezy no responde", () => {
  test("no se activa a ciegas: se pide reintento y el pago no se pierde", async () => {
    const tenant = await createTestTenant("ls-retry");
    await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_created",
        lemonSubscriptionId: "900006",
        tenantId: tenant,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
      })
    );

    queueLemonResponse(500, { errors: [{ status: "500", title: "Server Error" }] });
    const payload = invoicePayload({ invoiceId: "900601", lemonSubscriptionId: "900006" });

    const res = await sendWebhook(payload);
    assert.equal(res.status, 503, "503 para que LemonSqueezy lo reintente");
    assert.equal(await subscriptionOf(tenant), null, "sin verificar no se activa");

    // El pago quedó sellado: la constancia de que este tenant pagó no se pierde.
    const correlation = await correlationOf("900006");
    assert.equal(correlation?.status, "PAID");
    assert.equal(correlation?.paidInvoiceId, "900601");

    // Y el reintento IDÉNTICO de LemonSqueezy sí se procesa (la clave de dedupe
    // del intento fallido se libera a propósito).
    queueLemonResponse(
      200,
      subscriptionApiResponse("900006", { variantId: VARIANT_A, productId: PRODUCT_A })
    );
    const retry = await sendWebhook(payload);
    assert.equal(retry.status, 200);
    assert.equal(retry.body?.data?.outcome, "PROCESSED");

    const sub = await subscriptionOf(tenant);
    assert.equal(sub?.status, "ACTIVE");
    assert.equal(sub?.paymentStatus, "PAID");
  });
});

describe("eventos de ciclo de vida (sobre una suscripción que ya existe)", () => {
  test("cancelled con período pagado por delante: NO corta el acceso", async () => {
    const futuro = new Date(Date.now() + 20 * 86_400_000).toISOString();

    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_updated",
        lemonSubscriptionId: "900001",
        tenantId: tenantA,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
        status: "cancelled",
        renewsAt: null,
        endsAt: futuro,
        updatedAt: "2026-12-25T10:00:00.000000Z",
      })
    );
    assert.equal(res.body?.data?.outcome, "PROCESSED");

    const sub = await subscriptionOf(tenantA);
    assert.equal(sub?.status, "CANCELLED");
    assert.equal(sub?.endsAt?.toISOString(), new Date(futuro).toISOString());
    assert.ok(sub?.cancelRequestedAt, "cancelRequestedAt debe quedar sellado");
    assert.equal(sub?.paymentStatus, "PAID", "pagó ese período");

    const status = await getTenantBillingStatus(tenantA);
    assert.equal(status.hasActivePlan, true, "cancelar no corta el acceso ya pagado");
    assert.equal(status.reason, "CANCELLED_GRACE");
  });

  test("expired: vuelve el paywall", async () => {
    await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_expired",
        lemonSubscriptionId: "900001",
        tenantId: tenantA,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
        status: "expired",
        renewsAt: null,
        endsAt: new Date(Date.now() - 86_400_000).toISOString(),
        updatedAt: "2026-12-27T10:00:00.000000Z",
      })
    );

    const sub = await subscriptionOf(tenantA);
    assert.equal(sub?.status, "EXPIRED");
    const status = await getTenantBillingStatus(tenantA);
    assert.equal(status.hasActivePlan, false);
    assert.equal(status.reason, "EXPIRED");
  });

  test("un evento de ciclo de vida NO crea la suscripción de un tenant sin pagar", async () => {
    const res = await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_updated",
        lemonSubscriptionId: "900002",
        tenantId: tenantB,
        planId: planB,
        variantId: VARIANT_B,
        productId: PRODUCT_B,
        updatedAt: "2026-12-28T12:00:00.000000Z",
      })
    );
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
    assert.equal(await subscriptionOf(tenantB), null, "sin primer pago no hay suscripción");
  });
});

describe("eventos de pago posteriores", () => {
  test("payment_failed: marca el pago vencido sin duplicar la suscripción", async () => {
    const antes = await subscriptionOf(tenantC);
    assert.ok(antes);

    await sendWebhook({
      meta: { event_name: "subscription_payment_failed", test_mode: true },
      data: {
        type: "subscription-invoices",
        id: "900701",
        attributes: {
          subscription_id: 900003,
          customer_id: 55001,
          billing_reason: "renewal",
          status: "failed",
          user_email: "cliente@example.test",
          updated_at: "2026-12-28T10:00:00.000000Z",
        },
      },
    });

    const sub = await subscriptionOf(tenantC);
    assert.ok(sub);
    assert.equal(sub.paymentStatus, "OVERDUE");
    assert.ok(sub.lastPaymentFailedAt);
    assert.equal(sub.id, antes.id);
    assert.equal(sub.planId, antes.planId);
  });

  test("payment_recovered: el pago vuelve a estar al día", async () => {
    await sendWebhook({
      meta: { event_name: "subscription_payment_recovered", test_mode: true },
      data: {
        type: "subscription-invoices",
        id: "900702",
        attributes: {
          subscription_id: 900003,
          customer_id: 55001,
          billing_reason: "renewal",
          status: "paid",
          user_email: "cliente@example.test",
          updated_at: "2026-12-29T10:00:00.000000Z",
        },
      },
    });

    const sub = await subscriptionOf(tenantC);
    assert.equal(sub?.paymentStatus, "PAID");
    assert.ok(sub?.lastPaymentAt);
  });
});

describe("multi-tenant", () => {
  test("un webhook del tenant A no puede tocar la suscripción del tenant C", async () => {
    const antes = await subscriptionOf(tenantC);
    assert.ok(antes);

    await sendWebhook(
      subscriptionPayload({
        eventName: "subscription_updated",
        lemonSubscriptionId: "900001", // la suscripción de LS del tenant A
        tenantId: tenantA,
        planId: planA,
        variantId: VARIANT_A,
        productId: PRODUCT_A,
        status: "active",
        updatedAt: "2026-12-30T10:00:00.000000Z",
      })
    );

    const despues = await subscriptionOf(tenantC);
    assert.equal(despues?.status, antes.status);
    assert.equal(despues?.planId, antes.planId);
    assert.equal(despues?.updatedAt.toISOString(), antes.updatedAt.toISOString());
  });
});

describe("eventos ajenos al entitlement", () => {
  test("order_created se ignora a propósito y responde 200", async () => {
    const res = await sendWebhook({
      meta: { event_name: "order_created", test_mode: true },
      data: { type: "orders", id: "900999", attributes: { status: "paid" } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
  });

  test("order_created NO activa ninguna suscripción", async () => {
    const tenant = await createTestTenant("ls-order");
    const res = await sendWebhook({
      meta: {
        event_name: "order_created",
        test_mode: true,
        custom_data: { tenant_id: tenant, plan_id: planA },
      },
      data: {
        type: "orders",
        id: "900998",
        attributes: { status: "paid", first_order_item: { variant_id: VARIANT_A } },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
    assert.equal(await subscriptionOf(tenant), null, "una orden no es una suscripción");
  });

  test("un evento desconocido tampoco rompe el webhook", async () => {
    const res = await sendWebhook({
      meta: { event_name: "customer_updated", test_mode: true },
      data: { type: "customers", id: "900997", attributes: { status: "subscribed" } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body?.data?.outcome, "IGNORED");
  });
});
