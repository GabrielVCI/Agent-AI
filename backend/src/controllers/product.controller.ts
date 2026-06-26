import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  listProducts,
  searchProductForTenant,
  searchTechnicalList,
} from "../services/product.service.js";
import { presentProduct } from "../utils/product-presenter.js";
import { AppError } from "../middlewares/error.middleware.js";

const searchQuerySchema = z.object({
  q: z.string().min(1, "El parámetro q es obligatorio"),
});

const technicalListSchema = z.object({
  text: z.string().min(1, "El texto es obligatorio"),
});

function getTenantId(req: Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError("Empresa no identificada", 403);
  return tenantId;
}

export async function listProductsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const products = await listProducts(tenantId);
    res.json({ success: true, count: products.length, data: products.map(presentProduct) });
  } catch (err) { next(err); }
}

export async function searchProductController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const result = await searchProductForTenant(parsed.data.q, tenantId);
    res.json({
      success: true,
      query: parsed.data.q,
      result: {
        ...result,
        product: result.product ? presentProduct(result.product) : undefined,
        suggestions: result.suggestions?.map(presentProduct),
      },
    });
  } catch (err) { next(err); }
}

export async function searchTechnicalListController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantId(req);
    const parsed = technicalListSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const results = await searchTechnicalList(parsed.data.text, tenantId);
    res.json({
      success: true,
      count: results.length,
      data: results.map((item) => ({
        ...item,
        result: {
          ...item.result,
          product: item.result.product ? presentProduct(item.result.product) : undefined,
          suggestions: item.result.suggestions?.map(presentProduct),
        },
      })),
    });
  } catch (err) { next(err); }
}
