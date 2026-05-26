export type CreateQuoteInput = {
  phone: string;
  customerName?: string;
};

export type AddQuoteItemInput = {
  productId: string;
  quantity: number;
};

export type AddQuoteItemBySearchInput = {
  query: string;
  quantity?: number;
};

export type QuoteTotals = {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
};