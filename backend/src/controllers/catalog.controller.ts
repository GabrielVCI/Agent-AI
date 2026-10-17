import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as catalog from "../services/catalog.service.js";
import { invalidateDashboardCache } from "../services/dashboard.service.js";
import { AppError } from "../middlewares/error.middleware.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({ success: false, message: "Datos inválidos", errors });
}

// ─── Categorías ───────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(2, "Nombre requerido").max(80),
  description: z.string().max(500).nullish(),
});

export async function listCategoriesController(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await catalog.listCategories(tenantIdOf(req));
    res.json({
      success: true,
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isActive: c.isActive,
        itemCount: c._count.products,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const category = await catalog.createCategory(tenantIdOf(req), parsed.data);
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
}

export async function updateCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = categorySchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const category = await catalog.updateCategory(tenantIdOf(req), req.params.id, parsed.data);
    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
}

const statusSchema = z.object({ isActive: z.boolean() });

export async function categoryStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const category = await catalog.setCategoryStatus(
      tenantIdOf(req),
      req.params.id,
      parsed.data.isActive
    );
    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await catalog.deleteCategory(tenantIdOf(req), req.params.id);
    res.json({
      success: true,
      data: result,
      message: result.deleted
        ? "Categoría eliminada"
        : `La categoría tiene ${result.productCount} ítem(s); se desactivó en su lugar`,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Ítems ────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().min(2, "Nombre requerido").max(150),
  description: z.string().max(1000).nullish(),
  type: z.enum(["PRODUCT", "SERVICE"]),
  categoryId: z.string().nullish(),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  taxRate: z.coerce.number().min(0).max(99).default(18),
  priceIncludesTax: z.boolean().default(false),
  quantity: z.coerce.number().int().min(0).nullish(),
  sku: z.string().max(60).nullish(),
  unit: z.string().max(30).optional(),
  isActive: z.boolean().default(true),
  // Recurrencia del servicio (Módulo 3). Sin valor por defecto a propósito:
  // el intervalo lo decide el negocio, no Sendwary.
  recurrenceEnabled: z.boolean().optional(),
  recurrenceInterval: z.coerce.number().int().min(1).max(3650).nullish(),
  recurrenceUnit: z.enum(["DAYS", "WEEKS", "MONTHS"]).nullish(),
});

const listQuerySchema = z.object({
  search: z.string().max(120).optional(),
  categoryId: z.string().optional(),
  type: z.enum(["PRODUCT", "SERVICE"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "price", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export async function listItemsController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const items = await catalog.listItems(tenantIdOf(req), parsed.data);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function createItemController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const item = await catalog.createItem(tenantIdOf(req), parsed.data);
    void invalidateDashboardCache(tenantIdOf(req));
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function getItemController(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await catalog.getItem(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function updateItemController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const item = await catalog.updateItem(tenantIdOf(req), req.params.id, parsed.data);
    void invalidateDashboardCache(tenantIdOf(req));
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function itemStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const item = await catalog.setItemStatus(tenantIdOf(req), req.params.id, parsed.data.isActive);
    void invalidateDashboardCache(tenantIdOf(req));
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function deleteItemController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await catalog.deleteItem(tenantIdOf(req), req.params.id);
    void invalidateDashboardCache(tenantIdOf(req));
    res.json({ success: true, data: result, message: "Ítem eliminado" });
  } catch (err) {
    next(err);
  }
}
