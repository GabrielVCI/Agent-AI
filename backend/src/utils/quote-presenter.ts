import type { Quote, QuoteLine, Customer } from "@prisma/client";

type QuoteWithRelations = Quote & {
  customer: Customer;
  lines: QuoteLine[];
};

export function presentQuote(quote: QuoteWithRelations) {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    customer: {
      id: quote.customer.id,
      name: quote.customer.name,
      phone: quote.customer.phone
    },
    subtotal: Number(quote.subtotal.toString()),
    taxRate: Number(quote.taxRate.toString()),
    taxAmount: Number(quote.taxAmount.toString()),
    total: Number(quote.total.toString()),
    pdfUrl: quote.pdfUrl,
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    lines: quote.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      quantity: Number(line.quantity.toString()),
      unit: line.unit,
      unitPrice: Number(line.unitPrice.toString()),
      subtotal: Number(line.subtotal.toString()),
      createdAt: line.createdAt
    }))
  };
}