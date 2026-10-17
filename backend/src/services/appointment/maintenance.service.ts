/**
 * Cronograma de mantenimiento (Módulo 4).
 *
 * Responde a la pregunta que el negocio hace de verdad: **¿a quién le toca
 * volver, y quién ya se pasó de fecha?** Cruza el historial de servicios
 * (Módulo 3) con la política de recurrencia del catálogo.
 *
 * ── Dos decisiones que hay que entender antes de tocar esto ──────────────────
 *
 * 1. La fecha se CALCULA con la política ACTUAL del catálogo, no se lee de
 *    `AppointmentLine.nextRecommendedAt`.
 *
 *    `nextRecommendedAt` es lo que se prometió el día que se cerró la cita, y
 *    es la verdad del recordatorio YA programado. El cronograma es otra cosa:
 *    una vista de planificación. Si el negocio configura hoy "Tinte cada 30
 *    días", espera ver de inmediato a quien se tiñó hace 45 — y con el valor
 *    almacenado esa gente no aparecería nunca, porque sus visitas se cerraron
 *    cuando el servicio aún no tenía recurrencia.
 *
 *    Consecuencia asumida: si se cambia el intervalo de 30 a 40 días, el
 *    cronograma se mueve al instante y el recordatorio ya programado no. Es
 *    deliberado y la UI lo explica.
 *
 * 2. Solo cuenta la ÚLTIMA vez que ese cliente recibió ese servicio
 *    (`DISTINCT ON`). Quien se tiñe cada mes tiene una fila, no doce.
 *
 * Todo el SQL va parametrizado con `Prisma.sql`: nunca se concatena un valor
 * del usuario dentro de la consulta.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { DEFAULT_TIMEZONE, startOfLocalDay } from "../../utils/timezone.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MaintenanceStatus = "OVERDUE" | "DUE_TODAY" | "UPCOMING";

export interface MaintenanceEntry {
  /** Id de la línea de la última visita. Sirve de clave estable en la UI. */
  id: string;
  customerId: string;
  customerName: string;
  phoneDisplay: string;
  serviceId: string;
  serviceName: string;
  itemType: "PRODUCT" | "SERVICE";
  /** Última vez que se le hizo ese servicio (o se le vendió ese producto). */
  lastPerformedAt: Date;
  /** Cuándo le toca, según la política ACTUAL del catálogo. */
  dueAt: Date;
  status: MaintenanceStatus;
  /** Días de retraso. 0 si aún no vence. */
  overdueDays: number;
  /** Días que faltan. 0 si ya venció. */
  daysUntilDue: number;
  /** true = ya tiene una cita futura para ese servicio: no hay que llamarle. */
  hasUpcomingAppointment: boolean;
  recurrenceLabel: string;
}

export interface MaintenanceFilters {
  serviceId?: string;
  status?: MaintenanceStatus;
  /** "Vencidos hace 40 días o más". Es el caso de uso del retoque de color. */
  overdueMinDays?: number;
  search?: string;
  /**
   * Incluir a quien YA tiene cita agendada para ese servicio. Por defecto NO:
   * este listado es "a quién hay que contactar", y llamar a alguien que ya
   * tiene cita es justo el mensaje absurdo que hay que evitar.
   */
  includeScheduled?: boolean;
  page?: number;
  limit?: number;
}

/** Fila cruda que devuelve PostgreSQL. */
interface ScheduleRow {
  id: string;
  customerId: string;
  customerName: string | null;
  phone: string;
  phoneNormalized: string | null;
  serviceId: string;
  serviceName: string;
  itemType: "PRODUCT" | "SERVICE";
  lastPerformedAt: Date;
  dueAt: Date;
  hasUpcomingAppointment: boolean;
  recurrenceInterval: number;
  recurrenceUnit: "DAYS" | "WEEKS" | "MONTHS";
  total: bigint;
}

const UNIT_LABELS: Record<string, [string, string]> = {
  DAYS: ["día", "días"],
  WEEKS: ["semana", "semanas"],
  MONTHS: ["mes", "meses"],
};

function recurrenceLabelOf(interval: number, unit: string): string {
  const [singular, plural] = UNIT_LABELS[unit] ?? ["día", "días"];
  return `cada ${interval} ${interval === 1 ? singular : plural}`;
}

async function tenantTimezone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  return tenant?.timezone || DEFAULT_TIMEZONE;
}

/**
 * Fragmento SQL compartido por el listado y los contadores.
 *
 * `DISTINCT ON (customerId, productId)` ordenado por `performedAt DESC` deja
 * exactamente la última visita de cada pareja cliente+servicio. Es específico
 * de PostgreSQL a propósito: hacerlo en JavaScript obligaría a traerse todo el
 * historial del tenant para descartar el 90 %.
 *
 * `make_interval` respeta el calendario: "31 de enero + 1 mes" da el 28/29 de
 * febrero, igual que el cálculo del Módulo 3.
 */
function baseQuery(tenantId: string): Prisma.Sql {
  return Prisma.sql`
    WITH latest AS (
      SELECT DISTINCT ON (l."customerId", l."productId")
        l."id",
        l."customerId",
        l."productId",
        l."performedAt"
      FROM "AppointmentLine" l
      WHERE l."tenantId" = ${tenantId}
        AND l."status" = 'PERFORMED'
        AND l."customerId" IS NOT NULL
        AND l."productId" IS NOT NULL
        AND l."kind" <> 'PRODUCT_USED'
      ORDER BY l."customerId", l."productId", l."performedAt" DESC
    )
    SELECT
      latest."id",
      latest."customerId",
      latest."performedAt"                AS "lastPerformedAt",
      c."name"                            AS "customerName",
      c."phone",
      c."phoneNormalized",
      p."id"                              AS "serviceId",
      p."name"                            AS "serviceName",
      p."itemType"::text                  AS "itemType",
      p."recurrenceInterval"              AS "recurrenceInterval",
      p."recurrenceUnit"::text            AS "recurrenceUnit",
      latest."performedAt" + make_interval(
        days   => CASE WHEN p."recurrenceUnit" = 'DAYS'   THEN p."recurrenceInterval" ELSE 0 END,
        weeks  => CASE WHEN p."recurrenceUnit" = 'WEEKS'  THEN p."recurrenceInterval" ELSE 0 END,
        months => CASE WHEN p."recurrenceUnit" = 'MONTHS' THEN p."recurrenceInterval" ELSE 0 END
      )                                   AS "dueAt",
      EXISTS (
        SELECT 1 FROM "Appointment" a
        WHERE a."tenantId" = ${tenantId}
          AND a."customerId" = latest."customerId"
          AND a."status" IN ('PENDING', 'CONFIRMED', 'RESCHEDULED')
          AND a."scheduledAt" >= NOW()
          AND (
            a."catalogItemId" = latest."productId"
            OR EXISTS (
              SELECT 1 FROM "AppointmentLine" al
              WHERE al."appointmentId" = a."id"
                AND al."productId" = latest."productId"
            )
          )
      )                                   AS "hasUpcomingAppointment"
    FROM latest
    JOIN "Customer" c
      ON c."id" = latest."customerId" AND c."tenantId" = ${tenantId}
    JOIN "Product" p
      ON p."id" = latest."productId" AND p."tenantId" = ${tenantId}
    WHERE c."stage" <> 'ARCHIVED'
      -- Sin política activa no hay mantenimiento que planificar. Apagar la
      -- recurrencia de un servicio lo saca del cronograma al instante.
      AND p."recurrenceEnabled" = TRUE
      AND p."recurrenceInterval" IS NOT NULL
      AND p."recurrenceInterval" > 0
      AND p."recurrenceUnit" IS NOT NULL
  `;
}

/**
 * Cronograma paginado.
 *
 * Ordena por fecha de vencimiento ascendente: lo más atrasado primero, que es
 * a quien hay que llamar hoy.
 */
export async function listMaintenanceSchedule(
  tenantId: string,
  filters: MaintenanceFilters = {}
): Promise<{
  items: MaintenanceEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  filters: Record<string, unknown>;
}> {
  const timezone = await tenantTimezone(tenantId);
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);

  // "Hoy" es el día del NEGOCIO, no el del servidor: un cronograma que cambia
  // de estado a medianoche UTC no le sirve a nadie.
  const startToday = startOfLocalDay(new Date(), timezone);
  const startTomorrow = new Date(startToday.getTime() + DAY_MS);

  const conditions: Prisma.Sql[] = [];

  if (filters.serviceId) {
    conditions.push(Prisma.sql`"serviceId" = ${filters.serviceId}`);
  }
  if (!filters.includeScheduled) {
    conditions.push(Prisma.sql`"hasUpcomingAppointment" = FALSE`);
  }
  if (filters.status === "OVERDUE") {
    conditions.push(Prisma.sql`"dueAt" < ${startToday}`);
  } else if (filters.status === "DUE_TODAY") {
    conditions.push(Prisma.sql`"dueAt" >= ${startToday} AND "dueAt" < ${startTomorrow}`);
  } else if (filters.status === "UPCOMING") {
    conditions.push(Prisma.sql`"dueAt" >= ${startTomorrow}`);
  }
  if (filters.overdueMinDays && filters.overdueMinDays > 0) {
    const cutoff = new Date(startToday.getTime() - filters.overdueMinDays * DAY_MS);
    // "Vencido hace 40 días o más" = le tocaba el día del corte o antes.
    conditions.push(Prisma.sql`"dueAt" <= ${cutoff}`);
  }

  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      Prisma.sql`("customerName" ILIKE ${like} OR "phone" ILIKE ${like} OR "serviceName" ILIKE ${like})`
    );
  }

  const filterClause =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

  // El total viaja en la misma consulta (window function): así el conteo usa
  // exactamente los mismos filtros que las filas y no puede desviarse.
  const rows = await prisma.$queryRaw<ScheduleRow[]>(Prisma.sql`
    SELECT *, COUNT(*) OVER () AS "total"
    FROM (${baseQuery(tenantId)}) AS schedule
    ${filterClause}
    ORDER BY "dueAt" ASC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `);

  const total = rows.length > 0 ? Number(rows[0].total) : 0;

  return {
    items: rows.map((row) => toEntry(row, startToday, startTomorrow)),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    filters: {
      serviceId: filters.serviceId ?? null,
      status: filters.status ?? null,
      overdueMinDays: filters.overdueMinDays ?? null,
      includeScheduled: filters.includeScheduled ?? false,
      search: search ?? null,
    },
  };
}

function toEntry(row: ScheduleRow, startToday: Date, startTomorrow: Date): MaintenanceEntry {
  const dueAt = row.dueAt;
  const status: MaintenanceStatus =
    dueAt < startToday ? "OVERDUE" : dueAt < startTomorrow ? "DUE_TODAY" : "UPCOMING";

  const overdueDays =
    status === "OVERDUE" ? Math.floor((startToday.getTime() - dueAt.getTime()) / DAY_MS) + 1 : 0;
  const daysUntilDue =
    status === "UPCOMING" ? Math.ceil((dueAt.getTime() - startTomorrow.getTime()) / DAY_MS) + 1 : 0;

  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName?.trim() || "Cliente",
    phoneDisplay: row.phoneNormalized ?? row.phone,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    itemType: row.itemType,
    lastPerformedAt: row.lastPerformedAt,
    dueAt,
    status,
    overdueDays,
    daysUntilDue,
    hasUpcomingAppointment: row.hasUpcomingAppointment,
    recurrenceLabel: recurrenceLabelOf(row.recurrenceInterval, row.recurrenceUnit),
  };
}

/**
 * Contadores del encabezado. Se calculan con la MISMA consulta base que el
 * listado para que las cifras y las filas nunca se contradigan.
 */
export async function getMaintenanceCounters(tenantId: string): Promise<{
  overdue: number;
  dueToday: number;
  upcoming: number;
  scheduled: number;
}> {
  const timezone = await tenantTimezone(tenantId);
  const startToday = startOfLocalDay(new Date(), timezone);
  const startTomorrow = new Date(startToday.getTime() + DAY_MS);

  const rows = await prisma.$queryRaw<
    { overdue: bigint; dueToday: bigint; upcoming: bigint; scheduled: bigint }[]
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE "dueAt" < ${startToday} AND "hasUpcomingAppointment" = FALSE
      ) AS "overdue",
      COUNT(*) FILTER (
        WHERE "dueAt" >= ${startToday} AND "dueAt" < ${startTomorrow}
          AND "hasUpcomingAppointment" = FALSE
      ) AS "dueToday",
      COUNT(*) FILTER (
        WHERE "dueAt" >= ${startTomorrow} AND "hasUpcomingAppointment" = FALSE
      ) AS "upcoming",
      -- Ya tienen cita: no hay que contactarles, pero saber cuántos son evita
      -- pensar que el cronograma "perdió" gente.
      COUNT(*) FILTER (WHERE "hasUpcomingAppointment" = TRUE) AS "scheduled"
    FROM (${baseQuery(tenantId)}) AS schedule
  `);

  const row = rows[0];
  return {
    overdue: Number(row?.overdue ?? 0),
    dueToday: Number(row?.dueToday ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
    scheduled: Number(row?.scheduled ?? 0),
  };
}

/**
 * Servicios con recurrencia configurada, para el filtro del cronograma.
 *
 * Solo se ofrecen los que de verdad generan mantenimiento: un desplegable con
 * todo el catálogo haría creer que falta gente cuando en realidad ese servicio
 * no se repite.
 */
export async function listMaintenanceServices(tenantId: string): Promise<
  { id: string; name: string; itemType: "PRODUCT" | "SERVICE"; recurrenceLabel: string }[]
> {
  const rows = await prisma.product.findMany({
    where: {
      tenantId,
      recurrenceEnabled: true,
      recurrenceInterval: { gt: 0 },
      NOT: { recurrenceUnit: null },
    },
    select: {
      id: true,
      name: true,
      itemType: true,
      recurrenceInterval: true,
      recurrenceUnit: true,
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    itemType: row.itemType,
    recurrenceLabel: recurrenceLabelOf(
      row.recurrenceInterval as number,
      row.recurrenceUnit as string
    ),
  }));
}
