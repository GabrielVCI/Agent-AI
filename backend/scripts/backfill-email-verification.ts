import "dotenv/config";
import { prisma } from "../src/config/prisma.js";

/**
 * Backfill one-shot del flujo de verificación de correo:
 * - Usuarios existentes (creados antes de la feature) quedan verificados con
 *   emailVerifiedAt = createdAt para que NADIE quede bloqueado por la pantalla
 *   "Verifica tu correo".
 * - Tenants existentes ya nacen con lifecycleStatus ACTIVE (default del schema),
 *   así que no se tocan.
 *
 * Idempotente: solo afecta filas con emailVerifiedAt null.
 */
async function main() {
  const users = await prisma.user.findMany({
    where: { emailVerifiedAt: null },
    select: { id: true, createdAt: true, email: true },
  });

  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { emailVerifiedAt: u.createdAt },
    });
  }

  console.log(`[BACKFILL] ${users.length} usuario(s) marcados como verificados (emailVerifiedAt = createdAt)`);
}

main()
  .catch((err) => {
    console.error("[BACKFILL] error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
