import type { Request, Response } from "express";
import { z } from "zod";
import {
  listProducts,
  searchProduct,
  searchTechnicalList
} from "../services/product.service.js";
import { presentProduct } from "../utils/product-presenter.js";

const searchQuerySchema = z.object({
  q: z.string().min(1, "El parámetro q es obligatorio")
});

const technicalListSchema = z.object({
  text: z.string().min(1, "El texto es obligatorio")
});

export async function listProductsController(_req: Request, res: Response) {
  const products = await listProducts();

  res.json({
    success: true,
    count: products.length,
    data: products.map(presentProduct)
  });
}

export async function searchProductController(req: Request, res: Response) {
  const parsed = searchQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Consulta inválida",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const result = await searchProduct(parsed.data.q);

  res.json({
    success: true,
    query: parsed.data.q,
    result: {
      ...result,
      product: result.product ? presentProduct(result.product) : undefined,
      suggestions: result.suggestions?.map(presentProduct)
    }
  });
}

export async function searchTechnicalListController(
  req: Request,
  res: Response
) {
  const parsed = technicalListSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Datos inválidos",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const results = await searchTechnicalList(parsed.data.text);

  res.json({
    success: true,
    count: results.length,
    data: results.map((item) => ({
      ...item,
      result: {
        ...item.result,
        product: item.result.product
          ? presentProduct(item.result.product)
          : undefined,
        suggestions: item.result.suggestions?.map(presentProduct)
      }
    }))
  });
}