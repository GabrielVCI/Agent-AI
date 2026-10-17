/**
 * Tests unitarios del Módulo 2 (sin base de datos): normalización del nombre de
 * categoría, que es lo que impide los duplicados accidentales dentro de un
 * tenant.
 *
 * Runner: node:test + tsx (`npm run test:unit`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { categorySlug } from "../src/services/customer/customer-category-names.js";
import {
  CUSTOMER_CATEGORY_COLORS,
  SYSTEM_CATEGORY_DEFINITIONS,
  SYSTEM_CATEGORY_KEYS,
  isCategoryColor,
} from "../src/services/customer/customer-category.types.js";

// ─── Normalización / unicidad ────────────────────────────────────────────────

test("categorías: mayúsculas y espacios no crean categorías distintas", () => {
  const variants = ["VIP", "vip", "Vip", "  VIP  ", "  vip", "vIp "];
  for (const value of variants) {
    assert.equal(categorySlug(value), "vip", `falló con "${value}"`);
  }
});

test("categorías: los acentos no duplican la categoría", () => {
  assert.equal(categorySlug("Coloración"), "coloracion");
  assert.equal(categorySlug("coloracion"), "coloracion");
  assert.equal(categorySlug("COLORACIÓN"), "coloracion");
});

test("categorías: los espacios internos se colapsan a un guion", () => {
  assert.equal(categorySlug("Riesgo de abandono"), "riesgo-de-abandono");
  assert.equal(categorySlug("Riesgo   de    abandono"), "riesgo-de-abandono");
  assert.equal(categorySlug("Riesgo-de-abandono"), "riesgo-de-abandono");
});

test("categorías: la puntuación no genera slugs con guiones sueltos", () => {
  assert.equal(categorySlug("¡Keratina!"), "keratina");
  assert.equal(categorySlug("Cliente / corporativo"), "cliente-corporativo");
  assert.equal(categorySlug("--VIP--"), "vip");
});

test("categorías: un nombre sin letras ni números no da slug utilizable", () => {
  // El servicio rechaza estos casos en vez de crear una categoría anónima.
  assert.equal(categorySlug("---"), "");
  assert.equal(categorySlug("   "), "");
  assert.equal(categorySlug("¿?"), "");
});

test("categorías: dos nombres realmente distintos NO colisionan", () => {
  assert.notEqual(categorySlug("Keratina"), categorySlug("Coloración"));
  assert.notEqual(categorySlug("VIP"), categorySlug("VIP Plus"));
});

// ─── Paleta cerrada ──────────────────────────────────────────────────────────

test("categorías: solo se acepta color de la paleta del design system", () => {
  for (const color of CUSTOMER_CATEGORY_COLORS) {
    assert.equal(isCategoryColor(color), true, `${color} debería ser válido`);
  }
  // Un color libre acabaría en className del frontend: se rechaza.
  assert.equal(isCategoryColor("red-500"), false);
  assert.equal(isCategoryColor("#ff0000"), false);
  assert.equal(isCategoryColor("javascript:alert(1)"), false);
  assert.equal(isCategoryColor(undefined), false);
});

// ─── Categorías de sistema ───────────────────────────────────────────────────

test("categorías de sistema: cada una declara el campo de Customer del que sale", () => {
  // Es lo que garantiza que no hay dos fuentes de verdad contradictorias: la
  // categoría siempre es el reflejo de un campo de la ficha, nunca un estado
  // paralelo inventado.
  for (const key of SYSTEM_CATEGORY_KEYS) {
    const definition = SYSTEM_CATEGORY_DEFINITIONS[key];
    assert.ok(definition, `falta la definición de ${key}`);
    assert.match(definition.derivedFrom, /^Customer\./);
    assert.ok(definition.name.length >= 2);
    assert.equal(isCategoryColor(definition.color), true);
  }
});

test("categorías de sistema: no se declara ninguna sin criterio de negocio", () => {
  // "Nuevo", "Frecuente" e "Inactivo" NO están: Sendwary todavía no ha fijado
  // sus umbrales y una insignia sin criterio real sería una implementación
  // falsa. Cuando se definan, entran como reglas del Automation Core.
  assert.deepEqual([...SYSTEM_CATEGORY_KEYS], ["VIP", "CHURN_RISK"]);
});
