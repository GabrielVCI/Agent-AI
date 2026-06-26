import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  addQuoteItem,
  addQuoteItemBySearch,
  createQuote,
  getQuoteById,
  recalculateQuote,
  removeQuoteItem,
} from "../services/quote.service.js";
import { presentQuote } from "../utils/quote-presenter.js";
import { generateQuotePdf } from "../services/pdf.service.js";
import { AppError } from "../middlewares/error.middleware.js";

const addItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const addItemBySearchSchema = z.object({
  query: z.string().min(1),
  quantity: z.coerce.number().positive().optional(),
});

const removeLineParamsSchema = z.object({
  id: z.string().min(1),
  lineId: z.string().min(1),
});

function getTenantId(req: Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError("Empresa no identificada", 403);
  return tenantId;
}

export async function getQuoteController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const quote = await getQuoteById(req.params.id, tenantId);
    res.json({ success: true, data: presentQuote(quote) });
  } catch (err) { next(err); }
}

export async function addQuoteItemController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const body = addItemSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, errors: body.error.flatten().fieldErrors });
      return;
    }
    const quote = await addQuoteItem(req.params.id, tenantId, body.data);
    res.json({ success: true, data: presentQuote(quote) });
  } catch (err) { next(err); }
}

export async function addQuoteItemBySearchController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const body = addItemBySearchSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ success: false, errors: body.error.flatten().fieldErrors });
      return;
    }
    const result = await addQuoteItemBySearch(req.params.id, tenantId, body.data);
    if (result.needsConfirmation) {
      res.status(200).json({ success: true, needsConfirmation: true, searchResult: result.searchResult });
      return;
    }
    res.json({ success: true, needsConfirmation: false, data: result.quote ? presentQuote(result.quote) : null });
  } catch (err) { next(err); }
}

export async function removeQuoteItemController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const parsed = removeLineParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const quote = await removeQuoteItem(parsed.data.id, tenantId, parsed.data.lineId);
    res.json({ success: true, data: presentQuote(quote) });
  } catch (err) { next(err); }
}

export async function recalculateQuoteController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const quote = await recalculateQuote(req.params.id, tenantId);
    res.json({ success: true, data: presentQuote(quote) });
  } catch (err) { next(err); }
}

export async function generateQuotePdfController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const result = await generateQuotePdf(req.params.id, tenantId);
    res.json({ success: true, pdfUrl: result.pdfUrl, fileName: result.fileName });
  } catch (err) { next(err); }
}
