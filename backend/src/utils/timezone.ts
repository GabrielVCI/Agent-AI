/**
 * Helpers de fecha "timezone-aware" sin dependencias externas.
 *
 * Regla del proyecto: TODO se persiste en UTC (Prisma DateTime) y los cálculos
 * comerciales (hora de envío, cumpleaños, ventanas de día) se hacen en la
 * zona horaria del tenant (Tenant.timezone, default America/Santo_Domingo).
 *
 * No comparamos nunca con la hora local del SERVIDOR: Railway corre en UTC y
 * el negocio puede estar en cualquier zona.
 */

export const DEFAULT_TIMEZONE = "America/Santo_Domingo";

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Descompone un instante UTC en sus componentes de calendario en `timeZone`. */
export function getZonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string): number => {
    const value = parts.find((p) => p.type === type)?.value ?? "0";
    return Number(value);
  };
  // hour12:false devuelve "24" para medianoche en algunos runtimes.
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset de la zona respecto de UTC (ms) VIGENTE en ese instante (DST incluido). */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Los ms no los devuelve el formatter: se restauran para no perder precisión.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Convierte una hora de pared ("2026-09-15 09:00 en America/Santo_Domingo")
 * al instante UTC correspondiente.
 *
 * Doble pasada: la primera estima el offset y la segunda lo corrige en los
 * bordes de DST (donde el offset del instante estimado difiere del real).
 */
export function zonedTimeToUtc(
  input: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  const wallClock = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour ?? 0,
    input.minute ?? 0,
    input.second ?? 0
  );
  const firstGuess = new Date(wallClock - zoneOffsetMs(new Date(wallClock), timeZone));
  const correctedOffset = zoneOffsetMs(firstGuess, timeZone);
  return new Date(wallClock - correctedOffset);
}

/** Parsea "HH:mm" a {hour, minute}. Devuelve null si el formato no es válido. */
export function parseLocalTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * Mueve un instante a la siguiente ocurrencia de una hora local ("HH:mm") en la
 * zona del tenant. Si ese mismo día la hora ya pasó, salta al día siguiente.
 * Se usa para no despertar a un cliente a las 3am por un job vencido de noche.
 */
export function atLocalTimeOnOrAfter(
  from: Date,
  localTime: string,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  const time = parseLocalTime(localTime);
  if (!time) return from;

  const parts = getZonedParts(from, timeZone);
  const sameDay = zonedTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day, hour: time.hour, minute: time.minute },
    timeZone
  );
  if (sameDay.getTime() >= from.getTime()) return sameDay;

  // Día siguiente: se recalcula sobre el calendario local (no sumando 24h,
  // que en un cambio de DST daría una hora distinta).
  const nextDayParts = getZonedParts(new Date(from.getTime() + 24 * 60 * 60 * 1000), timeZone);
  return zonedTimeToUtc(
    {
      year: nextDayParts.year,
      month: nextDayParts.month,
      day: nextDayParts.day,
      hour: time.hour,
      minute: time.minute,
    },
    timeZone
  );
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Próxima ocurrencia anual de un mes/día (cumpleaños) a una hora local dada.
 *
 * Decisión documentada (29 de febrero): en años NO bisiestos se celebra el
 * 28 de febrero. Se elige la fecha anterior para no cruzar de mes y mantener
 * el saludo dentro de febrero.
 */
export function nextAnnualOccurrence(
  input: { month: number; day: number; localTime?: string },
  from: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  const time = parseLocalTime(input.localTime ?? "09:00") ?? { hour: 9, minute: 0 };
  const nowParts = getZonedParts(from, timeZone);

  const buildFor = (year: number): Date => {
    let day = input.day;
    if (input.month === 2 && input.day === 29 && !isLeapYear(year)) day = 28;
    return zonedTimeToUtc(
      { year, month: input.month, day, hour: time.hour, minute: time.minute },
      timeZone
    );
  };

  const thisYear = buildFor(nowParts.year);
  if (thisYear.getTime() > from.getTime()) return thisYear;
  return buildFor(nowParts.year + 1);
}

/** Inicio del día (00:00 hora local del tenant) del instante dado, en UTC. */
export function startOfLocalDay(date: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  const p = getZonedParts(date, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** Clave estable "YYYY-MM-DD" del día local: sirve para idempotencia diaria. */
export function localDayKey(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
