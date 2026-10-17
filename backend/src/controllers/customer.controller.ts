/**
 * API del Maestro de Clientes (Módulo 1) — /api/customers.
 *
 * Todos los endpoints resuelven el tenant desde la SESIÓN (cookie httpOnly
 * `sid`), nunca desde el body ni la query: un tenantId enviado por el cliente
 * se ignora por completo. El servicio vuelve a acotar por tenantId en cada
 * consulta, así que conocer el UUID de un cliente ajeno devuelve 404.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import * as customers from "../services/customer/customer.service.js";
import {
  getCustomerAppointments,
  getCustomerCommercialSummary,
  getCustomerTimeline,
} from "../services/customer/customer-metrics.service.js";
import {
  buildCustomersTemplate,
  importCustomers,
} from "../services/customer/customer-import.service.js";
import type { CustomerTimelineType } from "../services/customer/customer.types.js";
import { MAX_FILTER_CATEGORIES } from "../services/customer/customer-category.types.js";
import * as followUps from "../services/customer/customer-followups.service.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw AppError.fromCode("TENANT_REQUIRED", {
      internalMessage: `usuario ${req.user?.id ?? "anónimo"} sin tenantId en /api/customers`,
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

const optionalBool = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true")
  .optional();

const listQuerySchema = z.object({
  search: z.string().max(120).optional(),
  stage: z.enum(["CONTACT", "CLIENT", "ARCHIVED"]).optional(),
  includeArchived: optionalBool,
  isVip: optionalBool,
  riskStatus: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]).optional(),
  tag: z.string().max(40).optional(),
  // Categorías del Módulo 2: "a,b,c" en la query. El filtro se aplica en la
  // base de datos junto al resto, así que la paginación y el total siguen
  // siendo los reales.
  categoryIds: z
    .string()
    .max(500)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, MAX_FILTER_CATEGORIES)
        : undefined
    ),
  categoryMatch: z.enum(["all", "any"]).optional(),
  source: z.enum(["WHATSAPP", "MANUAL", "APPOINTMENT", "IMPORT", "VOICE", "API"]).optional(),
  inactiveDays: z.coerce.number().int().min(1).max(3650).optional(),
  hasVisits: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  lastVisitFrom: z.string().max(30).optional(),
  lastVisitTo: z.string().max(30).optional(),
  createdFrom: z.string().max(30).optional(),
  createdTo: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["lastVisitAt", "visitCount", "createdAt", "name", "firstVisitAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/** Rechaza nombres que son solo espacios (§16). */
const requiredName = (label: string) =>
  z
    .string()
    .trim()
    .min(2, `${label} debe tener al menos 2 caracteres`)
    .max(80, `${label} no puede superar 80 caracteres`);

const emailField = z
  .union([z.string().trim().email("El correo no tiene un formato válido").max(160), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

const customerSchema = z.object({
  firstName: requiredName("El nombre"),
  lastName: requiredName("El apellido"),
  phone: z.string().trim().min(6, "El teléfono es obligatorio").max(30),
  email: emailField,
  birthDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD"), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  documentId: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(300).nullish(),
  notes: z.string().trim().max(2000, "Las notas no pueden superar 2000 caracteres").nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isVip: z.boolean().optional(),
  riskStatus: z.enum(["NONE", "LOW", "MEDIUM", "HIGH"]).optional(),
});

const timelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  types: z.string().max(200).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Listado ─────────────────────────────────────────────────────────────────

export async function listCustomersController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await customers.listCustomers(tenantIdOf(req), parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customerCountersController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await customers.getCustomerCounters(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customerTagsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await customers.listCustomerTags(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Próximos seguimientos (Módulo 3) ────────────────────────────────────────

export async function customerFollowUpsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await followUps.listCustomerFollowUps(tenantIdOf(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function cancelFollowUpController(req: Request, res: Response, next: NextFunction) {
  try {
    await followUps.cancelCustomerFollowUp(tenantIdOf(req), req.params.id, req.params.jobId);
    res.json({ success: true, data: { cancelled: true }, message: "Seguimiento cancelado." });
  } catch (err) {
    next(err);
  }
}

export async function rescheduleFollowUpController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = z
      .object({ scheduledFor: z.coerce.date({ errorMap: () => ({ message: "Fecha inválida" }) }) })
      .safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);

    const scheduledFor = await followUps.rescheduleCustomerFollowUp(
      tenantIdOf(req),
      req.params.id,
      req.params.jobId,
      parsed.data.scheduledFor
    );
    res.json({ success: true, data: { scheduledFor }, message: "Seguimiento reprogramado." });
  } catch (err) {
    next(err);
  }
}

// ─── Ficha ───────────────────────────────────────────────────────────────────

export async function getCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await customers.getCustomerProfile(tenantIdOf(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customerSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = tenantIdOf(req);
    // Comprueba pertenencia ANTES de agregar métricas: sin esto, un id ajeno
    // devolvería un resumen vacío en vez de 404 (y confirmaría su existencia).
    await customers.getOwnCustomer(tenantId, req.params.id);
    const data = await getCustomerCommercialSummary(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customerTimelineController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = timelineQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const tenantId = tenantIdOf(req);
    await customers.getOwnCustomer(tenantId, req.params.id);

    const types = parsed.data.types
      ?.split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t): t is CustomerTimelineType =>
        ["APPOINTMENT", "QUOTE", "CONVERSATION", "AUTOMATION", "SCHEDULED_MESSAGE"].includes(t)
      );

    const data = await getCustomerTimeline(tenantId, req.params.id, {
      page: parsed.data.page,
      limit: parsed.data.limit,
      types,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customerAppointmentsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const tenantId = tenantIdOf(req);
    await customers.getOwnCustomer(tenantId, req.params.id);
    const data = await getCustomerAppointments(tenantId, req.params.id, parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Alta / edición ──────────────────────────────────────────────────────────

export async function createCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await customers.createCustomer(tenantIdOf(req), parsed.data);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await customers.updateCustomer(tenantIdOf(req), req.params.id, parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

const archiveSchema = z.object({ archived: z.boolean() });

export async function archiveCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = archiveSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await customers.setCustomerArchived(
      tenantIdOf(req),
      req.params.id,
      parsed.data.archived
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Importación ─────────────────────────────────────────────────────────────

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type UploadedFile = { buffer: Buffer; originalname: string; mimetype?: string };

function fileOf(req: Request): UploadedFile {
  const file = (req as Request & { file?: UploadedFile }).file;
  if (!file?.buffer?.length) {
    throw new AppError("Adjunta un archivo .csv o .xlsx en el campo 'file'", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  return file;
}

export async function importCustomersController(req: Request, res: Response, next: NextFunction) {
  try {
    const preview = String(req.query.preview ?? "") === "true";
    const data = await importCustomers(tenantIdOf(req), fileOf(req), { preview });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function previewCustomersImportController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await importCustomers(tenantIdOf(req), fileOf(req), { preview: true });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function customersTemplateController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const buffer = await buildCustomersTemplate();
    res
      .setHeader("Content-Type", XLSX_MIME)
      .setHeader("Content-Disposition", 'attachment; filename="plantilla-clientes-sendwary.xlsx"')
      .send(buffer);
  } catch (err) {
    next(err);
  }
}
