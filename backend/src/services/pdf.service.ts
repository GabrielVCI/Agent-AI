import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";
import { buildQuoteHtml } from "../templates/quote-template.js";

export async function generateQuotePdf(quoteId: string, tenantId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      tenant: true,
      customer: true,
      lines: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!quote) throw new AppError("Cotización no encontrada", 404);
  if (quote.lines.length === 0) {
    throw new AppError("No se puede generar PDF sin productos", 400);
  }

  const html = buildQuoteHtml({
    business: {
      name: quote.tenant.name,
      rnc: quote.tenant.rnc,
      phone: quote.tenant.phone,
      address: quote.tenant.address,
      logoUrl: quote.tenant.logoUrl,
    },
    quote: {
      quoteNumber: quote.quoteNumber,
      createdAt: quote.createdAt,
      validUntil: quote.validUntil,
      subtotal: Number(quote.subtotal.toString()),
      taxRate: Number(quote.taxRate.toString()),
      taxAmount: Number(quote.taxAmount.toString()),
      total: Number(quote.total.toString()),
    },
    customer: {
      name: quote.customer.name,
      phone: quote.customer.phone,
    },
    lines: quote.lines.map((line) => ({
      productName: line.productName,
      quantity: Number(line.quantity.toString()),
      unit: line.unit,
      unitPrice: Number(line.unitPrice.toString()),
      subtotal: Number(line.subtotal.toString()),
    })),
  });

  const quotesDir = path.resolve(process.cwd(), env.STORAGE_PATH, "quotes");
  await fs.mkdir(quotesDir, { recursive: true });

  const fileName = `${quote.quoteNumber}-${quote.id}.pdf`;
  const filePath = path.join(quotesDir, fileName);

  const browser = await puppeteer.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
    });
  } finally {
    await browser.close();
  }

  const pdfUrl = `${env.BACKEND_PUBLIC_URL}/files/quotes/${fileName}`;

  const updatedQuote = await prisma.quote.update({
    where: { id: quote.id },
    data: { pdfUrl, status: "SENT" },
    include: {
      customer: true,
      lines: { orderBy: { createdAt: "asc" } },
    },
  });

  return { quote: updatedQuote, fileName, filePath, pdfUrl };
}
