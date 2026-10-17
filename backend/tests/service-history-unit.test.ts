/**
 * Tests unitarios del Módulo 3 (sin base de datos): cálculo de la recurrencia.
 *
 * Es la parte con más aristas del módulo — meses cortos, horario de verano y
 * la diferencia entre "30 días" y "1 mes" — y es pura, así que se prueba sin
 * infraestructura.
 *
 * Runner: node:test + tsx (`npm run test:unit`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeRecurrence,
  hasActiveRecurrence,
  parseRecurrenceEntityId,
  recurrenceEntityId,
  resolveNextRecommendedAt,
  validateRecurrencePolicy,
} from "../src/services/appointment/service-recurrence.js";
import { getZonedParts } from "../src/utils/timezone.js";

const TZ = "America/Santo_Domingo";

/** "AAAA-MM-DD HH:mm" en la zona del negocio, que es como lo lee una persona. */
function localLabel(date: Date, timezone = TZ): string {
  const p = getZonedParts(date, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

// ─── Sin política, sin recurrencia ───────────────────────────────────────────

test("recurrencia: un servicio sin configuración NO genera fecha", () => {
  // Es la garantía de que Sendwary no inventa plazos comerciales.
  const performedAt = new Date("2026-07-01T14:00:00.000Z");

  assert.equal(
    resolveNextRecommendedAt({
      policy: { recurrenceEnabled: false, recurrenceInterval: 40, recurrenceUnit: "DAYS" },
      performedAt,
      timezone: TZ,
    }),
    null,
    "apagada no debe programar nada aunque tenga intervalo"
  );

  assert.equal(
    resolveNextRecommendedAt({
      policy: { recurrenceEnabled: true, recurrenceInterval: null, recurrenceUnit: null },
      performedAt,
      timezone: TZ,
    }),
    null,
    "encendida sin intervalo no puede inventarse uno"
  );
});

test("recurrencia: hasActiveRecurrence exige encendida + intervalo + unidad", () => {
  assert.equal(
    hasActiveRecurrence({ recurrenceEnabled: true, recurrenceInterval: 40, recurrenceUnit: "DAYS" }),
    true
  );
  assert.equal(
    hasActiveRecurrence({ recurrenceEnabled: true, recurrenceInterval: 0, recurrenceUnit: "DAYS" }),
    false
  );
  assert.equal(
    hasActiveRecurrence({ recurrenceEnabled: true, recurrenceInterval: 40, recurrenceUnit: null }),
    false
  );
  assert.equal(hasActiveRecurrence(null), false);
});

// ─── Cálculo de la fecha ─────────────────────────────────────────────────────

test("recurrencia: 40 días cae en el día correcto del calendario del negocio", () => {
  // 1 de julio (16:00 UTC = 12:00 local) + 40 días → 10 de agosto.
  const next = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 40, recurrenceUnit: "DAYS" },
    performedAt: new Date("2026-07-01T16:00:00.000Z"),
    timezone: TZ,
  });
  assert.ok(next);
  assert.equal(localLabel(next), "2026-08-10 10:00");
});

test("recurrencia: las semanas caen en el mismo día de la semana", () => {
  const performedAt = new Date("2026-07-01T16:00:00.000Z"); // miércoles local
  const next = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 2, recurrenceUnit: "WEEKS" },
    performedAt,
    timezone: TZ,
  });
  assert.ok(next);
  assert.equal(localLabel(next), "2026-07-15 10:00");
});

test('recurrencia: "1 mes" NO son 30 días', () => {
  // Enero tiene 31: sumar 30 días daría el 31 de enero, no el 1 de febrero.
  const performedAt = new Date("2026-01-01T16:00:00.000Z");

  const oneMonth = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 1, recurrenceUnit: "MONTHS" },
    performedAt,
    timezone: TZ,
  });
  const thirtyDays = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 30, recurrenceUnit: "DAYS" },
    performedAt,
    timezone: TZ,
  });

  assert.ok(oneMonth && thirtyDays);
  assert.equal(localLabel(oneMonth), "2026-02-01 10:00");
  assert.equal(localLabel(thirtyDays), "2026-01-31 10:00");
  assert.notEqual(oneMonth.getTime(), thirtyDays.getTime());
});

test("recurrencia: sumar meses no desborda un mes corto", () => {
  // 31 de enero + 1 mes debe dar el último día de febrero, no el 3 de marzo.
  const next = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 1, recurrenceUnit: "MONTHS" },
    performedAt: new Date("2026-01-31T16:00:00.000Z"),
    timezone: TZ,
  });
  assert.ok(next);
  assert.equal(localLabel(next), "2026-02-28 10:00");
});

test("recurrencia: cruzar el fin de año no rompe el mes", () => {
  const next = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 3, recurrenceUnit: "MONTHS" },
    performedAt: new Date("2026-11-15T16:00:00.000Z"),
    timezone: TZ,
  });
  assert.ok(next);
  assert.equal(localLabel(next), "2027-02-15 10:00");
});

test("recurrencia: la fecha cae a hora de negocio, no a la del servicio", () => {
  // Un servicio de las 19:30 no puede recomendar volver a las 19:30 de un día
  // en el que quizá el negocio ya cerró.
  const next = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 7, recurrenceUnit: "DAYS" },
    performedAt: new Date("2026-07-01T23:30:00.000Z"), // 19:30 local
    timezone: TZ,
  });
  assert.ok(next);
  assert.equal(localLabel(next), "2026-07-08 10:00");
});

test("recurrencia: en una zona con horario de verano la hora local se conserva", () => {
  // Madrid pasa de CET a CEST el 29 de marzo de 2026: sumar milisegundos
  // desplazaría el aviso una hora.
  const madrid = "Europe/Madrid";
  const next = resolveNextRecommendedAt({
    policy: { recurrenceEnabled: true, recurrenceInterval: 30, recurrenceUnit: "DAYS" },
    performedAt: new Date("2026-03-10T11:00:00.000Z"),
    timezone: madrid,
  });
  assert.ok(next);
  assert.equal(localLabel(next, madrid), "2026-04-09 10:00");
});

// ─── Validación ──────────────────────────────────────────────────────────────

test("recurrencia: la validación rechaza políticas encendidas sin sentido", () => {
  assert.equal(
    validateRecurrencePolicy({
      recurrenceEnabled: false,
      recurrenceInterval: null,
      recurrenceUnit: null,
    }),
    null,
    "apagada siempre es válida"
  );
  assert.match(
    validateRecurrencePolicy({
      recurrenceEnabled: true,
      recurrenceInterval: 0,
      recurrenceUnit: "DAYS",
    }) ?? "",
    /cuánto/i
  );
  assert.match(
    validateRecurrencePolicy({
      recurrenceEnabled: true,
      recurrenceInterval: 10,
      recurrenceUnit: null,
    }) ?? "",
    /días, semanas o meses/i
  );
  assert.match(
    validateRecurrencePolicy({
      recurrenceEnabled: true,
      recurrenceInterval: 400,
      recurrenceUnit: "MONTHS",
    }) ?? "",
    /10 años/i
  );
});

// ─── Identidad de la recurrencia ─────────────────────────────────────────────

test("recurrencia: la identidad es la PAREJA cliente + servicio", () => {
  // Si fuese solo del cliente, repetir la coloración cancelaría la keratina.
  // Si fuese solo del servicio, una clienta pisaría a otra.
  const coloracion = recurrenceEntityId("cus_1", "svc_color");
  const keratina = recurrenceEntityId("cus_1", "svc_keratina");
  const otraClienta = recurrenceEntityId("cus_2", "svc_color");

  assert.notEqual(coloracion, keratina);
  assert.notEqual(coloracion, otraClienta);

  assert.deepEqual(parseRecurrenceEntityId(coloracion), {
    customerId: "cus_1",
    serviceId: "svc_color",
  });
  // Un entityId que no es de recurrencia (una cita, un contacto suelto) no se
  // interpreta como pareja.
  assert.equal(parseRecurrenceEntityId("cus_1"), null);
  assert.equal(parseRecurrenceEntityId(":svc"), null);
  assert.equal(parseRecurrenceEntityId("cus_1:"), null);
});

test("recurrencia: el texto de la política se escribe en español correcto", () => {
  assert.equal(
    describeRecurrence({ recurrenceEnabled: true, recurrenceInterval: 40, recurrenceUnit: "DAYS" }),
    "cada 40 días"
  );
  assert.equal(
    describeRecurrence({ recurrenceEnabled: true, recurrenceInterval: 1, recurrenceUnit: "MONTHS" }),
    "cada 1 mes"
  );
  assert.equal(
    describeRecurrence({ recurrenceEnabled: false, recurrenceInterval: 40, recurrenceUnit: "DAYS" }),
    null
  );
});
