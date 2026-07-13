/**
 * Seed idempotente de los planes comerciales REALES de Sendwary.
 *
 * Ejecutar:  npm run seed:plans   (o: npx tsx scripts/seed-plans.ts)
 *
 * - Upsert por `code`: actualiza límites/precios sin duplicar ni borrar.
 * - No toca suscripciones existentes, salvo dos reparaciones seguras:
 *     1) Suscripciones apuntando a planes legados (code null) se mueven al
 *        plan codificado equivalente por nombre (Básico→BASIC, etc.).
 *     2) Tenants SIN suscripción reciben BASIC en TRIALING (nunca se pisa
 *        una suscripción existente).
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma.js";

const plans = [
  {
    code: "BASIC",
    name: "Básico",
    description:
      "Para salones, peluquerías y pequeños negocios que quieren empezar a automatizar la atención por WhatsApp.",
    priceMonthly: 40,
    currency: "USD",
    setupFee: 250,
    setupFeeLabel: "+ USD 250 de implementación",
    estimatedMessagesMin: 1500,
    monthlyMessageLimit: 3000,
    monthlyTokenLimit: 2_000_000,
    maxAgents: 2,
    maxUsers: 1,
    maxWhatsappNumbers: 2,
    maxMonthlyConversations: 1500,
    maxMonthlyQuotes: 300,
    maxStorageMb: 200,
    allowRag: true,
    allowAudioTranscription: true,
    isPopular: false,
    sortOrder: 1,
    featuresJson: [
      "Hasta 2 agentes IA",
      "Hasta 2 números de WhatsApp",
      "1 usuario",
      "Panel de conversaciones",
      "Dashboard y reportes básicos",
      "Generación de cotizaciones",
      "Procesamiento de audios de WhatsApp",
      "Catálogo manual y documento para alimentar la IA",
      "Intervención humana",
      "Soporte básico",
    ],
  },
  {
    code: "PRO",
    name: "Pro",
    description:
      "Para clínicas, spas, consultorios, talleres con agenda y negocios en crecimiento con más volumen de atención.",
    priceMonthly: 60,
    currency: "USD",
    setupFee: 450,
    setupFeeLabel: "+ USD 450 de implementación",
    estimatedMessagesMin: 3000,
    monthlyMessageLimit: 6000,
    monthlyTokenLimit: 5_000_000,
    maxAgents: 5,
    maxUsers: 4,
    maxWhatsappNumbers: 4,
    maxMonthlyConversations: 4000,
    maxMonthlyQuotes: 1000,
    maxStorageMb: 1000,
    allowRag: true,
    allowAudioTranscription: true,
    isPopular: true,
    sortOrder: 2,
    featuresJson: [
      "Todo lo del plan Básico",
      "Hasta 4 usuarios",
      "Catálogo dedicado de productos/servicios",
      "Carga masiva de catálogo",
      "Citas y consultas gestionadas por IA",
      "Flujos para coordinar espacios por WhatsApp",
      "Reportes más completos",
      "Mayor capacidad de mensajes",
      "Soporte prioritario",
    ],
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description:
      "Para negocios con operaciones más complejas, mayor volumen o necesidad de integraciones. Todo desde un solo lugar.",
    priceMonthly: 90,
    currency: "USD",
    setupFee: 600,
    setupFeeLabel: "+ desde USD 600 de implementación",
    estimatedMessagesMin: 6000,
    // Límite inicial; ajustable por tenant vía Subscription.customMonthlyMessageLimit
    monthlyMessageLimit: 10000,
    monthlyTokenLimit: null,
    maxAgents: 10,
    maxUsers: 10,
    maxWhatsappNumbers: 10,
    maxMonthlyConversations: 20000,
    maxMonthlyQuotes: 10000,
    maxStorageMb: 10000,
    allowRag: true,
    allowAudioTranscription: true,
    isPopular: false,
    sortOrder: 3,
    featuresJson: [
      "Todo lo del plan Pro",
      "Hasta 10 usuarios",
      "Integraciones avanzadas bajo requerimiento",
      "Posibilidad de integración con CRM",
      "Odoo, SAP, QuickBooks bajo evaluación",
      "APIs externas o sistemas internos",
      "Automatizaciones y flujos personalizados",
      "Reportes avanzados",
      "Acompañamiento para evaluación técnica",
      "Soporte preferencial",
    ],
  },
] as const;

/** Nombre de plan legado → code equivalente. */
const LEGACY_NAME_TO_CODE: Record<string, string> = {
  "Básico": "BASIC",
  "Basico": "BASIC",
  "Profesional": "PRO",
  "Pro": "PRO",
  "Empresarial": "ENTERPRISE",
  "Enterprise": "ENTERPRISE",
};

async function main() {
  // 1) Upsert de planes reales
  const byCode = new Map<string, string>();
  for (const plan of plans) {
    const { code, featuresJson, ...data } = plan;
    const result = await prisma.plan.upsert({
      where: { code },
      create: { code, ...data, featuresJson: [...featuresJson], isActive: true },
      update: { ...data, featuresJson: [...featuresJson], isActive: true },
    });
    byCode.set(code, result.id);
    console.log(
      `✓ Plan ${code}: USD ${result.priceMonthly}/mes, ${result.monthlyMessageLimit} msg/mes (id ${result.id})`
    );
  }

  // 2) Reparación: suscripciones en planes legados (code null) → plan codificado
  const legacySubs = await prisma.subscription.findMany({
    where: { plan: { code: null } },
    include: { plan: { select: { name: true } } },
  });
  for (const sub of legacySubs) {
    const targetCode = LEGACY_NAME_TO_CODE[sub.plan?.name ?? ""] ?? "BASIC";
    const targetId = byCode.get(targetCode);
    if (!targetId) continue;
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: targetId },
    });
    console.log(`↻ Suscripción ${sub.id}: plan legado "${sub.plan?.name}" → ${targetCode}`);
  }

  // 3) Tenants sin suscripción → BASIC en TRIALING (solo crear, nunca pisar)
  const orphans = await prisma.tenant.findMany({
    where: { subscription: null },
    select: { id: true, name: true },
  });
  const basicId = byCode.get("BASIC");
  if (basicId) {
    for (const tenant of orphans) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: basicId,
          status: "TRIALING",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      console.log(`+ Tenant "${tenant.name}" sin plan → BASIC (TRIALING)`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Error seedeando planes:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
