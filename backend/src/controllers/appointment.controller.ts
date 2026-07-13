import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as appointments from "../services/appointment.service.js";
import * as excel from "../services/excel-appointments.service.js";
import { AppError } from "../middlewares/error.middleware.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({ success: false, message: "Datos inválidos", errors });
}

const listQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z
    .enum(["PENDING", "CONFIRMED", "CANCELLED", "RESCHEDULED", "NO_SHOW", "COMPLETED"])
    .optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "FOLLOW_UP"]).optional(),
  search: z.string().optional(),
});

const appointmentSchema = z.object({
  customerName: z.string().min(2, "Nombre del cliente requerido").max(120),
  customerPhone: z.string().min(6, "Teléfono requerido").max(30),
  customerEmail: z.string().email("Email inválido").nullish().or(z.literal("").transform(() => null)),
  scheduledAt: z.coerce.date({ errorMap: () => ({ message: "Fecha/hora inválida" }) }),
  serviceOrProduct: z.string().min(2, "Servicio o producto requerido").max(200),
  catalogItemId: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "FOLLOW_UP"]).default("NORMAL"),
  status: z.enum(["PENDING", "CONFIRMED"]).default("PENDING"),
});

export async function listAppointmentsController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await appointments.listAppointments(tenantIdOf(req), parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = appointmentSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const appointment = await appointments.createAppointment(tenantIdOf(req), {
      ...parsed.data,
      source: "MANUAL",
    });
    res.status(201).json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

export async function getAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointments.getAppointment(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

export async function updateAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = appointmentSchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const appointment = await appointments.updateAppointment(
      tenantIdOf(req),
      req.params.id,
      parsed.data
    );
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

const statusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "RESCHEDULED", "NO_SHOW", "COMPLETED"]),
});

/** PATCH genérico de estado (los flujos con reglas usan los endpoints dedicados). */
export async function appointmentStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const tenantId = tenantIdOf(req);
    const id = req.params.id;

    switch (parsed.data.status) {
      case "CONFIRMED":
        res.json({ success: true, data: await appointments.confirmAppointment(tenantId, id) });
        return;
      case "CANCELLED":
        res.json({ success: true, data: await appointments.cancelAppointment(tenantId, id) });
        return;
      case "NO_SHOW":
        res.json({ success: true, data: await appointments.markNoShow(tenantId, id) });
        return;
      case "COMPLETED":
        res.json({ success: true, data: await appointments.completeAppointment(tenantId, id) });
        return;
      default:
        throw new AppError(
          "Usa los endpoints dedicados para posponer (/reschedule) o vuelve a crear la cita",
          400
        );
    }
  } catch (err) {
    next(err);
  }
}

export async function confirmAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointments.confirmAppointment(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

const cancelSchema = z.object({ reason: z.string().max(500).optional() });

export async function cancelAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = cancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const appointment = await appointments.cancelAppointment(
      tenantIdOf(req),
      req.params.id,
      parsed.data.reason
    );
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

const rescheduleSchema = z.object({
  scheduledAt: z.coerce.date({ errorMap: () => ({ message: "Fecha/hora inválida" }) }),
  note: z.string().max(500).optional(),
});

export async function rescheduleAppointmentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const appointment = await appointments.rescheduleAppointment(
      tenantIdOf(req),
      req.params.id,
      parsed.data.scheduledAt,
      parsed.data.note
    );
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

export async function noShowAppointmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointments.markNoShow(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

export async function completeAppointmentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const appointment = await appointments.completeAppointment(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: appointment });
  } catch (err) {
    next(err);
  }
}

// ─── Recordatorios y settings ────────────────────────────────────────────────

export async function processRemindersController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appointments.processReminders(tenantIdOf(req));
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

const timeRangeSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:mm"),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:mm"),
});

const weeklyScheduleSchema = z
  .record(
    z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    z.array(timeRangeSchema).max(4)
  )
  .nullable();

const settingsSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  reminderHoursBefore: z.coerce.number().int().min(1).max(168).optional(),
  reminderMessageTemplate: z.string().min(10).max(1000).optional(),
  autoConfirmAI: z.boolean().optional(),
  weeklySchedule: weeklyScheduleSchema.optional(),
  slotDurationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  bufferMinutes: z.coerce.number().int().min(0).max(240).optional(),
  maxAppointmentsPerSlot: z.coerce.number().int().min(1).max(50).optional(),
});

export async function getAppointmentSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const settings = await appointments.getAppointmentSettings(tenantIdOf(req));
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

export async function updateAppointmentSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const settings = await appointments.updateAppointmentSettings(tenantIdOf(req), parsed.data);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

// ─── Excel: exportar / plantilla / importar (Parte E) ────────────────────────

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportAppointmentsExcelController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const buffer = await excel.exportAppointmentsToExcel(tenantIdOf(req), parsed.data);
    const today = new Date().toISOString().slice(0, 10);
    res
      .setHeader("Content-Type", EXCEL_MIME)
      .setHeader("Content-Disposition", `attachment; filename="citas-sendwary-${today}.xlsx"`)
      .send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function appointmentsTemplateExcelController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const buffer = await excel.buildAppointmentsTemplate();
    res
      .setHeader("Content-Type", EXCEL_MIME)
      .setHeader("Content-Disposition", 'attachment; filename="plantilla-citas-sendwary.xlsx"')
      .send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function importAppointmentsExcelController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const file = (req as Request & { file?: { buffer: Buffer; originalname: string } }).file;
    if (!file?.buffer?.length) {
      throw new AppError("Adjunta un archivo .xlsx en el campo 'file'", 400);
    }
    const preview = String(req.query.preview ?? "") === "true";
    const result = await excel.importAppointmentsFromExcel(tenantIdOf(req), file.buffer, { preview });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
