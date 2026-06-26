import { PrismaClient, AliasType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está definida en .env");
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed SaaS multiempresa...");

  // ── Plans ──────────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.plan.upsert({
      where: { id: "plan-basico" },
      update: {},
      create: {
        id: "plan-basico",
        name: "Básico",
        description: "Para negocios pequeños que inician",
        maxAgents: 1,
        maxWhatsappNumbers: 1,
        maxMonthlyConversations: 300,
        maxMonthlyQuotes: 100,
        maxStorageMb: 500,
        allowRag: false,
        allowAudioTranscription: false,
        priceMonthly: 1500,
        currency: "DOP",
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { id: "plan-profesional" },
      update: {},
      create: {
        id: "plan-profesional",
        name: "Profesional",
        description: "Para negocios en crecimiento",
        maxAgents: 2,
        maxWhatsappNumbers: 2,
        maxMonthlyConversations: 1500,
        maxMonthlyQuotes: 500,
        maxStorageMb: 2048,
        allowRag: true,
        allowAudioTranscription: true,
        priceMonthly: 100,
        currency: "DOP",
        isActive: true,
      },
    }),
    prisma.plan.upsert({
      where: { id: "plan-empresarial" },
      update: {},
      create: {
        id: "plan-empresarial",
        name: "Empresarial",
        description: "Para empresas con alto volumen",
        maxAgents: 4,
        maxWhatsappNumbers: 4,
        maxMonthlyConversations: 10000,
        maxMonthlyQuotes: 3000,
        maxStorageMb: 10240,
        allowRag: true,
        allowAudioTranscription: true,
        priceMonthly: 8500,
        currency: "DOP",
        isActive: true,
      },
    }),
  ]);

  console.log("✅ Planes creados");

  // ── Super Admin ────────────────────────────────────────────────────────────
  const superAdminEmail = "admin@saas.local";
  const superAdminPasswordPlain = "Admin@1234!";

  const existingSuperAdmin = await prisma.user.findUnique({ where: { email: superAdminEmail } });
  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        tenantId: null,
        name: "Super Admin",
        email: superAdminEmail,
        passwordHash: await bcrypt.hash(superAdminPasswordPlain, 12),
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`✅ Super Admin creado: ${superAdminEmail} / ${superAdminPasswordPlain}`);
  } else {
    console.log("⏭️  Super Admin ya existe");
  }

  // ── Demo Tenant (Ferretería) ───────────────────────────────────────────────
  let demoTenantId: string;
  const demoTenantEmail = "info@ferreteria-demo.local";

  const existingDemoTenant = await prisma.tenant.findFirst({ where: { email: demoTenantEmail } });
  if (!existingDemoTenant) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const tenant = await prisma.tenant.create({
      data: {
        name: "Ferretería Demo Nacional",
        legalName: "Ferretería Demo Nacional SRL",
        rnc: "000000000",
        email: demoTenantEmail,
        phone: "809-000-0000",
        address: "Santo Domingo, República Dominicana",
        industry: "ferreteria",
        timezone: "America/Santo_Domingo",
        status: "ACTIVE",
      },
    });
    demoTenantId = tenant.id;

    const ownerEmail = "owner@ferreteria-demo.local";
    const ownerPasswordPlain = "Demo@1234!";
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: "Owner Demo",
        email: ownerEmail,
        passwordHash: await bcrypt.hash(ownerPasswordPlain, 12),
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: "plan-profesional",
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await prisma.agent.create({
      data: {
        tenantId: tenant.id,
        name: "Agente Ventas Ferretería",
        type: "SALES",
        status: "ACTIVE",
        tone: "Español dominicano neutro. Profesional. Breve. Estilo WhatsApp.",
        openAiModel: "gpt-4.1-mini",
        allowHumanHandoff: true,
      },
    });

    console.log(`✅ Tenant demo creado: ${tenant.name} (id: ${tenant.id})`);
    console.log(`   Owner: ${ownerEmail} / ${ownerPasswordPlain}`);
  } else {
    demoTenantId = existingDemoTenant.id;
    console.log(`⏭️  Tenant demo ya existe (id: ${demoTenantId})`);
  }

  // ── Demo Products ──────────────────────────────────────────────────────────
  const products = [
    {
      sku: "PINT-001",
      name: "Pintura semi gloss blanco hueso Tucán",
      category: "Pinturas",
      brand: "Tucán",
      description: "Pintura semi gloss color blanco hueso marca Tucán.",
      unit: "cubeta",
      price: 1200,
      stock: 25,
      aliases: [
        ["pintura blanca semi gloss", AliasType.SYNONYM],
        ["blanco hueso", AliasType.TECHNICAL_NAME],
        ["pintura tucan blanca", AliasType.SYNONYM],
      ],
    },
    {
      sku: "PINT-002",
      name: "Thinner Popular",
      category: "Pinturas",
      brand: "Popular",
      unit: "galón",
      price: 450,
      stock: 40,
      aliases: [
        ["tiner", AliasType.COMMON_MISTAKE],
        ["tinner", AliasType.COMMON_MISTAKE],
        ["diluyente", AliasType.SYNONYM],
      ],
    },
    {
      sku: "HERR-001",
      name: "Llavín Yale derecho",
      category: "Cerraduras",
      brand: "Yale",
      unit: "unidad",
      price: 850,
      stock: 12,
      aliases: [
        ["llavin yale derecho", AliasType.COMMON_MISTAKE],
        ["yales derecho", AliasType.COMMON_MISTAKE],
      ],
    },
    {
      sku: "DISC-001",
      name: "Disco de corte 7 pulgadas",
      category: "Discos",
      brand: "Genérico",
      unit: "unidad",
      price: 180,
      stock: 100,
      aliases: [
        ["disco #7", AliasType.COMMON_MISTAKE],
        ["disco corte 7", AliasType.SYNONYM],
      ],
    },
    {
      sku: "SOLD-001",
      name: "Soldadura fina",
      category: "Soldadura",
      brand: "Genérico",
      unit: "libra",
      price: 95,
      stock: 200,
      aliases: [
        ["electrodo fino", AliasType.SYNONYM],
      ],
    },
  ];

  for (const productData of products) {
    const { aliases, ...data } = productData;

    const product = await prisma.product.upsert({
      where: {
        tenantId_sku: { tenantId: demoTenantId, sku: data.sku },
      },
      update: { ...data, tenantId: demoTenantId },
      create: { ...data, tenantId: demoTenantId },
    });

    await prisma.productAlias.deleteMany({ where: { productId: product.id } });
    await prisma.productAlias.createMany({
      data: aliases.map(([alias, aliasType]) => ({
        productId: product.id,
        alias: String(alias),
        aliasType: aliasType as AliasType,
      })),
    });
  }

  console.log("✅ Productos demo creados");
  console.log("🌱 Seed completado.");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
