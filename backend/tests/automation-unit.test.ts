/**
 * Tests unitarios del motor (sin base de datos): condiciones, programación,
 * idempotencia, backoff, saneamiento de errores, render y zonas horarias.
 *
 * Runner: node:test + tsx (`npm run test:unit`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCondition,
  validateCondition,
} from "../src/services/automation/automation-conditions.js";
import {
  backoffDelayMs,
  buildJobIdempotencyKey,
  nextRetryAt,
  resolveScheduledFor,
} from "../src/services/automation/automation-schedule.js";
import {
  AutomationActionError,
  classifyError,
  sanitizeErrorText,
} from "../src/services/automation/automation-errors.js";
import {
  buildRenderVariables,
  renderTemplate,
} from "../src/services/automation/automation-render.js";
import {
  atLocalTimeOnOrAfter,
  localDayKey,
  nextAnnualOccurrence,
  zonedTimeToUtc,
} from "../src/utils/timezone.js";

const TZ = "America/Santo_Domingo"; // UTC-4 todo el año (sin DST)

// ─── Condiciones ─────────────────────────────────────────────────────────────

const context = {
  event: {
    type: "APPOINTMENT_COMPLETED",
    source: "appointments",
    entityType: "APPOINTMENT",
    entityId: "appt_1",
    occurredAt: new Date("2026-08-15T12:00:00.000Z"),
  },
  payload: { serviceOrProduct: "Keratina", status: "COMPLETED", total: 2500 },
  tenant: { timezone: TZ },
};

test("condiciones: null aplica siempre", () => {
  assert.equal(evaluateCondition(null, context), true);
  assert.equal(evaluateCondition(undefined, context), true);
});

test("condiciones: eq/contains/gte sobre el payload", () => {
  assert.equal(evaluateCondition({ field: "status", op: "eq", value: "COMPLETED" }, context), true);
  assert.equal(evaluateCondition({ field: "status", op: "eq", value: "PENDING" }, context), false);
  assert.equal(
    evaluateCondition({ field: "serviceOrProduct", op: "contains", value: "kera" }, context),
    true
  );
  assert.equal(evaluateCondition({ field: "total", op: "gte", value: 2000 }, context), true);
  assert.equal(evaluateCondition({ field: "total", op: "gt", value: 5000 }, context), false);
});

test("condiciones: grupos all/any/not y ruta event.*", () => {
  assert.equal(
    evaluateCondition(
      {
        all: [
          { field: "event.type", op: "eq", value: "APPOINTMENT_COMPLETED" },
          { any: [{ field: "total", op: "gte", value: 1000 }, { field: "status", op: "eq", value: "X" }] },
        ],
        not: { field: "status", op: "eq", value: "CANCELLED" },
      },
      context
    ),
    true
  );
});

test("condiciones: forma inválida NO ejecuta la automatización (fail-closed)", () => {
  assert.equal(evaluateCondition({ field: "status", op: "regex" } as never, context), false);
  assert.equal(evaluateCondition("siempre" as never, context), false);
});

test("validateCondition detecta operadores y estructuras inválidas", () => {
  assert.equal(validateCondition({ field: "status", op: "eq", value: "X" }), null);
  assert.notEqual(validateCondition({ field: "status", op: "matches" }), null);
  assert.notEqual(validateCondition({ all: "no-es-lista" }), null);
});

// ─── Programación ────────────────────────────────────────────────────────────

const occurredAt = new Date("2026-08-15T12:00:00.000Z");

test("scheduleStrategy DELAY suma los minutos configurados", () => {
  const result = resolveScheduledFor({
    rule: { scheduleStrategy: "DELAY", delayMinutes: 90, scheduleConfigJson: null },
    occurredAt,
  });
  assert.equal(result.ok, true);
  assert.equal(
    result.ok && result.scheduledFor.toISOString(),
    "2026-08-15T13:30:00.000Z"
  );
});

test("scheduleStrategy RELATIVE_TO_FIELD programa 24h antes de la cita", () => {
  const result = resolveScheduledFor({
    rule: {
      scheduleStrategy: "RELATIVE_TO_FIELD",
      delayMinutes: 0,
      scheduleConfigJson: { field: "scheduledAt", offsetMinutes: -1440 },
    },
    occurredAt,
    payload: { scheduledAt: "2026-08-20T15:00:00.000Z" },
  });
  assert.equal(result.ok && result.scheduledFor.toISOString(), "2026-08-19T15:00:00.000Z");
});

test("RELATIVE_TO_FIELD no programa nada si la fecha calculada ya pasó", () => {
  const result = resolveScheduledFor({
    rule: {
      scheduleStrategy: "RELATIVE_TO_FIELD",
      delayMinutes: 0,
      scheduleConfigJson: { field: "scheduledAt", offsetMinutes: -1440 },
    },
    occurredAt,
    payload: { scheduledAt: "2026-08-15T18:00:00.000Z" },
  });
  assert.equal(result.ok, false);
});

test("DAILY_AT_LOCAL_TIME cae en la hora local del tenant", () => {
  const result = resolveScheduledFor({
    rule: {
      scheduleStrategy: "DAILY_AT_LOCAL_TIME",
      delayMinutes: 2 * 24 * 60,
      scheduleConfigJson: { localTime: "10:00" },
    },
    occurredAt,
    timezone: TZ,
  });
  // 10:00 en UTC-4 = 14:00 UTC
  assert.equal(result.ok && result.scheduledFor.toISOString(), "2026-08-17T14:00:00.000Z");
});

// ─── Idempotencia ────────────────────────────────────────────────────────────

test("la clave de idempotencia es estable para la misma regla y entidad", () => {
  const base = {
    ruleId: "rule_1",
    eventType: "APPOINTMENT_CREATED",
    entityType: "APPOINTMENT",
    entityId: "appt_1",
    timezone: TZ,
  };
  const a = buildJobIdempotencyKey({ ...base, scheduledFor: new Date("2026-09-01T14:00:00Z") });
  const b = buildJobIdempotencyKey({ ...base, scheduledFor: new Date("2026-09-15T14:00:00Z") });
  // dedupeWindow por defecto = "entity": cambiar la fecha NO crea otra clave,
  // por eso una reprogramación mueve el job en vez de duplicarlo.
  assert.equal(a, b);

  const distinta = buildJobIdempotencyKey({
    ...base,
    entityId: "appt_2",
    scheduledFor: new Date("2026-09-01T14:00:00Z"),
  });
  assert.notEqual(a, distinta);
});

test("dedupeWindow day/occurrence y dedupeTag separan claves", () => {
  const base = {
    ruleId: "rule_1",
    eventType: "CUSTOMER_VISITED",
    entityType: "CUSTOMER",
    entityId: "cus_1",
    timezone: TZ,
  };
  const dia1 = buildJobIdempotencyKey({
    ...base,
    scheduledFor: new Date("2026-09-01T14:00:00Z"),
    scheduleConfig: { dedupeWindow: "day" },
  });
  const dia2 = buildJobIdempotencyKey({
    ...base,
    scheduledFor: new Date("2026-09-02T14:00:00Z"),
    scheduleConfig: { dedupeWindow: "day" },
  });
  assert.notEqual(dia1, dia2);

  const etapa30 = buildJobIdempotencyKey({
    ...base,
    scheduledFor: new Date("2026-09-01T14:00:00Z"),
    scheduleConfig: { dedupeTag: "followup-30" },
  });
  const etapa60 = buildJobIdempotencyKey({
    ...base,
    scheduledFor: new Date("2026-10-01T14:00:00Z"),
    scheduleConfig: { dedupeTag: "followup-60" },
  });
  assert.notEqual(etapa30, etapa60);
});

// ─── Backoff ─────────────────────────────────────────────────────────────────

test("backoff crece por intento y respeta el tope", () => {
  const sin = () => 0.5; // jitter neutro
  assert.equal(backoffDelayMs(1, sin), 30_000);
  assert.equal(backoffDelayMs(2, sin), 120_000);
  assert.equal(backoffDelayMs(3, sin), 600_000);
  assert.equal(backoffDelayMs(4, sin), 1_800_000);
  assert.equal(backoffDelayMs(5, sin), 7_200_000);
  assert.equal(backoffDelayMs(50, sin), 7_200_000);
});

test("nextRetryAt siempre queda en el futuro", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  assert.ok(nextRetryAt(1, now).getTime() > now.getTime());
});

// ─── Errores ─────────────────────────────────────────────────────────────────

test("sanitizeErrorText borra tokens y credenciales", () => {
  const raw =
    'Request failed: {"error":"invalid"} Authorization: Bearer EAAGxyzABC1234567890123456 access_token=EAAtokensecreto12345678901';
  const safe = sanitizeErrorText(raw);
  assert.ok(!safe.includes("EAAGxyzABC1234567890123456"));
  assert.ok(!safe.includes("EAAtokensecreto12345678901"));
  assert.ok(safe.includes("[REDACTED]"));
});

test("clasificación: 429 y 5xx son reintentables; 4xx no", () => {
  const rateLimited = classifyError({
    isAxiosError: true,
    message: "Request failed",
    response: { status: 429, data: { error: { message: "rate limit" } } },
  });
  assert.equal(rateLimited.kind, "RETRYABLE");

  const serverError = classifyError({
    isAxiosError: true,
    message: "Request failed",
    response: { status: 503, data: {} },
  });
  assert.equal(serverError.kind, "RETRYABLE");

  const badRequest = classifyError({
    isAxiosError: true,
    message: "Request failed",
    response: { status: 400, data: { error: { message: "número inválido" } } },
  });
  assert.equal(badRequest.kind, "NON_RETRYABLE");
});

test("clasificación: timeout de red es reintentable", () => {
  const timeout = classifyError({
    isAxiosError: true,
    code: "ETIMEDOUT",
    message: "timeout of 15000ms exceeded",
  });
  assert.equal(timeout.kind, "RETRYABLE");
});

test("clasificación: AutomationActionError conserva su tipo y se sanea", () => {
  const error = AutomationActionError.nonRetryable(
    "WHATSAPP_NOT_CONNECTED",
    "sin token: Bearer EAAsecreto1234567890123456"
  );
  const classified = classifyError(error);
  assert.equal(classified.kind, "NON_RETRYABLE");
  assert.equal(classified.errorType, "WHATSAPP_NOT_CONNECTED");
  assert.ok(!classified.message.includes("EAAsecreto1234567890123456"));
});

// ─── Render ──────────────────────────────────────────────────────────────────

test("renderTemplate sustituye placeholders y deja intactos los desconocidos", () => {
  const variables = buildRenderVariables({
    customerName: "Ana",
    businessName: "Salón Sendwary",
    timezone: TZ,
    eventPayload: { serviceOrProduct: "Keratina", scheduledAt: "2026-08-20T18:00:00.000Z" },
  });
  const text = renderTemplate(
    "Hola {{nombre}}, tu {{servicio}} es el {{fecha}} a las {{hora}} en {{negocio}}. {{desconocido}}",
    variables
  );
  assert.ok(text.startsWith("Hola Ana, tu Keratina es el"));
  assert.ok(text.includes("Salón Sendwary"));
  assert.ok(text.includes("{{desconocido}}"));
});

// ─── Zonas horarias ──────────────────────────────────────────────────────────

test("zonedTimeToUtc convierte hora local a UTC", () => {
  assert.equal(
    zonedTimeToUtc({ year: 2026, month: 9, day: 15, hour: 9, minute: 0 }, TZ).toISOString(),
    "2026-09-15T13:00:00.000Z"
  );
});

test("atLocalTimeOnOrAfter salta al día siguiente si la hora ya pasó", () => {
  // 20:00 UTC = 16:00 local → las 10:00 locales ya pasaron
  const from = new Date("2026-09-15T20:00:00.000Z");
  assert.equal(atLocalTimeOnOrAfter(from, "10:00", TZ).toISOString(), "2026-09-16T14:00:00.000Z");
  // 11:00 UTC = 07:00 local → las 10:00 locales son ese mismo día
  const early = new Date("2026-09-15T11:00:00.000Z");
  assert.equal(atLocalTimeOnOrAfter(early, "10:00", TZ).toISOString(), "2026-09-15T14:00:00.000Z");
});

test("cumpleaños: próxima ocurrencia anual y 29 de febrero", () => {
  const from = new Date("2026-08-15T12:00:00.000Z");
  assert.equal(
    nextAnnualOccurrence({ month: 12, day: 5, localTime: "09:00" }, from, TZ).toISOString(),
    "2026-12-05T13:00:00.000Z"
  );
  // Ya pasó este año → el año que viene
  assert.equal(
    nextAnnualOccurrence({ month: 1, day: 10, localTime: "09:00" }, from, TZ).toISOString(),
    "2027-01-10T13:00:00.000Z"
  );
  // 29 de febrero en año no bisiesto → 28 de febrero (decisión documentada)
  assert.equal(
    nextAnnualOccurrence({ month: 2, day: 29, localTime: "09:00" }, from, TZ).toISOString(),
    "2027-02-28T13:00:00.000Z"
  );
  // 2028 sí es bisiesto
  assert.equal(
    nextAnnualOccurrence(
      { month: 2, day: 29, localTime: "09:00" },
      new Date("2027-06-01T12:00:00.000Z"),
      TZ
    ).toISOString(),
    "2028-02-29T13:00:00.000Z"
  );
});

test("localDayKey usa el día del tenant, no el del servidor", () => {
  // 02:00 UTC del día 16 = 22:00 local del día 15
  assert.equal(localDayKey(new Date("2026-09-16T02:00:00.000Z"), TZ), "2026-09-15");
});
