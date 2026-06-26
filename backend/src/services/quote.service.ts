import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { calculateTax } from "../utils/money.js";
import { searchProductForTenant } from "./product.service.js";
import type {
  AddQuoteItemBySearchInput,
  AddQuoteItemInput,
} from "../types/quote.types.js";

const DEFAULT_TAX_RATE = 0.18;

export async function createQuote(input: {
  tenantId: string;
  customerId: string;
  conversationId?: string;
  agentId?: string;
}) {
  const quoteNumber = await generateQuoteNumber(input.tenantId);
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return prisma.quote.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId ?? null,
      agentId: input.agentId ?? null,
      quoteNumber,
      status: "DRAFT",
      taxRate: DEFAULT_TAX_RATE,
      validUntil,
    },
    include: { customer: true, lines: true },
  });
}

export async function getQuoteById(quoteId: string, tenantId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      customer: true,
      lines: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!quote) throw new AppError("Cotización no encontrada", 404);
  return quote;
}

export async function addQuoteItem(
  quoteId: string,
  tenantId: string,
  input: AddQuoteItemInput
) {
  if (input.quantity <= 0) {
    throw new AppError("La cantidad debe ser mayor que cero", 400);
  }

  const quote = await getQuoteById(quoteId, tenantId);

  if (quote.status !== "DRAFT" && quote.status !== "NEEDS_CONFIRMATION") {
    throw new AppError("Solo se pueden modificar cotizaciones en borrador", 400);
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId, isActive: true },
  });

  if (!product) throw new AppError("Producto no encontrado", 404);

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
      subtotal: new Prisma.Decimal(lineSubtotal),
    },
  });

  return recalculateQuote(quoteId, tenantId);
}

export async function addQuoteItemBySearch(
  quoteId: string,
  tenantId: string,
  input: AddQuoteItemBySearchInput
) {
  const quantity = input.quantity ?? 1;
  if (quantity <= 0) throw new AppError("Cantidad debe ser mayor que cero", 400);

  const searchResult = await searchProductForTenant(input.query, tenantId);

  if (searchResult.status === "NOT_FOUND") {
    throw new AppError(`No encontré un producto para: ${input.query}`, 404);
  }

  if (
    searchResult.status === "MULTIPLE_MATCHES" ||
    searchResult.status === "NEEDS_CONFIRMATION"
  ) {
    return { needsConfirmation: true, searchResult, quote: null };
  }

  if (!searchResult.product) throw new AppError("Producto no encontrado", 404);

  const updatedQuote = await addQuoteItem(quoteId, tenantId, {
    productId: searchResult.product.id,
    quantity,
  });

  return { needsConfirmation: false, searchResult, quote: updatedQuote };
}

export async function removeQuoteItem(
  quoteId: string,
  tenantId: string,
  lineId: string
) {
  await getQuoteById(quoteId, tenantId);

  const line = await prisma.quoteLine.findFirst({ where: { id: lineId, quoteId } });
  if (!line) throw new AppError("Línea de cotización no encontrada", 404);

  await prisma.quoteLine.delete({ where: { id: lineId } });
  return recalculateQuote(quoteId, tenantId);
}

export async function recalculateQuote(quoteId: string, tenantId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: { lines: true },
  });

  if (!quote) throw new AppError("Cotización no encontrada", 404);

  const subtotal = quote.lines.reduce(
    (sum, line) => sum + Number(line.subtotal.toString()),
    0
  );
  const totals = calculateTax(subtotal, Number(quote.taxRate.toString()));

  return prisma.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: new Prisma.Decimal(totals.subtotal),
      taxAmount: new Prisma.Decimal(totals.taxAmount),
      total: new Prisma.Decimal(totals.total),
    },
    include: {
      customer: true,
      lines: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function generateQuoteNumber(tenantId: string): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const count = await prisma.quote.count({
    where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
  });

  return `COT-${datePart}-${String(count + 1).padStart(4, "0")}`;
}

export async function findOrCreateQuoteForConversation(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  agentId?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    include: {
      quotes: {
        where: { status: { in: ["DRAFT", "NEEDS_CONFIRMATION"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!conversation) throw new AppError("Conversación no encontrada", 404);

  const existing = conversation.quotes[0];
  if (existing) return existing;

  const quoteNumber = await generateQuoteNumber(input.tenantId);
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const quote = await prisma.quote.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      agentId: input.agentId ?? null,
      quoteNumber,
      status: "DRAFT",
      taxRate: DEFAULT_TAX_RATE,
      validUntil,
    },
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { currentQuoteId: quote.id },
  });

  return quote;
}
