/**
 * Piezas puras de la integración con LemonSqueezy: mapeo de estados, firma de
 * webhooks, clave de idempotencia y traducción de errores del proveedor.
 *
 * Sin base de datos y sin red: todo lo que se prueba aquí son funciones.
 *
 * Ejecutar: npm run test:unit
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  mapLemonSubscriptionStatus,
  paymentStatusForLemonStatus,
} from "../src/services/billing/lemon-squeezy/lemonSqueezy.status-map.js";
import {
  signPayload,
  verifyWebhookSignature,
} from "../src/services/billing/lemon-squeezy/lemonSqueezy.webhook-signature.service.js";
import {
  buildDedupeKey,
  hashRawBody,
  SUPPORTED_WEBHOOK_EVENTS,
} from "../src/services/billing/lemon-squeezy/lemonSqueezy.webhook.service.js";
import {
  extractProviderHints,
  mapLemonSqueezyError,
} from "../src/services/billing/lemon-squeezy/lemonSqueezy.errors.js";

const SECRET = "test-fake-ls-webhook-secret";

describe("mapeo de estados de LemonSqueezy", () => {
  test("cada estado de LS tiene un estado Sendwary definido", () => {
    // La tabla completa, tal como está documentada en lemonSqueezy.status-map.
    assert.equal(mapLemonSubscriptionStatus("on_trial"), "TRIALING");
    assert.equal(mapLemonSubscriptionStatus("active"), "ACTIVE");
    assert.equal(mapLemonSubscriptionStatus("paused"), "PAST_DUE");
    assert.equal(mapLemonSubscriptionStatus("past_due"), "PAST_DUE");
    assert.equal(mapLemonSubscriptionStatus("unpaid"), "PAST_DUE");
    assert.equal(mapLemonSubscriptionStatus("cancelled"), "CANCELLED");
    assert.equal(mapLemonSubscriptionStatus("expired"), "EXPIRED");
  });

  test("un estado desconocido no se inventa: devuelve null", () => {
    // Importa: null significa "no toques el status que ya hay en la BD".
    assert.equal(mapLemonSubscriptionStatus("something_new"), null);
    assert.equal(mapLemonSubscriptionStatus(undefined), null);
  });

  test("paymentStatus y status son conceptos separados", () => {
    // Cancelada pero pagada hasta ends_at: el pago SÍ está al día.
    assert.equal(mapLemonSubscriptionStatus("cancelled"), "CANCELLED");
    assert.equal(paymentStatusForLemonStatus("cancelled"), "PAID");

    assert.equal(paymentStatusForLemonStatus("active"), "PAID");
    assert.equal(paymentStatusForLemonStatus("past_due"), "OVERDUE");
    assert.equal(paymentStatusForLemonStatus("unpaid"), "OVERDUE");
    assert.equal(paymentStatusForLemonStatus("on_trial"), "NOT_REQUIRED");
    // `paused` no dice nada del pago: no se pisa lo que hubiera.
    assert.equal(paymentStatusForLemonStatus("paused"), null);
  });
});

describe("firma del webhook (HMAC-SHA256 sobre el cuerpo crudo)", () => {
  const body = Buffer.from(JSON.stringify({ meta: { event_name: "subscription_created" } }));

  test("firma correcta: aceptada", () => {
    const signature = signPayload(body, SECRET);
    assert.deepEqual(verifyWebhookSignature(body, signature, SECRET), { valid: true });
  });

  test("firma incorrecta: rechazada", () => {
    const wrong = signPayload(body, "otro-secreto");
    const result = verifyWebhookSignature(body, wrong, SECRET);
    assert.equal(result.valid, false);
  });

  test("cuerpo modificado con la firma original: rechazado", () => {
    // Este es el ataque que la verificación existe para frenar.
    const signature = signPayload(body, SECRET);
    const tampered = Buffer.from(JSON.stringify({ meta: { event_name: "subscription_created" }, hack: true }));
    const result = verifyWebhookSignature(tampered, signature, SECRET);
    assert.equal(result.valid, false);
  });

  test("sin firma o sin cuerpo crudo: rechazado, nunca lanza", () => {
    assert.deepEqual(verifyWebhookSignature(body, undefined, SECRET), {
      valid: false,
      reason: "NO_SIGNATURE",
    });
    assert.deepEqual(verifyWebhookSignature(undefined, "abc", SECRET), {
      valid: false,
      reason: "NO_RAW_BODY",
    });
  });

  test("una firma de longitud distinta no revienta timingSafeEqual", () => {
    // timingSafeEqual LANZA si los buffers miden distinto: la comprobación de
    // longitud previa es parte del contrato, no un detalle.
    const result = verifyWebhookSignature(body, "corta", SECRET);
    assert.equal(result.valid, false);
    assert.equal(result.reason, "MISMATCH");
  });
});

describe("idempotencia", () => {
  test("el mismo cuerpo produce la misma clave", () => {
    const raw = JSON.stringify({ a: 1 });
    const key = () =>
      buildDedupeKey({
        eventName: "subscription_created",
        resourceType: "subscriptions",
        resourceId: "1",
        payloadHash: hashRawBody(raw),
      });
    assert.equal(key(), key());
  });

  test("un cuerpo distinto produce una clave distinta", () => {
    const base = {
      eventName: "subscription_updated",
      resourceType: "subscriptions",
      resourceId: "1",
    };
    const a = buildDedupeKey({ ...base, payloadHash: hashRawBody(JSON.stringify({ updated_at: "1" })) });
    const b = buildDedupeKey({ ...base, payloadHash: hashRawBody(JSON.stringify({ updated_at: "2" })) });
    assert.notEqual(a, b);
  });

  test("el mismo cuerpo bajo otro evento NO se considera duplicado", () => {
    const hash = hashRawBody("x");
    const a = buildDedupeKey({
      eventName: "subscription_created",
      resourceType: "subscriptions",
      resourceId: "1",
      payloadHash: hash,
    });
    const b = buildDedupeKey({
      eventName: "subscription_updated",
      resourceType: "subscriptions",
      resourceId: "1",
      payloadHash: hash,
    });
    assert.notEqual(a, b);
  });
});

describe("eventos soportados", () => {
  test("están los del ciclo de vida y los de pago exigidos", () => {
    for (const event of [
      "subscription_created",
      "subscription_updated",
      "subscription_cancelled",
      "subscription_resumed",
      "subscription_expired",
      "subscription_paused",
      "subscription_unpaused",
      "subscription_payment_success",
      "subscription_payment_failed",
      "subscription_payment_recovered",
      "subscription_payment_refunded",
    ]) {
      assert.ok(
        SUPPORTED_WEBHOOK_EVENTS.includes(event),
        `falta el handler de ${event}`
      );
    }
  });
});

describe("traducción de errores de LemonSqueezy", () => {
  const base = { operation: "createCheckout", path: "/v1/checkouts" };

  test("cada familia de status tiene su código estable", () => {
    assert.equal(mapLemonSqueezyError({ ...base, status: 401 }).code, "LEMON_AUTH_ERROR");
    assert.equal(mapLemonSqueezyError({ ...base, status: 403 }).code, "LEMON_AUTH_ERROR");
    assert.equal(
      mapLemonSqueezyError({ ...base, status: 404 }).code,
      "LEMON_CONFIGURATION_ERROR"
    );
    assert.equal(mapLemonSqueezyError({ ...base, status: 422 }).code, "LEMON_VALIDATION_ERROR");
    assert.equal(mapLemonSqueezyError({ ...base, status: 429 }).code, "LEMON_RATE_LIMITED");
    assert.equal(mapLemonSqueezyError({ ...base, status: 500 }).code, "LEMON_API_ERROR");
    assert.equal(mapLemonSqueezyError({ ...base, status: 503 }).code, "LEMON_API_ERROR");
  });

  test("un 429 no se disfraza de error genérico", () => {
    const error = mapLemonSqueezyError({ ...base, status: 429 });
    assert.equal(error.statusCode, 429);
  });

  test("timeout y red sin respuesta: error temporal del proveedor", () => {
    assert.equal(mapLemonSqueezyError({ ...base, transport: "timeout" }).code, "LEMON_API_ERROR");
    assert.equal(mapLemonSqueezyError({ ...base, transport: "network" }).code, "LEMON_API_ERROR");
  });

  test("el mensaje al usuario nunca repite el texto del proveedor", () => {
    const error = mapLemonSqueezyError({
      ...base,
      status: 422,
      providerHints: ["variant_id: The selected variant id is invalid."],
    });
    // Lo técnico va al log…
    assert.match(String(error.internalMessage), /variant id is invalid/);
    // …y al cliente solo le llega el mensaje amigable en español.
    assert.doesNotMatch(error.userMessage, /variant/i);
    assert.match(error.userMessage, /pago/i);
  });

  test("extractProviderHints recorta y no arrastra el objeto completo", () => {
    const hints = extractProviderHints({
      errors: [{ status: "422", title: "Validation Error", detail: "x".repeat(1000) }],
    });
    assert.equal(hints.length, 1);
    assert.ok(hints[0].length <= 300, "el detalle del proveedor debe venir recortado");
  });

  test("un cuerpo sin `errors` no produce pistas inventadas", () => {
    assert.deepEqual(extractProviderHints({ mensaje: "algo" }), []);
    assert.deepEqual(extractProviderHints(null), []);
  });
});
