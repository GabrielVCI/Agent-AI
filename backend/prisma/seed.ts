import { PrismaClient, AliasType } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en el archivo .env");
}

// Inicialización limpia y vacía
const prisma = new PrismaClient();
async function main() {
  console.log("🌱 Iniciando seed...");

  const business = await prisma.business.upsert({
    where: {
      id: "demo-ferreteria"
    },
    update: {},
    create: {
      id: "demo-ferreteria",
      name: "Ferretería Demo Nacional",
      rnc: "000000000",
      phone: "809-000-0000",
      address: "Santo Domingo, República Dominicana",
      logoUrl: null
    }
  });

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
        ["semi gloss blanca", AliasType.SYNONYM],
        ["blanco hueso", AliasType.TECHNICAL_NAME],
        ["pintura tucan blanca", AliasType.SYNONYM],
        ["pintura tucán blanca", AliasType.SYNONYM]
      ]
    },
    {
      sku: "PINT-002",
      name: "Thinner Popular",
      category: "Pinturas",
      brand: "Popular",
      description: "Galón de thinner para dilución de pintura.",
      unit: "galón",
      price: 450,
      stock: 40,
      aliases: [
        ["tiner", AliasType.COMMON_MISTAKE],
        ["tinner", AliasType.COMMON_MISTAKE],
        ["tinel", AliasType.COMMON_MISTAKE],
        ["diluyente", AliasType.SYNONYM],
        ["thinner", AliasType.SYNONYM]
      ]
    },
    {
      sku: "PINT-003",
      name: "Óxido gris plata",
      category: "Pinturas",
      brand: "Popular",
      description: "Galón de óxido gris plata.",
      unit: "galón",
      price: 650,
      stock: 18,
      aliases: [
        ["oxido gris plata", AliasType.COMMON_MISTAKE],
        ["óxido gris", AliasType.SYNONYM],
        ["gris plata", AliasType.SYNONYM]
      ]
    },
    {
      sku: "HERR-001",
      name: "Llavín Yale derecho",
      category: "Cerraduras",
      brand: "Yale",
      description: "Llavín Yale derecho para puertas metálicas.",
      unit: "unidad",
      price: 850,
      stock: 12,
      aliases: [
        ["llavin yale derecho", AliasType.COMMON_MISTAKE],
        ["llavín yale derecho", AliasType.SYNONYM],
        ["llavin llame derecho", AliasType.COMMON_MISTAKE],
        ["llame derecho", AliasType.COMMON_MISTAKE],
        ["yales derecho", AliasType.COMMON_MISTAKE],
        ["cerradura yale derecha", AliasType.SYNONYM]
      ]
    },
    {
      sku: "HERR-002",
      name: "Planchuela 1 x 3/16",
      category: "Herrería",
      brand: "Genérico",
      description: "Planchuela de hierro medida 1 x 3/16.",
      unit: "unidad",
      price: 210,
      stock: 120,
      aliases: [
        ["planchuela de 1x 3/16", AliasType.SYNONYM],
        ["planchuela 1x3/16", AliasType.SYNONYM],
        ["planchuela 1 x 3/16", AliasType.TECHNICAL_NAME]
      ]
    },
    {
      sku: "HERR-003",
      name: "Perfil galvanizado 3 x 1 1/2 grueso",
      category: "Herrería",
      brand: "Genérico",
      description: "Perfil galvanizado grueso medida 3 x 1 1/2.",
      unit: "unidad",
      price: 980,
      stock: 30,
      aliases: [
        ["perfil de 3 x 1 1/2 calvanizado grueso", AliasType.COMMON_MISTAKE],
        ["perfil 3 x 1 1/2 galvanizado", AliasType.SYNONYM],
        ["perfil galvanizado grueso 3 x 1 1/2", AliasType.TECHNICAL_NAME]
      ]
    },
    {
      sku: "HERR-004",
      name: "Perfil galvanizado 1 x 1 grueso",
      category: "Herrería",
      brand: "Genérico",
      description: "Perfil galvanizado grueso medida 1 x 1.",
      unit: "unidad",
      price: 390,
      stock: 80,
      aliases: [
        ["perfil de 1x1 calvanizado grueso", AliasType.COMMON_MISTAKE],
        ["perfil 1x1 galvanizado grueso", AliasType.SYNONYM],
        ["perfil de 1x1 galvanizado grueso", AliasType.TECHNICAL_NAME]
      ]
    },
    {
      sku: "HERR-005",
      name: "Perfil galvanizado 1 1/2 x 1 1/2 grueso",
      category: "Herrería",
      brand: "Genérico",
      description: "Perfil galvanizado grueso medida 1 1/2 x 1 1/2.",
      unit: "unidad",
      price: 520,
      stock: 60,
      aliases: [
        ["perfil de 1 1/2 x 1 1/2 calvanizado grueso", AliasType.COMMON_MISTAKE],
        ["perfil 1 1/2 x 1 1/2 galvanizado", AliasType.SYNONYM]
      ]
    },
    {
      sku: "SOLD-001",
      name: "Soldadura fina",
      category: "Soldadura",
      brand: "Genérico",
      description: "Soldadura fina vendida por libra.",
      unit: "libra",
      price: 95,
      stock: 200,
      aliases: [
        ["electrodo fino", AliasType.SYNONYM],
        ["soldadura fina", AliasType.TECHNICAL_NAME],
        ["libra de soldadura fina", AliasType.SYNONYM]
      ]
    },
    {
      sku: "DISC-001",
      name: "Disco de corte 7 pulgadas",
      category: "Discos",
      brand: "Genérico",
      description: "Disco de corte número 7.",
      unit: "unidad",
      price: 180,
      stock: 100,
      aliases: [
        ["disco de corte #7", AliasType.SYNONYM],
        ["disco #7", AliasType.COMMON_MISTAKE],
        ["disco corte 7", AliasType.SYNONYM]
      ]
    },
    {
      sku: "DISC-002",
      name: "Disco de pulir 4 pulgadas",
      category: "Discos",
      brand: "Genérico",
      description: "Disco de pulir número 4.",
      unit: "unidad",
      price: 160,
      stock: 90,
      aliases: [
        ["disco de pulir #4", AliasType.SYNONYM],
        ["disco #4", AliasType.COMMON_MISTAKE],
        ["disco pulir 4", AliasType.SYNONYM]
      ]
    },
    {
      sku: "PINT-004",
      name: "Brocha 1 1/2",
      category: "Brochas",
      brand: "Genérico",
      description: "Brocha de 1 1/2 pulgadas.",
      unit: "unidad",
      price: 120,
      stock: 75,
      aliases: [
        ["brocha de 1 1/2", AliasType.SYNONYM],
        ["brocha 1.5", AliasType.SYNONYM]
      ]
    },
    {
      sku: "HERR-006",
      name: "Tiza industrial para metal",
      category: "Herrería",
      brand: "Genérico",
      description: "Tiza industrial para marcar metal.",
      unit: "unidad",
      price: 60,
      stock: 35,
      aliases: [
        ["tiza mecánica", AliasType.SYNONYM],
        ["tiza mecanica", AliasType.COMMON_MISTAKE],
        ["tiza para metal", AliasType.SYNONYM]
      ]
    },
    {
      sku: "ROD-001",
      name: "Rodillo profesional",
      category: "Pinturas",
      brand: "Genérico",
      description: "Rodillo profesional para pintura.",
      unit: "unidad",
      price: 250,
      stock: 50,
      aliases: [
        ["rodillo", AliasType.SYNONYM],
        ["rodillo para pintar", AliasType.SYNONYM],
        ["rodillo profesional", AliasType.TECHNICAL_NAME]
      ]
    }
  ];

  for (const productData of products) {
    const { aliases, ...data } = productData;

    const product = await prisma.product.upsert({
      where: {
        businessId_sku: {
          businessId: business.id,
          sku: data.sku
        }
      },
      update: {
        ...data,
        businessId: business.id
      },
      create: {
        ...data,
        businessId: business.id
      }
    });

    await prisma.productAlias.deleteMany({
      where: {
        productId: product.id
      }
    });

    await prisma.productAlias.createMany({
      data: aliases.map(([alias, aliasType]) => ({
        productId: product.id,
        alias: String(alias),
        aliasType: aliasType as AliasType
      }))
    });
  }

  console.log("✅ Seed completado.");
}
main()
  .catch((error) => {
    console.error("❌ Error ejecutando seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    // 1. Nos desconectamos de Prisma de forma limpia
    await prisma.$disconnect(); 
    
    // ❌ ELIMINADO: await pool.end(); <-- Ya no es necesario porque no hay Pool de JavaScript
  });