/**
 * Tests unitarios del Maestro de Clientes (sin base de datos): normalización
 * telefónica, política de nombres y búsqueda tolerante al formato.
 *
 * Runner: node:test + tsx (`npm run test:unit`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  countryForTimezone,
  maskPhone,
  normalizePhone,
  phoneSearchVariants,
  toE164,
} from "../src/utils/phone.js";
import {
  composeName,
  displayName,
  isPlaceholderName,
  splitFullName,
} from "../src/services/customer/customer-names.js";

// ─── Normalización telefónica ────────────────────────────────────────────────

test("teléfonos: todas las formas del mismo número dominicano dan el mismo E.164", () => {
  const variants = [
    "8095555555",
    "+18095555555",
    "1-809-555-5555",
    "(809) 555-5555",
    "1 809 555 5555",
    "809 555 5555",
    "  +1 (809) 555-5555  ",
  ];
  for (const value of variants) {
    assert.equal(toE164(value, "DO"), "+18095555555", `falló con "${value}"`);
  }
});

test("teléfonos: wa_id de Meta (dígitos sin +) se interpreta como internacional", () => {
  // Meta manda "18095551234" sin el prefijo "+": no puede leerse como local.
  assert.equal(toE164("18095551234", "DO"), "+18095551234");
  assert.equal(toE164("34612345678", "DO"), "+34612345678");
});

test("teléfonos: un número con código internacional ignora el país del tenant", () => {
  const spanish = normalizePhone("+34 612 345 678", "DO");
  assert.equal(spanish.e164, "+34612345678");
  assert.equal(spanish.country, "ES");
});

test("teléfonos: números inválidos no producen clave canónica", () => {
  for (const value of ["", "123", "abcdef", "00000", "555"]) {
    assert.equal(toE164(value, "DO"), null, `debería ser inválido: "${value}"`);
  }
});

test("teléfonos: un inválido conserva el texto original sin mentir sobre su validez", () => {
  const result = normalizePhone("123", "DO");
  assert.equal(result.valid, false);
  assert.equal(result.raw, "123");
});

test("teléfonos: el país sale de la zona horaria del tenant, no está hardcodeado", () => {
  assert.equal(countryForTimezone("America/Santo_Domingo"), "DO");
  assert.equal(countryForTimezone("Europe/Madrid"), "ES");
  assert.equal(countryForTimezone("America/Mexico_City"), "MX");
  // Zona desconocida → default configurable (DO salvo DEFAULT_PHONE_COUNTRY)
  assert.equal(countryForTimezone("Antarctica/Troll"), "DO");
  assert.equal(countryForTimezone(null), "DO");
});

test("búsqueda por teléfono: escribir sin formato encuentra el canónico", () => {
  const variants = phoneSearchVariants("8095555555", "DO");
  assert.ok(variants.includes("+18095555555"), "debe incluir el E.164");
  assert.ok(variants.includes("18095555555"), "debe incluir el E.164 sin +");
  assert.ok(variants.includes("8095555555"), "debe incluir los dígitos tecleados");
});

test("búsqueda por teléfono: un fragmento corto sigue sirviendo", () => {
  const variants = phoneSearchVariants("5555", "DO");
  assert.ok(variants.includes("5555"));
});

test("teléfonos: la máscara para logs no revela el número", () => {
  assert.equal(maskPhone("+18095551234"), "•••••1234");
  assert.equal(maskPhone("123"), "••••");
  assert.equal(maskPhone(null), "••••");
});

// ─── Política de nombres ─────────────────────────────────────────────────────

test("nombres: un nombre de una sola palabra NO inventa apellido", () => {
  assert.deepEqual(splitFullName("Gaby"), { firstName: "Gaby", lastName: null });
});

test("nombres: el resto de palabras forma el apellido compuesto", () => {
  assert.deepEqual(splitFullName("Ana María Pérez Gómez"), {
    firstName: "Ana",
    lastName: "María Pérez Gómez",
  });
  assert.deepEqual(splitFullName("  Gabriela   Pérez  "), {
    firstName: "Gabriela",
    lastName: "Pérez",
  });
});

test("nombres: el placeholder legado 'Cliente' no se estructura", () => {
  assert.equal(isPlaceholderName("Cliente"), true);
  assert.equal(isPlaceholderName("cliente"), true);
  assert.equal(isPlaceholderName("   "), true);
  assert.equal(isPlaceholderName("Clienta Rosa"), false);
  assert.deepEqual(splitFullName("Cliente"), { firstName: null, lastName: null });
});

test("nombres: composición y nombre para mostrar", () => {
  assert.equal(composeName("Gabriela", "Pérez"), "Gabriela Pérez");
  assert.equal(composeName("Gabriela", null), "Gabriela");
  assert.equal(composeName(null, null), "Cliente");
  assert.equal(composeName(null, null, "—"), "—");

  // Los campos estructurados mandan sobre el nombre legado
  assert.equal(
    displayName({ name: "gaby vieja", firstName: "Gabriela", lastName: "Pérez" }),
    "Gabriela Pérez"
  );
  // Sin estructurar, se usa el nombre de WhatsApp tal cual
  assert.equal(
    displayName({ name: "Ferretería El Sol", firstName: null, lastName: null }),
    "Ferretería El Sol"
  );
});
