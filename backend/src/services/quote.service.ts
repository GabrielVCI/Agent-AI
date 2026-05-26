import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { calculateTax } from "../utils/money.js";
import { searchProduct } from "./product.service.js";
import type {
  AddQuoteItemBySearchInput,
  AddQuoteItemInput,
  CreateQuoteInput
} from "../types/quote.types.js";

const DEMO_BUSINESS_ID = "demo-ferreteria";
const DEFAULT_TAX_RATE = 0.18;

export async function createQuote(input: CreateQuoteInput) {
  const customer = await prisma.customer.upsert({
    where: {
      businessId_phone: {
        businessId: DEMO_BUSINESS_ID,
        phone: input.phone
      }
    },
    update: {
      name: input.customerName ?? undefined
    },
    create: {
      businessId: DEMO_BUSINESS_ID,
      phone: input.phone,
      name: input.customerName ?? "Cliente"
    }
  });

  const quoteNumber = await generateQuoteNumber();

  const validUntil = new Date();
  validUntil.setHours(validUntil.getHours() + 24);

  const quote = await prisma.quote.create({
    data: {
      businessId: DEMO_BUSINESS_ID,
      customerId: customer.id,
      quoteNumber,
      status: "DRAFT",
      taxRate: DEFAULT_TAX_RATE,
      validUntil
    },
    include: {
      customer: true,
      lines: true
    }
  });

  return quote;
}

export async function getQuoteById(quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      businessId: DEMO_BUSINESS_ID
    },
    include: {
      customer: true,
      lines: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!quote) {
    throw new AppError("Cotización no encontrada", 404);
  }

  return quote;
}

export async function addQuoteItem(
  quoteId: string,
  input: AddQuoteItemInput
) {
  if (input.quantity <= 0) {
    throw new AppError("La cantidad debe ser mayor que cero", 400);
  }

  const quote = await getQuoteById(quoteId);

  if (quote.status !== "DRAFT" && quote.status !== "NEEDS_CONFIRMATION") {
    throw new AppError(
      "Solo se pueden modificar cotizaciones en estado borrador o pendiente de confirmación",
      400
    );
  }

  const product = await prisma.product.findFirst({
    where: {
      id: input.productId,
      businessId: DEMO_BUSINESS_ID,
      isActive: true
    }
  });

  if (!product) {
    throw new AppError("Producto no encontrado", 404);
  }

  if (product.stock <= 0) {
    throw new AppError("Producto sin existencia disponible", 400);
  }

  const unitPrice = Number(product.price.toString());
  const lineSubtotal = input.quantity * unitPrice;

  await prisma.quoteLine.create({
    data: {
      quoteId,
      productId: product.id,
      productName: product.name,
      quantity: new Prisma.Decimal(input.quantity),
      unit: product.unit,
      unitPrice: product.price,
      subtotal: new Prisma.Decimal(lineSubtotal)
    }
  });

  return recalculateQuote(quoteId);
}

export async function addQuoteItemBySearch(
  quoteId: string,
  input: AddQuoteItemBySearchInput
) {
  const quantity = input.quantity ?? 1;

  if (quantity <= 0) {
    throw new AppError("La cantidad debe ser mayor que cero", 400);
  }

  const searchResult = await searchProduct(input.query);

  if (searchResult.status === "NOT_FOUND") {
    throw new AppError(
      `No encontré un producto para: ${input.query}`,
      404
    );
  }

  if (searchResult.status === "MULTIPLE_MATCHES") {
    return {
      needsConfirmation: true,
      message: "Encontré varias opciones. Debes confirmar cuál producto usar.",
      searchResult
    };
  }

  if (searchResult.status === "NEEDS_CONFIRMATION") {
    return {
      needsConfirmation: true,
      message: "Encontré una posible coincidencia, pero necesita confirmación.",
      searchResult
    };
  }

  if (!searchResult.product) {
    throw new AppError("Producto no encontrado", 404);
  }

  const updatedQuote = await addQuoteItem(quoteId, {
    productId: searchResult.product.id,
    quantity
  });

  return {
    needsConfirmation: false,
    message: "Producto agregado a la cotización",
    searchResult,
    quote: updatedQuote
  };
}

export async function removeQuoteItem(quoteId: string, lineId: string) {
  await getQuoteById(quoteId);

  const line = await prisma.quoteLine.findFirst({
    where: {
      id: lineId,
      quoteId
    }
  });

  if (!line) {
    throw new AppError("Línea de cotización no encontrada", 404);
  }

  await prisma.quoteLine.delete({
    where: {
      id: lineId
    }
  });

  return recalculateQuote(quoteId);
}

export async function recalculateQuote(quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      businessId: DEMO_BUSINESS_ID
    },
    include: {
      lines: true
    }
  });

  if (!quote) {
    throw new AppError("Cotización no encontrada", 404);
  }

  const subtotal = quote.lines.reduce((sum, line) => {
    return sum + Number(line.subtotal.toString());
  }, 0);

  const totals = calculateTax(subtotal, Number(quote.taxRate.toString()));

  const updatedQuote = await prisma.quote.update({
    where: {
      id: quoteId
    },
    data: {
      subtotal: new Prisma.Decimal(totals.subtotal),
      taxAmount: new Prisma.Decimal(totals.taxAmount),
      total: new Prisma.Decimal(totals.total)
    },
    include: {
      customer: true,
      lines: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return updatedQuote;
}

async function generateQuoteNumber() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const datePart = `${year}${month}${day}`;

  const startOfDay = new Date(year, now.getMonth(), now.getDate());
  const endOfDay = new Date(year, now.getMonth(), now.getDate() + 1);

  const count = await prisma.quote.count({
    where: {
      businessId: DEMO_BUSINESS_ID,
      createdAt: {
        gte: startOfDay,
        lt: endOfDay
      }
    }
  });

  const sequence = String(count + 1).padStart(4, "0");

  return `COT-${datePart}-${sequence}`;
}

export async function findOrCreateQuoteForConversation(input: {
  customerId: string;
  conversationId: string;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: input.conversationId
    },
    include: {
      quotes: {
        where: {
          status: {
            in: ["DRAFT", "NEEDS_CONFIRMATION"]
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!conversation) {
    throw new AppError("Conversación no encontrada", 404);
  }

  const existingQuote = conversation.quotes[0];

  if (existingQuote) {
    return existingQuote;
  }

  const quoteNumber = await generateQuoteNumber();

  const validUntil = new Date();
  validUntil.setHours(validUntil.getHours() + 24);

  const quote = await prisma.quote.create({
    data: {
      businessId: DEMO_BUSINESS_ID,
      customerId: input.customerId,
      conversationId: input.conversationId,
      quoteNumber,
      status: "DRAFT",
      taxRate: DEFAULT_TAX_RATE,
      validUntil
    }
  });

  await prisma.conversation.update({
    where: {
      id: input.conversationId
    },
    data: {
      currentQuoteId: quote.id
    }
  });

  return quote;
}