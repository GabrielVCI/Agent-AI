/**
 * Normalización y saneado del nombre de una categoría (Módulo 2).
 *
 * Módulo PURO (sin Prisma, sin red): es la regla que decide cuándo dos nombres
 * son la MISMA categoría dentro de un tenant, así que tiene que poder testearse
 * sin infraestructura. Mismo criterio que `customer-names.ts` en el Módulo 1.
 */
import { CATEGORY_DESCRIPTION_MAX, CATEGORY_NAME_MAX } from "./customer-category.types.js";

/**
 * Slug de unicidad dentro del tenant.
 *
 * Minúsculas, sin acentos, sin signos y con los espacios colapsados a un solo
 * guion. Es lo que impide que "VIP", " vip " y "Vip" acaben siendo tres
 * categorías distintas del mismo negocio.
 *
 * Los acentos se pierden a propósito ("Coloración" → "coloracion"): quien
 * teclea la categoría con y sin tilde quiere la MISMA, y el nombre bonito se
 * conserva aparte en `name`.
 *
 * Devuelve "" cuando el nombre no tiene ninguna letra o número utilizable; el
 * servicio lo trata como nombre inválido en vez de crear una categoría anónima.
 */
export function categorySlug(name: string): string {
  return name
    .normalize("NFD")
    // ̀-ͯ = marcas diacríticas combinantes que deja NFD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nombre visible saneado: sin marcado, sin espacios dobles y acotado.
 *
 * Los `<` y `>` se eliminan porque la insignia se pinta como texto en la ficha
 * de todos los que vean ese cliente; no se acepta HTML arbitrario.
 */
export function cleanCategoryName(raw: string): string {
  return raw
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CATEGORY_NAME_MAX);
}

export function cleanCategoryDescription(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.replace(/[<>]/g, "").trim().slice(0, CATEGORY_DESCRIPTION_MAX);
  return value || null;
}
