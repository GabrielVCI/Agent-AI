import { prisma } from "../config/prisma.js";
import { normalizeEmail } from "../utils/email.js";

/**
 * Busca un usuario por email sin distinguir mayúsculas (falla F4).
 *
 * Toda alta nueva guarda el email normalizado, pero pueden existir filas
 * anteriores con mayúsculas ("Juan@X.com", creadas por el panel de admin antes
 * de la corrección). Por eso: primero la búsqueda exacta por la forma canónica
 * (usa la unique), y solo si no hay, una comparación insensible a mayúsculas.
 * Si hubiera dos filas que solo difieren en mayúsculas, gana la más antigua.
 */
export async function findUserByEmail(email: string) {
  const canonical = normalizeEmail(email);
  const exact = await prisma.user.findUnique({ where: { email: canonical } });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { email: { equals: canonical, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
}
