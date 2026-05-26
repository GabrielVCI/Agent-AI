import type { Request, Response } from "express";
import { z } from "zod";
import {
  addQuoteItem,
  addQuoteItemBySearch,
  createQuote,
  getQuoteById,
  recalculateQuote,
  removeQuoteItem
} from "../services/quote.service.js";
import { presentQuote } from "../utils/quote-presenter.js";
import { generateQuotePdf } from "../services/pdf.service.js";

const createQuoteSchema = z.object({
  phone: z.string().min(5, "El teléfono es obligatorio"),
  customerName: z.string().optional()
});

const addItemSchema = z.object({
  productId: z.string().min(1, "El productId es obligatorio"),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor que cero")
});

const addItemBySearchSchema = z.object({
  query: z.string().min(1, "El texto de búsqueda es obligatorio"),
  quantity: z.coerce
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .optional()
});

const paramsSchema = z.object({
  id: z.string().min(1)
});

const removeLineParamsSchema = z.object({
  id: z.string().min(1),
  lineId: z.string().min(1)
});

export async function createQuoteController(req: Request, res: Response) {
  const parsed = createQuoteSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Datos inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const quote = await createQuote(parsed.data);

  res.status(201).json({
    success: true,
    data: presentQuote(quote)
  });
}

export async function getQuoteController(req: Request, res: Response) {
  const parsed = paramsSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Parámetros inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const quote = await getQuoteById(parsed.data.id);

  res.json({
    success: true,
    data: presentQuote(quote)
  });
}

export async function addQuoteItemController(req: Request, res: Response) {
  const params = paramsSchema.safeParse(req.params);
  const body = addItemSchema.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      message: "Datos inválidos",
      errors: {
        params: !params.success ? params.error.flatten().fieldErrors : undefined,
        body: !body.success ? body.error.flatten().fieldErrors : undefined
      }
    });
  }

  const quote = await addQuoteItem(params.data.id, body.data);

  res.json({
    success: true,
    message: "Producto agregado a la cotización",
    data: presentQuote(quote)
  });
}

export async function addQuoteItemBySearchController(
  req: Request,
  res: Response
) {
  const params = paramsSchema.safeParse(req.params);
  const body = addItemBySearchSchema.safeParse(req.body);

  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      message: "Datos inválidos",
      errors: {
        params: !params.success ? params.error.flatten().fieldErrors : undefined,
        body: !body.success ? body.error.flatten().fieldErrors : undefined
      }
    });
  }

  const result = await addQuoteItemBySearch(params.data.id, body.data);

  if ("needsConfirmation" in result && result.needsConfirmation) {
    return res.status(200).json({
      success: true,
      needsConfirmation: true,
      message: result.message,
      searchResult: result.searchResult
    });
  }

  res.json({
    success: true,
    needsConfirmation: false,
    message: result.message,
    searchResult: result.searchResult,
    data: result.quote ? presentQuote(result.quote) : null
  });
}

export async function removeQuoteItemController(req: Request, res: Response) {
  const parsed = removeLineParamsSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Parámetros inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const quote = await removeQuoteItem(parsed.data.id, parsed.data.lineId);

  res.json({
    success: true,
    message: "Producto eliminado de la cotización",
    data: presentQuote(quote)
  });
}

export async function recalculateQuoteController(req: Request, res: Response) {
  const parsed = paramsSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Parámetros inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const quote = await recalculateQuote(parsed.data.id);

  res.json({
    success: true,
    message: "Cotización recalculada",
    data: presentQuote(quote)
  });
}

export async function generateQuotePdfController(req: Request, res: Response) {
  const parsed = paramsSchema.safeParse(req.params);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Parámetros inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const result = await generateQuotePdf(parsed.data.id);

  res.json({
    success: true,
    message: "PDF generado correctamente",
    pdfUrl: result.pdfUrl,
    fileName: result.fileName
  });
}