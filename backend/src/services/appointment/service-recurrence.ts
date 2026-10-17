/**
 * Política de recurrencia de un servicio (Módulo 3).
 *
 * Módulo PURO (sin Prisma, sin red): calcula CUÁNDO tocaría repetir un
 * servicio. Se puede testear sin base de datos y no puede convertirse en un
 * segundo motor de automatizaciones — solo produce una fecha; quien programa
 * el recordatorio es el Automation Core (Módulo 0).
 *
 * Regla dura del módulo: aquí NO se decide ningún plazo comercial. Si el
 * negocio no configuró intervalo, `resolveNextRecommendedAt` devuelve null y no
 * se programa nada. Nunca se deduce la recurrencia del NOMBRE del servicio
 * (`if (name.includes("keratina"))` está prohibido): se lee de la configuración
 * del ítem del catálogo, identificado por id.
 */
import {
  DEFAULT_TIMEZONE,
  getZonedParts,
  zonedTimeToUtc,
} from "../../utils/timezone.js";

export type RecurrenceUnit = "DAYS" | "WEEKS" | "MONTHS";

export const RECURRENCE_UNITS: RecurrenceUnit[] = ["DAYS", "WEEKS", "MONTHS"];

/** Tope técnico antiabuso, no una política comercial: 10 años. */
export const MAX_RECURRENCE_DAYS = 3650;

export interface RecurrencePolicy {
  recurrenceEnabled: boolean;
  recurrenceInterval: number | null;
  recurrenceUnit: RecurrenceUnit | null;
}

export function isRecurrenceUnit(value: unknown): value is RecurrenceUnit {
  return typeof value === "string" && (RECURRENCE_UNITS as string[]).includes(value);
}

/** La política solo aplica si está encendida Y tiene intervalo y unidad reales. */
export function hasActiveRecurrence(policy: RecurrencePolicy | null | undefined): boolean {
  return Boolean(
    policy?.recurrenceEnabled &&
      policy.recurrenceInterval &&
      policy.recurrenceInterval > 0 &&
      isRecurrenceUnit(policy.recurrenceUnit)
  );
}

/**
 * Valida una política antes de guardarla. Devuelve el mensaje de error para el
 * usuario, o null si es correcta.
 */
export function validateRecurrencePolicy(policy: RecurrencePolicy): string | null {
  if (!policy.recurrenceEnabled) return null;
  if (!policy.recurrenceInterval || policy.recurrenceInterval < 1) {
    return "Indica cada cuánto se repite el servicio (un número mayor que cero).";
  }
  if (!isRecurrenceUnit(policy.recurrenceUnit)) {
    return "Elige si el intervalo se mide en días, semanas o meses.";
  }
  const days = approximateDays(policy.recurrenceInterval, policy.recurrenceUnit);
  if (days > MAX_RECURRENCE_DAYS) {
    return "El intervalo de recurrencia no puede superar los 10 años.";
  }
  return null;
}

/** Solo para validar topes y ordenar; NO se usa para calcular la fecha real. */
function approximateDays(interval: number, unit: RecurrenceUnit): number {
  if (unit === "DAYS") return interval;
  if (unit === "WEEKS") return interval * 7;
  return interval * 31;
}

/**
 * Suma meses de calendario sin desbordar el mes corto.
 *
 * "31 de enero + 1 mes" da 28/29 de febrero, no el 3 de marzo, que es lo que
 * espera cualquier persona que agenda un mantenimiento mensual.
 */
function addMonthsClamped(
  parts: { year: number; month: number; day: number },
  months: number
): { year: number; month: number; day: number } {
  const zeroBased = parts.month - 1 + months;
  const year = parts.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12; // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { year, month: month + 1, day: Math.min(parts.day, lastDay) };
}

export interface NextRecommendedInput {
  policy: RecurrencePolicy;
  /** Cuándo se realizó el servicio (instante UTC). */
  performedAt: Date;
  /** Zona del negocio: el intervalo es comercial, no de servidor. */
  timezone?: string;
  /**
   * Hora local a la que cae la fecha recomendada ("HH:mm"). Sin esto, un
   * servicio hecho a las 19:30 recomendaría volver a las 19:30 de un día en el
   * que quizá ya está cerrado. Default 10:00, hora de negocio razonable, y
   * cualquier envío real vuelve a pasar por la programación de su regla.
   */
  localTime?: { hour: number; minute: number };
}

/**
 * Fecha recomendada para el próximo servicio, o null si el servicio no tiene
 * recurrencia configurada.
 *
 * El intervalo se cuenta en el CALENDARIO del negocio, no sumando milisegundos:
 * "cada 1 mes" no son 30 días fijos y "cada 40 días" tiene que seguir cayendo a
 * la misma hora local aunque en medio cambie el horario de verano.
 */
export function resolveNextRecommendedAt(input: NextRecommendedInput): Date | null {
  const { policy } = input;
  if (!hasActiveRecurrence(policy)) return null;

  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const interval = policy.recurrenceInterval as number;
  const unit = policy.recurrenceUnit as RecurrenceUnit;
  const time = input.localTime ?? { hour: 10, minute: 0 };

  const parts = getZonedParts(input.performedAt, timezone);

  const target =
    unit === "MONTHS"
      ? addMonthsClamped(parts, interval)
      : (() => {
          const days = unit === "WEEKS" ? interval * 7 : interval;
          // Se avanza sobre el calendario UTC del día local y luego se vuelve a
          // anclar a la hora de pared: así el resultado no se corre una hora
          // cuando el intervalo cruza un cambio de horario.
          const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
          return {
            year: shifted.getUTCFullYear(),
            month: shifted.getUTCMonth() + 1,
            day: shifted.getUTCDate(),
          };
        })();

  return zonedTimeToUtc(
    { ...target, hour: time.hour, minute: time.minute },
    timezone
  );
}

/**
 * Identidad de una recurrencia dentro del Automation Core.
 *
 * El motor identifica los jobs por (entityType, entityId). Una recurrencia no
 * es "del cliente" ni "del servicio": es de la PAREJA. Si fuese solo del
 * cliente, repetir la coloración cancelaría también el mantenimiento de
 * keratina; si fuese solo del servicio, la clienta A pisaría a la clienta B.
 *
 * Por eso el evento SERVICE_USED viaja con este id compuesto y con
 * `cancelByCustomer: false`.
 */
export function recurrenceEntityId(customerId: string, serviceId: string): string {
  return `${customerId}:${serviceId}`;
}

/** Descompone el id compuesto (para la UI de seguimientos). */
export function parseRecurrenceEntityId(
  entityId: string
): { customerId: string; serviceId: string } | null {
  const separator = entityId.indexOf(":");
  if (separator <= 0 || separator === entityId.length - 1) return null;
  return {
    customerId: entityId.slice(0, separator),
    serviceId: entityId.slice(separator + 1),
  };
}

/** Texto legible de la política ("cada 40 días"). Se usa en la UI y los logs. */
export function describeRecurrence(policy: RecurrencePolicy): string | null {
  if (!hasActiveRecurrence(policy)) return null;
  const interval = policy.recurrenceInterval as number;
  const unit = policy.recurrenceUnit as RecurrenceUnit;
  const labels: Record<RecurrenceUnit, [string, string]> = {
    DAYS: ["día", "días"],
    WEEKS: ["semana", "semanas"],
    MONTHS: ["mes", "meses"],
  };
  const [singular, plural] = labels[unit];
  return `cada ${interval} ${interval === 1 ? singular : plural}`;
}
