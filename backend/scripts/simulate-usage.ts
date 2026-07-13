/**
 * Simulación de consumo para probar límites de plan (solo desarrollo).
 *
 * Uso (desde backend/):
 *   npx tsx scripts/simulate-usage.ts <email-de-usuario-del-tenant> <totalMensajes|reset>
 *
 * Ejemplos:
 *   npx tsx scripts/simulate-usage.ts prueba.fase@test.com 2400   # 80% de BASIC
 *   npx tsx scripts/simulate-usage.ts prueba.fase@test.com 3000   # límite alcanzado
 *   npx tsx scripts/simulate-usage.ts prueba.fase@test.com reset  # limpiar
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";

async function main() {
  const email = process.argv[2];
  const amount = process.argv[3];
  if (!email || !amount) {
    console.error("Uso: npx tsx scripts/simulate-usage.ts <email> <totalMensajes|reset>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.tenantId) throw new Error(`Usuario ${email} sin tenant`);
  const tenantId = user.tenantId;

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  if (amount === "reset") {
    await prisma.usageCounter.deleteMany({ where: { tenantId, periodStart } });
    console.log(`✓ contador del mes reseteado (tenant ${tenantId})`);
    return;
  }

  const total = Number(amount);
  if (!Number.isFinite(total) || total < 0) throw new Error("Cantidad inválida");
  const inbound = Math.ceil(total / 2);
  const outbound = total - inbound;

  await prisma.usageCounter.upsert({
    where: { tenantId_periodStart: { tenantId, periodStart } },
    create: { tenantId, periodStart, periodEnd, inboundMessages: inbound, outboundMessages: outbound, totalMessages: total },
    update: { inboundMessages: inbound, outboundMessages: outbound, totalMessages: total },
  });

  const sub = await prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  console.log(
    `✓ tenant ${tenantId}: uso simulado ${total} msgs | plan ${sub?.plan?.name ?? "sin plan"} (límite ${sub?.plan?.monthlyMessageLimit ?? "?"})`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
