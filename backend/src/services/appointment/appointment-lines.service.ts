/**
 * AppointmentLineService — servicios y productos de una cita (Módulo 3).
 *
 * Es la capa que convierte "una cita" en "lo que realmente se hizo": una cita
 * puede llevar coloración + tratamiento + un champú vendido, y cada cosa tiene
 * su propio historial, su propio precio del día y su propia recurrencia.
 *
 * Garantías:
 *  · Aislamiento: cita, cliente y producto se validan contra el MISMO tenant
 *    antes de escribir. Un id de catálogo ajeno da 404, no una línea cruzada.
 *  · Snapshot: al cerrarse la cita, nombre y precio quedan congelados. Subir la
 *    tarifa mañana no reescribe lo que se cobró ayer.
 *  · Semántica explícita: SERVICE, PRODUCT_SOLD y PRODUCT_USED son cosas
 *    distintas. El tinte gastado en la coloración NO es una venta y jamás
 *    emite PRODUCT_PURCHASED.
 *  · Estabilidad histórica: una cita ya COMPLETED no admite cambios en sus
 *    líneas por esta vía (ver `assertEditable`).
 */
import { Prisma } from "@prisma/client";
import type { AppointmentLine, AppointmentLineKind, AppointmentLineStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";

/** Tope técnico antiabuso por cita (no es una regla de negocio). */
export const MAX_LINES_PER_APPOINTMENT = 50;
export const MAX_QUANTITY = 9999;

export interface AppointmentLineDTO {
  id: string;
  kind: AppointmentLineKind;
  status: AppointmentLineStatus;
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
  performedAt: Date | null;
  nextRecommendedAt: Date | null;
  notes: string | null;
  /** Solo informativo: si el ítem del catálogo sigue existiendo y su tipo. */
  catalogItemType: "PRODUCT" | "SERVICE" | null;
}

export interface AppointmentLineInput {
  /** Ítem del catálogo. Si falta, `name` es obligatorio (servicio suelto). */
  productId?: string | null;
  name?: string;
  kind?: AppointmentLineKind;
  quantity?: number;
  /** Precio unitario. Si falta, se toma el del catálogo. */
  unitPrice?: number;
  notes?: string | null;
  status?: AppointmentLineStatus;
}

type LineWithProduct = AppointmentLine & {
  product: { id: string; itemType: "PRODUCT" | "SERVICE" } | null;
};

function toNumber(value: Prisma.Decimal | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

export function toLineDTO(line: LineWithProduct): AppointmentLineDTO {
  return {
    id: line.id,
    kind: line.kind,
    status: line.status,
    productId: line.productId,
    name: line.nameSnapshot,
    unitPrice: toNumber(line.unitPriceSnapshot),
    quantity: line.quantity,
    total: toNumber(line.totalSnapshot),
    performedAt: line.performedAt,
    nextRecommendedAt: line.nextRecommendedAt,
    notes: line.notes,
    catalogItemType: line.product?.itemType ?? null,
  };
}

const lineInclude = {
  product: { select: { id: true, itemType: true } },
} satisfies Prisma.AppointmentLineInclude;

/** Cita del tenant o 404. Nunca se lee por id sin acotar el tenant. */
async function getOwnAppointmentForLines(tenantId: string, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      id: true,
      tenantId: true,
      customerId: true,
      status: true,
      completedAt: true,
      serviceOrProduct: true,
      catalogItemId: true,
    },
  });
  if (!appointment) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `cita ${appointmentId} inexistente o de otro tenant (${tenantId})`,
    });
  }
  return appointment;
}

/**
 * Una cita cerrada es historial: no se le añaden ni quitan servicios por esta
 * vía. Corregir un cierre equivocado se hace reabriendo la cita
 * (`reopenAppointment`), que además reconcilia métricas y recurrencias — nunca
 * editando las líneas por debajo y dejando los agregados mintiendo.
 */
function assertEditable(appointment: { status: string }): void {
  if (appointment.status === "COMPLETED") {
    throw new AppError(
      "Esta cita ya está cerrada. Reábrela si necesitas corregir lo que se hizo.",
      409,
      { code: "CONFLICT", details: { completed: true } }
    );
  }
  if (appointment.status === "CANCELLED") {
    throw new AppError("No se pueden registrar servicios en una cita cancelada.", 409, {
      code: "CONFLICT",
    });
  }
}

/** Producto/servicio del catálogo del tenant, o 404 si es de otro. */
async function getOwnProduct(tenantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true, name: true, price: true, itemType: true, isActive: true },
  });
  if (!product) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `producto ${productId} inexistente o de otro tenant (${tenantId})`,
    });
  }
  return product;
}

function cleanText(value: string, max: number): string {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function listAppointmentLines(
  tenantId: string,
  appointmentId: string
): Promise<AppointmentLineDTO[]> {
  await getOwnAppointmentForLines(tenantId, appointmentId);
  const rows = await prisma.appointmentLine.findMany({
    where: { tenantId, appointmentId },
    orderBy: { createdAt: "asc" },
    include: lineInclude,
  });
  return rows.map(toLineDTO);
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/**
 * Añade una línea a la cita.
 *
 * El precio se toma del catálogo salvo que el negocio indique otro (descuento,
 * precio pactado). Todavía NO es un snapshot definitivo: se vuelve a congelar
 * al cerrar la cita, que es el momento en que el precio pasa a ser historia.
 */
export async function addAppointmentLine(
  tenantId: string,
  appointmentId: string,
  input: AppointmentLineInput
): Promise<AppointmentLineDTO> {
  const appointment = await getOwnAppointmentForLines(tenantId, appointmentId);
  assertEditable(appointment);

  // Lo que se AGENDÓ también se hizo: antes de añadir el primer extra se
  // materializa la línea de la cita original. Sin esto, añadir "Corte" a una
  // cita de "Coloración" dejaría la coloración fuera del historial.
  await ensureDefaultLine(prisma, {
    id: appointment.id,
    tenantId,
    customerId: appointment.customerId,
    serviceOrProduct: appointment.serviceOrProduct,
    catalogItemId: appointment.catalogItemId,
  });

  const count = await prisma.appointmentLine.count({ where: { tenantId, appointmentId } });
  if (count >= MAX_LINES_PER_APPOINTMENT) {
    throw new AppError(
      `Una cita no puede tener más de ${MAX_LINES_PER_APPOINTMENT} líneas.`,
      400,
      { code: "VALIDATION_ERROR" }
    );
  }

  const quantity = Math.min(Math.max(1, Math.trunc(input.quantity ?? 1)), MAX_QUANTITY);
  let productId: string | null = null;
  let name = input.name ? cleanText(input.name, 160) : "";
  let unitPrice = input.unitPrice;
  let kind: AppointmentLineKind = input.kind ?? "SERVICE";

  if (input.productId) {
    const product = await getOwnProduct(tenantId, input.productId);
    productId = product.id;
    if (!name) name = product.name;
    if (unitPrice === undefined) unitPrice = toNumber(product.price);
    // El tipo del catálogo manda salvo que el negocio diga explícitamente que
    // el producto se usó internamente en vez de venderse.
    if (!input.kind) kind = product.itemType === "SERVICE" ? "SERVICE" : "PRODUCT_SOLD";
  }

  if (!name) {
    throw new AppError("Indica qué servicio o producto se atendió.", 400, {
      code: "VALIDATION_ERROR",
      details: { field: "name" },
    });
  }

  // Un producto usado internamente no tiene importe para el cliente: cobrarle
  // el tinte que gastó el salón sería inventar un ingreso.
  const price = kind === "PRODUCT_USED" ? 0 : Math.max(0, unitPrice ?? 0);

  const line = await prisma.appointmentLine.create({
    data: {
      tenantId,
      appointmentId,
      customerId: appointment.customerId,
      kind,
      status: input.status ?? "PLANNED",
      productId,
      nameSnapshot: name,
      unitPriceSnapshot: new Prisma.Decimal(price.toFixed(2)),
      quantity,
      totalSnapshot: new Prisma.Decimal((price * quantity).toFixed(2)),
      notes: input.notes ? cleanText(input.notes, 300) : null,
    },
    include: lineInclude,
  });

  return toLineDTO(line);
}

export async function updateAppointmentLine(
  tenantId: string,
  appointmentId: string,
  lineId: string,
  input: Partial<AppointmentLineInput>
): Promise<AppointmentLineDTO> {
  const appointment = await getOwnAppointmentForLines(tenantId, appointmentId);
  assertEditable(appointment);

  const current = await prisma.appointmentLine.findFirst({
    where: { id: lineId, tenantId, appointmentId },
  });
  if (!current) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `línea ${lineId} inexistente en la cita ${appointmentId}`,
    });
  }

  const kind = input.kind ?? current.kind;
  const quantity =
    input.quantity === undefined
      ? current.quantity
      : Math.min(Math.max(1, Math.trunc(input.quantity)), MAX_QUANTITY);
  const unitPrice =
    kind === "PRODUCT_USED"
      ? 0
      : input.unitPrice === undefined
        ? toNumber(current.unitPriceSnapshot)
        : Math.max(0, input.unitPrice);

  const line = await prisma.appointmentLine.update({
    where: { id: current.id },
    data: {
      ...(input.name !== undefined ? { nameSnapshot: cleanText(input.name, 160) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes ? cleanText(input.notes, 300) : null }
        : {}),
      kind,
      quantity,
      unitPriceSnapshot: new Prisma.Decimal(unitPrice.toFixed(2)),
      totalSnapshot: new Prisma.Decimal((unitPrice * quantity).toFixed(2)),
    },
    include: lineInclude,
  });

  return toLineDTO(line);
}

export async function removeAppointmentLine(
  tenantId: string,
  appointmentId: string,
  lineId: string
): Promise<void> {
  const appointment = await getOwnAppointmentForLines(tenantId, appointmentId);
  assertEditable(appointment);

  // deleteMany acotado por tenant: borrar por id suelto permitiría tocar la
  // línea de otra empresa si el id se filtrara.
  const result = await prisma.appointmentLine.deleteMany({
    where: { id: lineId, tenantId, appointmentId },
  });
  if (result.count === 0) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `línea ${lineId} inexistente en la cita ${appointmentId}`,
    });
  }
}

/**
 * Asegura que la cita tenga al menos una línea de servicio.
 *
 * Las citas nacen con `serviceOrProduct` (texto) y opcionalmente
 * `catalogItemId`; las creadas por el agente IA o por WhatsApp nunca pasan por
 * la pantalla de líneas. Al cerrarlas se materializa esa única línea para que
 * su historial exista igual. Idempotente: si ya hay líneas, no toca nada.
 */
export async function ensureDefaultLine(
  tx: Prisma.TransactionClient,
  appointment: {
    id: string;
    tenantId: string;
    customerId: string | null;
    serviceOrProduct: string;
    catalogItemId: string | null;
  }
): Promise<void> {
  const existing = await tx.appointmentLine.count({
    where: { tenantId: appointment.tenantId, appointmentId: appointment.id },
  });
  if (existing > 0) return;

  const product = appointment.catalogItemId
    ? await tx.product.findFirst({
        where: { id: appointment.catalogItemId, tenantId: appointment.tenantId },
        select: { id: true, name: true, price: true, itemType: true },
      })
    : null;

  const price = product ? toNumber(product.price) : 0;
  const kind: AppointmentLineKind =
    product && product.itemType === "PRODUCT" ? "PRODUCT_SOLD" : "SERVICE";

  await tx.appointmentLine.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      kind,
      status: "PLANNED",
      productId: product?.id ?? null,
      nameSnapshot: cleanText(product?.name ?? appointment.serviceOrProduct, 160) || "Servicio",
      unitPriceSnapshot: new Prisma.Decimal(price.toFixed(2)),
      quantity: 1,
      totalSnapshot: new Prisma.Decimal(price.toFixed(2)),
    },
  });
}
