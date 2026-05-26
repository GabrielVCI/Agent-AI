export type IncomingWhatsappInput = {
  phone: string;
  customerName?: string;
  message: string;
  messageId?: string;
  timestamp?: string;
};

export type WhatsappIncomingResponse = {
  success: boolean;
  replyText: string;
  actions: Array<{
    type: string;
    payload?: unknown;
  }>;
  customerId?: string;
  conversationId?: string;
  quoteId?: string | null;
  pdfUrl?: string | null;
  pdfPath?: string | null;
  pdfFilename?: string | null;
  requiresHuman: boolean;
};