import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middlewares/error.middleware.js";
import { sendWhatsappTextMessage } from "./meta-whatsapp.service.js";
import { resolveSendCredentials } from "./whatsapp-integration.service.js";
import { invalidateDashboardCache } from "./dashboard.service.js";
import { logger } from "../config/logger.js";

// ─── Settings (nivel tenant, JSON en Tenant.appointmentSettings) ─────────────

/** Rango horario "HH:mm"–"HH:mm" dentro de un día. */
export interface TimeRange {
  start: string;
  end: string;
}

export type WeekDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type WeeklySchedule = Partial<Record<WeekDay, TimeRange[]>>;

export interface AppointmentSettings {
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  reminderMessageTemplate: string;
  /** Si true, las citas creadas por la IA nacen CONFIRMED; si false, PENDING. */
  autoConfirmAI: boolean;
  // ── Disponibilidad básica del negocio ──
  /** null = sin configurar: la IA registra solicitudes sin validar horario. */
  weeklySchedule: WeeklySchedule | null;
  slotDurationMinutes: number;
  bufferMinutes: number;
  maxAppointmentsPerSlot: number;
}

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
  reminderEnabled: true,
  reminderHoursBefore: 24,
  reminderMessageTemplate:
    "Hola {{nombre}} 👋 Te recordamos tu cita de {{servicio}} el {{fecha}} a las {{hora}}. Si necesitas reprogramar, respóndenos por aquí.",
  autoConfirmAI: false,
  weeklySchedule: null,
  slotDurationMinutes: 60,
  bufferMinutes: 0,
  maxAppointmentsPerSlot: 1,
};

const WEEKDAY_LABELS: Record<WeekDay, string> = {
  monday: "lunes",
  tuesday: "martes",
  wednesday: "miércoles",
  thursday: "jueves",
  friday: "viernes",
  saturday: "sábado",
  sunday: "domingo",
};

export async function getAppointmentSettings(tenantId: string): Promise<AppointmentSettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { appointmentSettings: true },
  });
  const stored = (tenant?.appointmentSettings ?? {}) as Partial<AppointmentSettings>;
  return { ...DEFAULT_APPOINTMENT_SETTINGS, ...stored };
}

export async function updateAppointmentSettings(
  tenantId: string,
  input: Partial<AppointmentSettings>
): Promise<AppointmentSettings> {
  const current = await getAppointmentSettings(tenantId);
  const merged: AppointmentSettings = { ...current, ...input };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { appointmentSettings: merged as unknown as Prisma.InputJsonValue },
  });
  return merged;
}

// ─── Serialización ────────────────────────────────────────────────────────────

const appointmentInclude = {
  agent: { select: { id: true, name: true } },
  catalogItem: { select: { id: true, name: true } },
  conversation: { select: { id: true, customerName: true } },
} as const;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

export function serializeAppointment(a: AppointmentWithRelations) {
  return {
    id: a.id,
    customerName: a.customerName,
    customerPhone: a.customerPhone,
    customerEmail: a.customerEmail,
    requestedAt: a.requestedAt,
    scheduledAt: a.scheduledAt,
    serviceOrProduct: a.serviceOrProduct,
    catalogItemId: a.catalogItemId,
    catalogItem: a.catalogItem,
    notes: a.notes,
    source: a.source,
    status: a.status,
    confirmationStatus: a.confirmationStatus,
    priority: a.priority,
    lastReminderAt: a.lastReminderAt,
    confirmedAt: a.confirmedAt,
    cancelledAt: a.cancelledAt,
    rescheduledAt: a.rescheduledAt,
    agentId: a.agentId,
    agent: a.agent,
    conversationId: a.conversationId,
    conversation: a.conversation,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Registra un evento de cita como mensaje SYSTEM dentro de la conversación. */
async function logAppointmentEvent(input: {
  tenantId: string;
  conversationId: string | null;
  text: string;
}) {
  // Toda mutación de citas pasa por aquí: el dashboard cuenta citas
  // próximas/pendientes, así que invalidamos su cache SIEMPRE (también para
  // citas manuales sin conversación).
  void invalidateDashboardCache(input.tenantId);

  if (!input.conversationId) return;
  try {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          direction: "OUTBOUND",
          senderType: "SYSTEM",
          messageType: "TEXT",
          textContent: input.text,
        },
      }),
      prisma.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: new Date(), lastMessagePreview: input.text.slice(0, 120) },
      }),
    ]);
  } catch (err) {
    // El evento en conversación es informativo: no debe tumbar la operación de cita.
    logger.warn(`No se pudo registrar evento de cita en conversación: ${String(err)}`);
  }
}

export function formatScheduledAt(date: Date, timezone = "America/Santo_Domingo") {
  const fecha = new Intl.DateTimeFormat("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(date);
  const hora = new Intl.DateTimeFormat("es-DO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(date);
  return { fecha, hora };
}

async function getOwnAppointment(tenantId: string, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, tenantId },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError("Cita no encontrada", 404);
  return appointment;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export interface ListAppointmentsFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  priority?: string;
  search?: string;
  agentId?: string;
  source?: string;
  page?: number;
  limit?: number;
  sortBy?: "scheduledAt" | "requestedAt" | "createdAt";
  sortOrder?: "asc" | "desc";
  /**
   * Default: sin dateFrom/dateTo se aplican los ÚLTIMOS 30 DÍAS (regla de la
   * fase de listados). El export a Excel y otros consumidores internos que
   * necesitan TODO el histórico pasan false explícito.
   */
  applyDefaultRange?: boolean;
}

const APPOINTMENT_SORT_FIELDS = ["scheduledAt", "requestedAt", "createdAt"] as const;
const APPOINTMENT_DEFAULT_RANGE_DAYS = 30;

export async function listAppointments(tenantId: string, filters: ListAppointmentsFilters) {
  const where: Prisma.AppointmentWhereInput = { tenantId };

  // Default últimos 30 días: solo cuando el usuario NO indicó ninguna fecha
  // y el caller no lo desactiva (el export a Excel pasa applyDefaultRange=false).
  let dateFrom = filters.dateFrom;
  let dateTo = filters.dateTo;
  const defaultRangeApplied =
    filters.applyDefaultRange !== false && !dateFrom && !dateTo;
  if (defaultRangeApplied) {
    const from = new Date();
    from.setDate(from.getDate() - APPOINTMENT_DEFAULT_RANGE_DAYS);
    dateFrom = from.toISOString().slice(0, 10);
    dateTo = new Date().toISOString().slice(0, 10);
  }

  if (dateFrom || dateTo) {
    where.scheduledAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
    };
  }
  if (filters.status) where.status = filters.status as Prisma.AppointmentWhereInput["status"];
  if (filters.priority)
    where.priority = filters.priority as Prisma.AppointmentWhereInput["priority"];
  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.source) where.source = filters.source as Prisma.AppointmentWhereInput["source"];
  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: "insensitive" } },
      { customerPhone: { contains: filters.search, mode: "insensitive" } },
      { serviceOrProduct: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const page = Math.max(1, filters.page ?? 1);
  // El tope HTTP real es 100 (zod del controller); el margen extra es para
  // consumidores internos como el export a Excel (limit 10k).
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 10_000);
  const sortBy = APPOINTMENT_SORT_FIELDS.includes(filters.sortBy as never)
    ? (filters.sortBy as (typeof APPOINTMENT_SORT_FIELDS)[number])
    : "scheduledAt";
  // Default desc: lo más reciente primero (vista "últimos 30 días")
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ]);

  return {
    items: rows.map(serializeAppointment),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    filters: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, defaultRangeApplied },
  };
}

export interface AppointmentInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  scheduledAt: Date;
  serviceOrProduct: string;
  catalogItemId?: string | null;
  notes?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH" | "FOLLOW_UP";
  source?: "AI" | "MANUAL" | "WHATSAPP" | "ADMIN";
  agentId?: string | null;
  conversationId?: string | null;
  status?: "PENDING" | "CONFIRMED";
}

export async function createAppointment(tenantId: string, input: AppointmentInput) {
  if (input.catalogItemId) {
    const item = await prisma.product.findFirst({
      where: { id: input.catalogItemId, tenantId },
    });
    if (!item) throw new AppError("El ítem del catálogo indicado no existe", 400);
  }
  if (input.conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: input.conversationId, tenantId },
    });
    if (!conversation) throw new AppError("La conversación indicada no existe", 400);
  }

  const status = input.status ?? "PENDING";

  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      customerEmail: input.customerEmail?.trim() || null,
      scheduledAt: input.scheduledAt,
      serviceOrProduct: input.serviceOrProduct.trim(),
      catalogItemId: input.catalogItemId ?? null,
      notes: input.notes?.trim() || null,
      priority: input.priority ?? "NORMAL",
      source: input.source ?? "MANUAL",
      agentId: input.agentId ?? null,
      conversationId: input.conversationId ?? null,
      status,
      confirmationStatus: status === "CONFIRMED" ? "CONFIRMED" : "UNCONFIRMED",
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
    },
    include: appointmentInclude,
  });

  const { fecha, hora } = formatScheduledAt(appointment.scheduledAt);
  await logAppointmentEvent({
    tenantId,
    conversationId: appointment.conversationId,
    text: `📅 Cita ${status === "CONFIRMED" ? "confirmada" : "registrada"}: ${appointment.serviceOrProduct} — ${fecha} a las ${hora} (${appointment.customerName})`,
  });

  return serializeAppointment(appointment);
}

export async function getAppointment(tenantId: string, id: string) {
  return serializeAppointment(await getOwnAppointment(tenantId, id));
}

export async function updateAppointment(
  tenantId: string,
  id: string,
  input: Partial<AppointmentInput>
) {
  await getOwnAppointment(tenantId, id);

  if (input.catalogItemId) {
    const item = await prisma.product.findFirst({
      where: { id: input.catalogItemId, tenantId },
    });
    if (!item) throw new AppError("El ítem del catálogo indicado no existe", 400);
  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      ...(input.customerName !== undefined ? { customerName: input.customerName.trim() } : {}),
      ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone.trim() } : {}),
      ...(input.customerEmail !== undefined
        ? { customerEmail: input.customerEmail?.trim() || null }
        : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.serviceOrProduct !== undefined
        ? { serviceOrProduct: input.serviceOrProduct.trim() }
        : {}),
      ...(input.catalogItemId !== undefined ? { catalogItemId: input.catalogItemId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
    include: appointmentInclude,
  });

  return serializeAppointment(appointment);
}

// ─── Transiciones del gestor de citas ────────────────────────────────────────

export async function confirmAppointment(tenantId: string, id: string) {
  const existing = await getOwnAppointment(tenantId, id);
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    throw new AppError(`No se puede confirmar una cita ${existing.status === "CANCELLED" ? "cancelada" : "completada"}`, 409);
  }
  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status: "CONFIRMED", confirmationStatus: "CONFIRMED", confirmedAt: new Date() },
    include: appointmentInclude,
  });
  const { fecha, hora } = formatScheduledAt(appointment.scheduledAt);
  await logAppointmentEvent({
    tenantId,
    conversationId: appointment.conversationId,
    text: `✅ Cita confirmada: ${appointment.serviceOrProduct} — ${fecha} a las ${hora}`,
  });
  return serializeAppointment(appointment);
}

export async function cancelAppointment(tenantId: string, id: string, reason?: string) {
  const existing = await getOwnAppointment(tenantId, id);
  if (existing.status === "COMPLETED") {
    throw new AppError("No se puede cancelar una cita completada", 409);
  }
  const note = reason?.trim()
    ? `${existing.notes ? `${existing.notes}\n` : ""}[Cancelación] ${reason.trim()}`
    : existing.notes;
  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      status: "CANCELLED",
      confirmationStatus: "DECLINED",
      cancelledAt: new Date(),
      notes: note,
    },
    include: appointmentInclude,
  });
  await logAppointmentEvent({
    tenantId,
    conversationId: appointment.conversationId,
    text: `❌ Cita cancelada: ${appointment.serviceOrProduct} (${appointment.customerName})`,
  });
  return serializeAppointment(appointment);
}

export async function rescheduleAppointment(
  tenantId: string,
  id: string,
  newScheduledAt: Date,
  note?: string
) {
  const existing = await getOwnAppointment(tenantId, id);
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    throw new AppError("No se puede posponer una cita cancelada o completada", 409);
  }

  const { fecha: oldFecha, hora: oldHora } = formatScheduledAt(existing.scheduledAt);
  const autoNote = `[Pospuesta] Antes: ${oldFecha} ${oldHora}${note?.trim() ? ` — ${note.trim()}` : ""}`;

  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      scheduledAt: newScheduledAt,
      status: "RESCHEDULED",
      priority: "FOLLOW_UP",
      rescheduledAt: new Date(),
      confirmationStatus: "UNCONFIRMED",
      // Al moverse la fecha, el recordatorio anterior deja de contar.
      lastReminderAt: null,
      notes: `${existing.notes ? `${existing.notes}\n` : ""}${autoNote}`,
    },
    include: appointmentInclude,
  });
  const { fecha, hora } = formatScheduledAt(appointment.scheduledAt);
  await logAppointmentEvent({
    tenantId,
    conversationId: appointment.conversationId,
    text: `🔁 Cita pospuesta: ${appointment.serviceOrProduct} — nueva fecha ${fecha} a las ${hora}`,
  });
  return serializeAppointment(appointment);
}

export async function markNoShow(tenantId: string, id: string) {
  const existing = await getOwnAppointment(tenantId, id);
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    throw new AppError("Esta cita ya fue cerrada", 409);
  }
  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status: "NO_SHOW", priority: "FOLLOW_UP" },
    include: appointmentInclude,
  });
  await logAppointmentEvent({
    tenantId,
    conversationId: appointment.conversationId,
    text: `⚠️ Cliente no asistió a la cita: ${appointment.serviceOrProduct} (${appointment.customerName})`,
  });
  return serializeAppointment(appointment);
}

export async function completeAppointment(tenantId: string, id: string) {
  const existing = await getOwnAppointment(tenantId, id);
  if (existing.status === "CANCELLED") {
    throw new AppError("No se puede completar una cita cancelada", 409);
  }
  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status: "COMPLETED" },
    include: appointmentInclude,
  });
  await logAppointmentEvent({
    tenantId,
    conversationId: appointment.conversationId,
    text: `🎉 Cita completada: ${appointment.serviceOrProduct} (${appointment.customerName})`,
  });
  return serializeAppointment(appointment);
}

// ─── Recordatorios ───────────────────────────────────────────────────────────

// ─── Disponibilidad ──────────────────────────────────────────────────────────

const WEEKDAY_BY_INDEX: WeekDay[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Día de semana y "HH:mm" de una fecha, expresados en la zona horaria dada. */
function localDayAndTime(date: Date, timezone: string): { day: WeekDay; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  // hour12:false puede devolver "24" para medianoche en algunos runtimes
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day: WEEKDAY_BY_INDEX[dayIdx] ?? "monday", time: `${hour}:${get("minute")}` };
}

export type AvailabilityCheck =
  | { ok: true; reason: null }
  | { ok: false; reason: "PAST" | "OUTSIDE_HOURS" | "SLOT_FULL"; detail: string };

/**
 * Valida un horario contra la configuración del negocio:
 * pasado → rechaza; fuera del horario semanal → rechaza; slot lleno
 * (citas activas dentro de la duración+buffer) → rechaza.
 * Sin weeklySchedule configurado solo se valida pasado y choque de slot.
 */
export async function checkSlotAvailability(
  tenantId: string,
  scheduledAt: Date,
  settingsIn?: AppointmentSettings
): Promise<AvailabilityCheck> {
  const settings = settingsIn ?? (await getAppointmentSettings(tenantId));

  if (scheduledAt.getTime() < Date.now() - 5 * 60 * 1000) {
    return { ok: false, reason: "PAST", detail: "La fecha está en el pasado" };
  }

  if (settings.weeklySchedule) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const timezone = tenant?.timezone || "America/Santo_Domingo";
    const { day, time } = localDayAndTime(scheduledAt, timezone);
    const ranges = settings.weeklySchedule[day] ?? [];
    const inRange = ranges.some((r) => r.start <= time && time < r.end);
    if (!inRange) {
      return {
        ok: false,
        reason: "OUTSIDE_HOURS",
        detail:
          ranges.length > 0
            ? `El ${WEEKDAY_LABELS[day]} atendemos de ${ranges
                .map((r) => `${r.start} a ${r.end}`)
                .join(" y de ")}`
            : `Los ${WEEKDAY_LABELS[day]} no hay atención`,
      };
    }
  }

  // Choque de slot: citas activas dentro de la ventana duración+buffer
  const windowMs = (settings.slotDurationMinutes + settings.bufferMinutes) * 60 * 1000;
  const overlapping = await prisma.appointment.count({
    where: {
      tenantId,
      status: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
      scheduledAt: {
        gt: new Date(scheduledAt.getTime() - windowMs),
        lt: new Date(scheduledAt.getTime() + windowMs),
      },
    },
  });
  if (overlapping >= settings.maxAppointmentsPerSlot) {
    return {
      ok: false,
      reason: "SLOT_FULL",
      detail: "Ese horario ya está reservado",
    };
  }

  return { ok: true, reason: null };
}

/** Resumen del horario semanal en texto (para el prompt del agente). */
export function describeAvailability(settings: AppointmentSettings): string {
  if (!settings.weeklySchedule) {
    return "El negocio no ha configurado horario de citas: registra la solicitud como pendiente y aclara que el negocio confirmará el horario.";
  }
  const lines = WEEKDAY_BY_INDEX
    // lunes primero
    .slice(1)
    .concat(WEEKDAY_BY_INDEX[0])
    .map((day) => {
      const ranges = settings.weeklySchedule?.[day] ?? [];
      if (ranges.length === 0) return null;
      return `- ${WEEKDAY_LABELS[day]}: ${ranges.map((r) => `${r.start}–${r.end}`).join(", ")}`;
    })
    .filter(Boolean);
  if (lines.length === 0) {
    return "El negocio no tiene días de atención configurados para citas.";
  }
  return `Horario de citas del negocio:\n${lines.join("\n")}\nDuración por cita: ${settings.slotDurationMinutes} min. Máximo ${settings.maxAppointmentsPerSlot} cita(s) por horario.`;
}

function renderReminderTemplate(
  template: string,
  data: { nombre: string; servicio: string; fecha: string; hora: string; negocio: string }
): string {
  return template
    .replace(/\{\{\s*nombre\s*\}\}/gi, data.nombre)
    .replace(/\{\{\s*servicio\s*\}\}/gi, data.servicio)
    .replace(/\{\{\s*fecha\s*\}\}/gi, data.fecha)
    .replace(/\{\{\s*hora\s*\}\}/gi, data.hora)
    .replace(/\{\{\s*negocio\s*\}\}/gi, data.negocio);
}

/**
 * Procesa recordatorios pendientes del tenant: citas PENDING/CONFIRMED cuya
 * fecha cae dentro de la ventana configurada y que aún no recibieron aviso.
 * Diseñado para dispararse manualmente (o desde un cron externo) en esta fase.
 */
export async function processReminders(tenantId: string) {
  const settings = await getAppointmentSettings(tenantId);
  if (!settings.reminderEnabled) {
    return { enabled: false, candidates: 0, sent: [], skipped: [] };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, timezone: true },
  });

  const now = new Date();
  const windowEnd = new Date(now.getTime() + settings.reminderHoursBefore * 60 * 60 * 1000);

  const candidates = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
      scheduledAt: { gt: now, lte: windowEnd },
      lastReminderAt: null,
    },
    include: { agent: { select: { whatsappPhoneNumberId: true } } },
    orderBy: { scheduledAt: "asc" },
  });

  const sent: { id: string; customerName: string; scheduledAt: Date }[] = [];
  const skipped: { id: string; customerName: string; reason: string }[] = [];

  for (const appointment of candidates) {
    const { fecha, hora } = formatScheduledAt(
      appointment.scheduledAt,
      tenant?.timezone || "America/Santo_Domingo"
    );
    const text = renderReminderTemplate(settings.reminderMessageTemplate, {
      nombre: appointment.customerName,
      servicio: appointment.serviceOrProduct,
      fecha,
      hora,
      negocio: tenant?.name ?? "",
    });

    try {
      // Token del tenant si el número tiene integración propia (multi-tenant)
      const credentials = appointment.agent?.whatsappPhoneNumberId
        ? await resolveSendCredentials(appointment.agent.whatsappPhoneNumberId)
        : null;
      await sendWhatsappTextMessage({
        to: appointment.customerPhone,
        text,
        phoneNumberId: appointment.agent?.whatsappPhoneNumberId ?? undefined,
        credentials: credentials ?? undefined,
      });
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { lastReminderAt: new Date() },
      });
      await logAppointmentEvent({
        tenantId,
        conversationId: appointment.conversationId,
        text: `🔔 Recordatorio de cita enviado a ${appointment.customerName}`,
      });
      sent.push({
        id: appointment.id,
        customerName: appointment.customerName,
        scheduledAt: appointment.scheduledAt,
      });
      logger.info(`[REMINDERS] enviado a ${appointment.customerPhone} (cita ${appointment.id})`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Error enviando WhatsApp";
      skipped.push({ id: appointment.id, customerName: appointment.customerName, reason });
      logger.warn(`[REMINDERS] fallo cita ${appointment.id}: ${reason}`);
    }
  }

  return { enabled: true, candidates: candidates.length, sent, skipped };
}
