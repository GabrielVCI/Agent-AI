/**
 * API de categorías de clientes (Módulo 2) — /api/customer-categories y las
 * pertenencias bajo /api/customers/:id/categories.
 *
 * Igual que el resto del maestro: el tenant sale SIEMPRE de la sesión (cookie
 * httpOnly `sid`). Un `tenantId` en el body o en la query se ignora por
 * completo, y el servicio vuelve a acotar por tenant en cada consulta, así que
 * conocer el id de una categoría ajena devuelve 404.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import * as categories from "../services/customer/customer-category.service.js";
import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  CUSTOMER_CATEGORY_COLORS,
  MAX_BULK_CUSTOMERS,
} from "../services/customer/customer-category.types.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw AppError.fromCode("TENANT_REQUIRED", {
      internalMessage: `usuario ${req.user?.id ?? "anónimo"} sin tenantId en /api/customer-categories`,
    });
  }
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({
    success: false,
    message: "Revisa los datos ingresados.",
    error: { code: "VALIDATION_ERROR", message: "Revisa los datos ingresados." },
    errors,
  });
}

// ─── Esquemas ────────────────────────────────────────────────────────────────

const colorEnum = z.enum(CUSTOMER_CATEGORY_COLORS);

const listQuerySchema = z.object({
  search: z.string().max(60).optional(),
  type: z.enum(["MANUAL", "AUTOMATIC"]).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  includeArchived: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
});

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(CATEGORY_NAME_MAX, `El nombre no puede superar ${CATEGORY_NAME_MAX} caracteres`),
  description: z
    .union([z.string().trim().max(CATEGORY_DESCRIPTION_MAX), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  color: colorEnum.optional(),
});

const bulkSchema = z.object({
  customerIds: z
    .array(z.string().min(1).max(40))
    .min(1, "Selecciona al menos un cliente")
    .max(MAX_BULK_CUSTOMERS, `Máximo ${MAX_BULK_CUSTOMERS} clientes por operación`),
  action: z.enum(["assign", "remove"]).default("assign"),
});

// ─── Categorías ──────────────────────────────────────────────────────────────

export async function listCategoriesController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await categories.listCategories(tenantIdOf(req), parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await categories.getCategory(tenantIdOf(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await categories.createCategory(tenantIdOf(req), parsed.data, req.user?.id);
    res.status(201).json({ success: true, data, message: `Categoría "${data.name}" creada.` });
  } catch (err) {
    next(err);
  }
}

export async function updateCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = categorySchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await categories.updateCategory(tenantIdOf(req), req.params.id, parsed.data);
    res.json({ success: true, data, message: "Categoría actualizada." });
  } catch (err) {
    next(err);
  }
}

export async function archiveCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const archived = req.body?.archived !== false;
    const data = await categories.setCategoryArchived(tenantIdOf(req), req.params.id, archived);
    res.json({
      success: true,
      data,
      message: archived
        ? `"${data.name}" quedó archivada. Sus ${data.customerCount} cliente(s) conservan el historial.`
        : `"${data.name}" volvió a estar disponible.`,
    });
  } catch (err) {
    next(err);
  }
}

/** Asignación masiva desde el listado de clientes. */
export async function bulkCategoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);

    const data = await categories.bulkAssignCategory(
      tenantIdOf(req),
      req.params.id,
      parsed.data.customerIds,
      parsed.data.action,
      { source: "MANUAL", userId: req.user?.id }
    );

    const verb = parsed.data.action === "assign" ? "aplicada a" : "retirada de";
    res.json({
      success: true,
      data,
      message: `Categoría ${verb} ${data.applied} cliente(s).${
        data.alreadyDone > 0 ? ` ${data.alreadyDone} ya estaba(n) así.` : ""
      }`,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Pertenencias de un cliente ──────────────────────────────────────────────

export async function customerCategoriesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = tenantIdOf(req);
    // Se comprueba pertenencia del CLIENTE antes de listar: sin esto, un id
    // ajeno devolvería una lista vacía en vez de 404 (y confirmaría su
    // existencia).
    await categories.assertOwnCustomer(tenantId, req.params.id);
    const data = await categories.getCustomerCategories(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function assignCustomerCategoryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await categories.assignCategory(
      tenantIdOf(req),
      req.params.id,
      req.params.categoryId,
      { source: "MANUAL", userId: req.user?.id }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function removeCustomerCategoryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await categories.removeCategory(
      tenantIdOf(req),
      req.params.id,
      req.params.categoryId,
      { source: "MANUAL", userId: req.user?.id }
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
