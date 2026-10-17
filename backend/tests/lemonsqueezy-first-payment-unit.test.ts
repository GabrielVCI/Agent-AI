/**
 * Piezas puras del PRIMER PAGO de LemonSqueezy: lectura de la factura, lectura
 * de la suscripción e idempotencia de la correlación.
 *
 * Sin base de datos y sin red. Lo que se prueba aquí es la frontera con el
 * proveedor: que un campo ausente no se invente, que un id numérico acabe
 * siendo un string y que "ya aplicado" signifique exactamente eso.
 *
 * Cierra además la regla de frontend: ninguna pantalla puede darse por pagada
 * a sí misma. Eso se comprueba de forma ESTÁTICA sobre el código del panel.
 *
 * Ejecutar: npm run test:unit
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isInvoiceAlreadyProcessed } from "../src/services/billing/lemon-squeezy/lemonSqueezy.correlation.service.js";
import { toSubscriptionView } from "../src/services/billing/lemon-squeezy/lemonSqueezy.subscription-api.js";
import {
  INVOICE_RESOURCE_TYPE,
  lemonSubscriptionIdOf,
  readInvoice,
} from "../src/services/billing/lemon-squeezy/lemonSqueezy.types.js";
import { SUPPORTED_WEBHOOK_EVENTS } from "../src/services/billing/lemon-squeezy/lemonSqueezy.webhook.service.js";

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.resolve(BACKEND_DIR, "..", "frontend", "src");

function invoice(attributes: Record<string, unknown>, meta: Record<string, unknown> = {}) {
  return {
    meta: { event_name: "subscription_payment_success", ...meta },
    data: { type: INVOICE_RESOURCE_TYPE, id: "77", attributes },
  };
}

describe("lectura de la factura de suscripción", () => {
  test("normaliza ids numéricos a string y fechas a Date", () => {
    const view = readInvoice(
      invoice({
        subscription_id: 900001,
        customer_id: 55001,
        billing_reason: "initial",
        status: "paid",
        total: 4000,
        currency: "USD",
        created_at: "2026-12-15T10:05:00.000000Z",
        test_mode: true,
      })
    );

    assert.equal(view.invoiceId, "77");
    assert.equal(view.subscriptionId, "900001");
    assert.equal(view.customerId, "55001");
    assert.equal(view.billingReason, "initial");
    assert.equal(view.status, "paid");
    assert.equal(view.total, 4000);
    assert.equal(view.currency, "USD");
    assert.equal(view.createdAt?.toISOString(), "2026-12-15T10:05:00.000Z");
    assert.equal(view.testMode, true);
  });

  test("lo que la factura no trae queda en null, nunca se inventa", () => {
    const view = readInvoice(invoice({}));
    assert.equal(view.subscriptionId, null);
    assert.equal(view.billingReason, null, "sin billing_reason no se asume 'initial'");
    assert.equal(view.status, null, "sin status no se asume 'paid'");
    assert.equal(view.createdAt, null);
    assert.equal(view.total, null);
  });

  test("en una factura, data.id es la FACTURA y la suscripción viene aparte", () => {
    // Confundirlos guardaría el id de una factura en lemonSqueezySubscriptionId.
    const payload = invoice({ subscription_id: 900001 });
    assert.equal(readInvoice(payload).invoiceId, "77");
    assert.equal(lemonSubscriptionIdOf(payload), "900001");
  });
});

describe("lectura de la suscripción de LemonSqueezy", () => {
  test("mapea variante, producto, fechas y tarjeta sin datos sensibles", () => {
    const view = toSubscriptionView("900001", {
      store_id: 99001,
      customer_id: 55001,
      order_id: 77001,
      product_id: 1001,
      variant_id: 2001,
      status: "active",
      card_brand: "visa",
      card_last_four: "4242",
      renews_at: "2027-01-15T10:00:00.000000Z",
      created_at: "2026-12-15T10:00:00.000000Z",
      test_mode: true,
      first_subscription_item: { id: 66001, price_id: 44001, quantity: 1 },
    });

    assert.equal(view.id, "900001");
    assert.equal(view.variantId, "2001");
    assert.equal(view.productId, "1001");
    assert.equal(view.customerId, "55001");
    assert.equal(view.status, "active");
    assert.equal(view.renewsAt?.toISOString(), "2027-01-15T10:00:00.000Z");
    assert.equal(view.subscriptionItemId, "66001");
    assert.equal(view.quantity, 1);
    // Marca y últimos 4: nada más de la tarjeta existe en esta vista.
    assert.equal(view.cardBrand, "visa");
    assert.equal(view.cardLastFour, "4242");
    assert.equal(Object.keys(view).includes("cardNumber"), false);
  });

  test("una suscripción sin renovación no produce una fecha inventada", () => {
    const view = toSubscriptionView("900001", { status: "cancelled", renews_at: null });
    assert.equal(view.renewsAt, null);
    assert.equal(view.endsAt, null);
  });
});

describe("idempotencia del primer pago", () => {
  const base = {
    id: "c1",
    lemonSqueezySubscriptionId: "900001",
    status: "PROCESSED" as const,
    paidInvoiceId: "900101",
  };

  test("la misma factura sobre una correlación ya procesada no se reaplica", () => {
    assert.equal(isInvoiceAlreadyProcessed(base as never, "900101"), true);
  });

  test("otra factura de la misma suscripción sí se evalúa", () => {
    // Es el caso de una renovación: no puede confundirse con el primer cobro.
    assert.equal(isInvoiceAlreadyProcessed(base as never, "900102"), false);
  });

  test("una correlación que aún no está procesada nunca se da por aplicada", () => {
    const pendiente = { ...base, status: "PENDING_PAYMENT" as const };
    assert.equal(isInvoiceAlreadyProcessed(pendiente as never, "900101"), false);
    assert.equal(isInvoiceAlreadyProcessed(null, "900101"), false);
  });
});

describe("eventos soportados", () => {
  test("el alta tiene handlers propios y el ciclo de vida sigue cubierto", () => {
    for (const event of [
      "subscription_created",
      "subscription_payment_success",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_resumed",
      "subscription_expired",
      "subscription_paused",
      "subscription_unpaused",
      "subscription_payment_failed",
      "subscription_payment_recovered",
      "subscription_payment_refunded",
    ]) {
      assert.ok(SUPPORTED_WEBHOOK_EVENTS.includes(event), `falta el handler de ${event}`);
    }
  });
});

describe("el frontend no puede darse por pagado", () => {
  const archivos = [
    path.join(FRONTEND_SRC, "pages", "ActivatePlanPage.tsx"),
    path.join(FRONTEND_SRC, "components", "billing", "PlanCards.tsx"),
    path.join(FRONTEND_SRC, "lib", "lemonCheckout.ts"),
  ].filter((archivo) => fs.existsSync(archivo));

  test("los archivos del paywall existen (si se renombran, ajustar esta prueba)", () => {
    assert.equal(archivos.length, 3, "cambió la ubicación del paywall del panel");
  });

  test("nadie concede acceso desde un query param tipo ?payment=success", () => {
    for (const archivo of archivos) {
      const fuente = fs.readFileSync(archivo, "utf8");
      assert.doesNotMatch(
        fuente,
        /payment[_-]?(success|status)\s*[=:]/i,
        `${path.basename(archivo)} decide el pago desde la URL`
      );
    }
  });

  test("el estado de plan activo se pregunta al backend, no se deduce", () => {
    const paywall = fs.readFileSync(archivos[0], "utf8");
    // La única fuente admisible: el backend.
    assert.match(paywall, /\/api\/billing\/status/);
    // Y jamás una activación local.
    assert.doesNotMatch(paywall, /hasActivePlan\s*=\s*true/);
    assert.doesNotMatch(paywall, /setHasActivePlan\(\s*true\s*\)/);
  });

  test("el overlay de LemonSqueezy no se cierra solo al pagar", () => {
    // Cerrarlo en `Checkout.Success` destruía la pantalla de confirmación de
    // LemonSqueezy y su botón "Continuar" justo al aparecer: el cliente se
    // quedaba sin ver qué había comprado y sin su vía de vuelta al panel.
    const checkout = fs.readFileSync(path.join(FRONTEND_SRC, "lib", "lemonCheckout.ts"), "utf8");
    assert.doesNotMatch(checkout, /Url\?\.\s*Close|Url\.Close/);
  });

  test("nadie navega a mano cuando LemonSqueezy avisa del pago", () => {
    // La redirección la hace LemonSqueezy con el `redirect_url` que configuró
    // el backend. Un `window.location` nuestro en ese punto se adelantaría a
    // su pantalla de confirmación.
    const checkout = fs.readFileSync(path.join(FRONTEND_SRC, "lib", "lemonCheckout.ts"), "utf8");
    const enSuccess = checkout.slice(
      checkout.indexOf("Checkout.Success"),
      checkout.indexOf("handlerRegistered = true")
    );
    assert.doesNotMatch(enSuccess, /window\.location|navigate\(/);
  });

  test("mientras se confirma un pago, TODOS los planes quedan bloqueados", () => {
    // No basta con deshabilitar el plan comprado: pulsar otro abriría un
    // segundo checkout y el cliente pagaría dos veces. Ambas pantallas de
    // compra usan la misma bandera para deshabilitar todas sus tarjetas.
    for (const archivo of [archivos[0], archivos[1]]) {
      const fuente = fs.readFileSync(archivo, "utf8");
      assert.match(fuente, /useBillingConfirmation/, `${path.basename(archivo)} no espera al backend`);
      assert.match(
        fuente,
        /disabled=\{[^}]*comprasBloqueadas/,
        `${path.basename(archivo)} no bloquea todos los botones`
      );
    }
  });

  test("ninguna pantalla de billing guarda el pago en el navegador", () => {
    for (const archivo of archivos) {
      const fuente = fs.readFileSync(archivo, "utf8");
      assert.doesNotMatch(
        fuente,
        /(localStorage|sessionStorage)[\s\S]{0,40}(pago|payment|paid|subscription)/i,
        `${path.basename(archivo)} guarda el pago en el navegador`
      );
    }
  });
});
