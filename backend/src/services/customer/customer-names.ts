/**
 * Política de nombres del Maestro de Clientes.
 *
 * El modelo tiene TRES campos y los tres son reales:
 *   - name      → nombre para mostrar. Campo legado que ya consumen el inbox,
 *                 las cotizaciones, el PDF y el motor de automatizaciones.
 *   - firstName → nombre de pila.
 *   - lastName  → apellido.
 *
 * Decisión documentada (§10 del encargo: "no inventes apellido"):
 *
 *  · Alta MANUAL e IMPORTACIÓN exigen nombre y apellido por separado; `name`
 *    se compone a partir de ellos.
 *  · WhatsApp/llamadas solo entregan un nombre de perfil libre ("Gabriela
 *    Pérez", "Gaby", "Ferretería El Sol"). Ahí se guarda tal cual en `name` y
 *    se DIVIDE en firstName/lastName únicamente cuando hay más de una palabra.
 *    Un contacto llamado "Gaby" queda con lastName = null: el negocio lo
 *    completa después. NUNCA se rellena un apellido inventado ni un guion.
 *  · El placeholder legado "Cliente" (que usaba findOrCreateCustomer cuando
 *    WhatsApp no mandaba nombre) no se propaga a firstName/lastName.
 */

/** Nombre placeholder histórico: no es un nombre real, no se estructura. */
export const PLACEHOLDER_NAME = "Cliente";

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function isPlaceholderName(value: string | null | undefined): boolean {
  const name = clean(value);
  return name === "" || name.toLowerCase() === PLACEHOLDER_NAME.toLowerCase();
}

/**
 * Divide un nombre completo. La primera palabra es el nombre y el RESTO el
 * apellido (compuesto): "Ana María Pérez Gómez" → "Ana", "María Pérez Gómez".
 * No es adivinar: es la convención de un campo de texto libre. Con una sola
 * palabra devuelve lastName = null.
 */
export function splitFullName(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const name = clean(full);
  if (!name || isPlaceholderName(name)) return { firstName: null, lastName: null };
  const parts = name.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Compone el nombre para mostrar. Sin datos devuelve el fallback. */
export function composeName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = PLACEHOLDER_NAME
): string {
  const composed = [clean(firstName), clean(lastName)].filter(Boolean).join(" ");
  return composed || fallback;
}

/** Nombre para mostrar de una fila ya cargada. */
export function displayName(customer: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const structured = composeName(customer.firstName, customer.lastName, "");
  if (structured) return structured;
  return clean(customer.name) || PLACEHOLDER_NAME;
}
