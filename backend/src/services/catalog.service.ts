import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import {
  describeRecurrence,
  validateRecurrencePolicy,
  type RecurrenceUnit,
} from "./appointment/service-recurrence.js";

// ─── Serialización ────────────────────────────────────────────────────────────

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

type ItemWithCategory = Prisma.ProductGetPayload<{
  include: { categoryRef: { select: { id: true; name: true } } };
}>;

/** Forma pública de un ítem del catálogo (Decimal → number, stock → quantity, taxRate → %). */
export function serializeItem(item: ItemWithCategory) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.itemType,
    categoryId: item.categoryId,
    category: item.categoryRef ? { id: item.categoryRef.id, name: item.categoryRef.name } : null,
    price: decimalToNumber(item.price),
    taxRate: Math.round(decimalToNumber(item.taxRate) * 10000) / 100,
    priceIncludesTax: item.priceIncludesTax,
    quantity: item.itemType === "SERVICE" ? null : item.stock,
    sku: item.sku,
    unit: item.unit,
    isActive: item.isActive,
    // Recurrencia (Módulo 3). Solo tiene sentido en servicios; en un producto
    // se ignora al guardar. Sin intervalo configurado, completar el servicio NO
    // programa ningún seguimiento: Sendwary no inventa plazos comerciales.
    recurrenceEnabled: item.recurrenceEnabled,
    recurrenceInterval: item.recurrenceInterval,
    recurrenceUnit: item.recurrenceUnit,
    recurrenceLabel: describeRecurrence(item),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const itemInclude = { categoryRef: { select: { id: true, name: true } } } as const;

// ─── Categorías ───────────────────────────────────────────────────────────────

export async function listCategories(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(
  tenantId: string,
  data: { name: string; description?: string | null }
) {
  try {
    return await prisma.category.create({
      data: { tenantId, name: data.name.trim(), description: data.description ?? null },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Ya existe una categoría con ese nombre", 409);
    }
    throw err;
  }
}

async function getOwnCategory(tenantId: string, id: string) {
  const category = await prisma.category.findFirst({ where: { id, tenantId } });
  if (!category) throw new AppError("Categoría no encontrada", 404);
  return category;
}

export async function updateCategory(
  tenantId: string,
  id: string,
  data: { name?: string; description?: string | null }
) {
  await getOwnCategory(tenantId, id);
  try {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
    // Mantener sincronizado el campo legado Product.category (texto libre)
    if (data.name !== undefined) {
      await prisma.product.updateMany({
        where: { tenantId, categoryId: id },
        data: { category: updated.name },
      });
    }
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Ya existe una categoría con ese nombre", 409);
    }
    throw err;
  }
}

export async function setCategoryStatus(tenantId: string, id: string, isActive: boolean) {
  await getOwnCategory(tenantId, id);
  return prisma.category.update({ where: { id }, data: { isActive } });
}

/** Elimina si no tiene ítems; si los tiene, la desactiva (soft delete). */
export async function deleteCategory(tenantId: string, id: string) {
  await getOwnCategory(tenantId, id);
  const productCount = await prisma.product.count({ where: { tenantId, categoryId: id } });
  if (productCount > 0) {
    await prisma.category.update({ where: { id }, data: { isActive: false } });
    return { deleted: false, deactivated: true, productCount };
  }
  await prisma.category.delete({ where: { id } });
  return { deleted: true, deactivated: false, productCount: 0 };
}

// ─── Ítems (productos/servicios) ─────────────────────────────────────────────

export interface ListItemsFilters {
  search?: string;
  categoryId?: string;
  type?: "PRODUCT" | "SERVICE";
  status?: "active" | "inactive";
  page?: number;
  limit?: number;
  sortBy?: "name" | "price" | "createdAt";
  sortOrder?: "asc" | "desc";
}

const ITEM_SORT_FIELDS = ["name", "price", "createdAt"] as const;

export async function listItems(tenantId: string, filters: ListItemsFilters) {
  const where: Prisma.ProductWhereInput = { tenantId };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { sku: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.itemType = filters.type;
  if (filters.status) where.isActive = filters.status === "active";

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
  const sortBy = ITEM_SORT_FIELDS.includes(filters.sortBy as never)
    ? (filters.sortBy as (typeof ITEM_SORT_FIELDS)[number])
    : "name";
  const sortOrder = filters.sortOrder === "desc" ? "desc" : "asc";

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: itemInclude,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: rows.map(serializeItem),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export interface ItemInput {
  name: string;
  description?: string | null;
  type: "PRODUCT" | "SERVICE";
  categoryId?: string | null;
  price: number;
  taxRate?: number; // porcentaje (18 = 18%)
  priceIncludesTax?: boolean;
  quantity?: number | null;
  sku?: string | null;
  unit?: string;
  isActive?: boolean;
  // ── Recurrencia del servicio (Módulo 3) ──
  recurrenceEnabled?: boolean;
  recurrenceInterval?: number | null;
  recurrenceUnit?: RecurrenceUnit | null;
}

/**
 * Normaliza la política de recurrencia antes de guardarla.
 *
 * Solo los SERVICIOS pueden repetirse: un producto no tiene "mantenimiento".
 * Y una política encendida sin intervalo válido se rechaza en vez de guardarse
 * a medias, que dejaría un servicio marcado como recurrente sin nada detrás.
 */
interface RecurrenceFields {
  recurrenceEnabled?: boolean;
  recurrenceInterval?: number | null;
  recurrenceUnit?: RecurrenceUnit | null;
}

function recurrenceDataFor(
  input: Partial<ItemInput>,
  finalType: "PRODUCT" | "SERVICE",
  current?: { recurrenceEnabled: boolean; recurrenceInterval: number | null; recurrenceUnit: RecurrenceUnit | null }
): RecurrenceFields {
  const touched =
    input.recurrenceEnabled !== undefined ||
    input.recurrenceInterval !== undefined ||
    input.recurrenceUnit !== undefined;

  if (finalType !== "SERVICE") {
    // Al convertir un servicio en producto se apaga su recurrencia: dejarla
    // encendida programaría seguimientos de algo que ya no se "realiza".
    return touched || current?.recurrenceEnabled
      ? { recurrenceEnabled: false, recurrenceInterval: null, recurrenceUnit: null }
      : {};
  }
  if (!touched) return {};

  const policy = {
    recurrenceEnabled: input.recurrenceEnabled ?? current?.recurrenceEnabled ?? false,
    recurrenceInterval:
      input.recurrenceInterval !== undefined
        ? input.recurrenceInterval
        : (current?.recurrenceInterval ?? null),
    recurrenceUnit:
      input.recurrenceUnit !== undefined
        ? input.recurrenceUnit
        : (current?.recurrenceUnit ?? null),
  };

  const error = validateRecurrencePolicy(policy);
  if (error) throw new AppError(error, 400);

  return policy.recurrenceEnabled
    ? policy
    : { recurrenceEnabled: false, recurrenceInterval: null, recurrenceUnit: null };
}

async function resolveCategoryName(
  tenantId: string,
  categoryId: string | null | undefined
): Promise<string | null> {
  if (!categoryId) return null;
  const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
  if (!category) throw new AppError("La categoría indicada no existe", 400);
  return category.name;
}

export async function createItem(tenantId: string, input: ItemInput) {
  const categoryName = await resolveCategoryName(tenantId, input.categoryId);
  const taxRateDb = (input.taxRate ?? 18) / 100;

  try {
    const item = await prisma.product.create({
      data: {
        tenantId,
        name: input.name.trim(),
        description: input.description ?? null,
        itemType: input.type,
        categoryId: input.categoryId ?? null,
        category: categoryName,
        price: new Prisma.Decimal(input.price),
        taxRate: new Prisma.Decimal(taxRateDb),
        priceIncludesTax: input.priceIncludesTax ?? false,
        // Los servicios no manejan stock
        stock: input.type === "SERVICE" ? null : input.quantity ?? 0,
        sku: input.sku?.trim() || null,
        unit: input.unit?.trim() || "unidad",
        isActive: input.isActive ?? true,
        ...recurrenceDataFor(input, input.type),
      },
      include: itemInclude,
    });
    return serializeItem(item);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Ya existe un ítem con ese SKU", 409);
    }
    throw err;
  }
}

async function getOwnItem(tenantId: string, id: string) {
  const item = await prisma.product.findFirst({
    where: { id, tenantId },
    include: itemInclude,
  });
  if (!item) throw new AppError("Ítem no encontrado", 404);
  return item;
}

export async function getItem(tenantId: string, id: string) {
  return serializeItem(await getOwnItem(tenantId, id));
}

export async function updateItem(tenantId: string, id: string, input: Partial<ItemInput>) {
  const existing = await getOwnItem(tenantId, id);

  const data: Prisma.ProductUpdateInput = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description;
  if (input.type !== undefined) data.itemType = input.type;
  if (input.price !== undefined) data.price = new Prisma.Decimal(input.price);
  if (input.taxRate !== undefined) data.taxRate = new Prisma.Decimal(input.taxRate / 100);
  if (input.priceIncludesTax !== undefined) data.priceIncludesTax = input.priceIncludesTax;
  if (input.sku !== undefined) data.sku = input.sku?.trim() || null;
  if (input.unit !== undefined) data.unit = input.unit?.trim() || "unidad";
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (input.categoryId !== undefined) {
    const categoryName = await resolveCategoryName(tenantId, input.categoryId);
    data.categoryRef = input.categoryId
      ? { connect: { id: input.categoryId } }
      : { disconnect: true };
    data.category = categoryName;
  }

  Object.assign(data, recurrenceDataFor(input, input.type ?? existing.itemType, existing));

  const finalType = input.type ?? existing.itemType;
  if (finalType === "SERVICE") {
    data.stock = null;
  } else if (input.quantity !== undefined) {
    data.stock = input.quantity ?? 0;
  } else if (existing.itemType === "SERVICE" && finalType === "PRODUCT") {
    data.stock = 0;
  }

  try {
    const item = await prisma.product.update({ where: { id }, data, include: itemInclude });
    return serializeItem(item);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("Ya existe un ítem con ese SKU", 409);
    }
    throw err;
  }
}

export async function setItemStatus(tenantId: string, id: string, isActive: boolean) {
  await getOwnItem(tenantId, id);
  const item = await prisma.product.update({
    where: { id },
    data: { isActive },
    include: itemInclude,
  });
  return serializeItem(item);
}

/** Borrado real; las líneas de cotización conservan el nombre copiado (productId → null). */
export async function deleteItem(tenantId: string, id: string) {
  await getOwnItem(tenantId, id);
  await prisma.product.delete({ where: { id } });
  return { deleted: true };
}
