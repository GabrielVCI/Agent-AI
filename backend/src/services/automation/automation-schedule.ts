/**
 * Cálculo de CUÁNDO se ejecuta un job y de su clave de idempotencia.
 *
 * Ambas cosas son funciones puras: dependen del evento, de la regla y de la
 * zona horaria del tenant, nunca del reloj local del servidor salvo por el
 * "ahora" que se pasa explícitamente.
 */
import type { AutomationRule } from "@prisma/client";
import type { AutomationScheduleConfig } from "./automation.types.js";
import { atLocalTimeOnOrAfter, DEFAULT_TIMEZONE, localDayKey } from "../../utils/timezone.js";

/** Lee una ruta "a.b.c" de un objeto plano. */
function readPath(source: Record<string, unknown> | undefined, path: string): unknown {
  if (!source) return undefined;
  let current: unknown = source;
  for (const segment of path.split(".").filter(Boolean)) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export interface ScheduleInput {
  rule: Pick<
    AutomationRule,
    "scheduleStrategy" | "delayMinutes" | "scheduleConfigJson"
  >;
  occurredAt: Date;
  payload?: Record<string, unknown>;
  timezone?: string;
}

export type ScheduleResult =
  | { ok: true; scheduledFor: Date }
  | { ok: false; reason: string };

/**
 * Resuelve scheduledFor según la estrategia de la regla.
 *
 * RELATIVE_TO_FIELD es la que habilita recordatorios ("scheduledAt - 24h"):
 * si la fecha resultante ya pasó, NO se programa (no tiene sentido recordar
 * una cita de ayer) y se reporta el motivo.
 */
export function resolveScheduledFor(input: ScheduleInput): ScheduleResult {
  const config = (input.rule.scheduleConfigJson ?? {}) as AutomationScheduleConfig;
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const delayMs = (input.rule.delayMinutes ?? 0) * 60 * 1000;

  switch (input.rule.scheduleStrategy) {
    case "IMMEDIATE":
      return { ok: true, scheduledFor: new Date(input.occurredAt.getTime()) };

    case "DELAY":
      return { ok: true, scheduledFor: new Date(input.occurredAt.getTime() + delayMs) };

    case "RELATIVE_TO_FIELD": {
      if (!config.field) {
        return { ok: false, reason: "La regla usa RELATIVE_TO_FIELD sin campo configurado" };
      }
      const base = toDate(readPath(input.payload, config.field));
      if (!base) {
        return { ok: false, reason: `El evento no trae la fecha "${config.field}"` };
      }
      const target = new Date(base.getTime() + (config.offsetMinutes ?? 0) * 60 * 1000);
      if (target.getTime() <= input.occurredAt.getTime()) {
        return { ok: false, reason: "La fecha calculada ya pasó" };
      }
      return { ok: true, scheduledFor: target };
    }

    case "DAILY_AT_LOCAL_TIME": {
      const base = new Date(input.occurredAt.getTime() + delayMs);
      if (!config.localTime) {
        return { ok: false, reason: "La regla usa DAILY_AT_LOCAL_TIME sin hora local" };
      }
      return { ok: true, scheduledFor: atLocalTimeOnOrAfter(base, config.localTime, timezone) };
    }

    default:
      return { ok: false, reason: "Estrategia de programación desconocida" };
  }
}

export interface IdempotencyKeyInput {
  ruleId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  scheduledFor: Date;
  scheduleConfig?: AutomationScheduleConfig | null;
  timezone?: string;
}

/**
 * Clave de idempotencia del job.
 *
 * Estructura: rule:<ruleId>|evt:<eventType>|ent:<entityType>:<entityId>|w:<ventana>[|tag]
 *
 * Junto con el UNIQUE (tenantId, idempotencyKey) de PostgreSQL, esta clave es
 * la garantía dura de que un webhook duplicado, un retry o dos instancias del
 * backend no generen dos automatizaciones equivalentes.
 *
 * La ventana depende de dedupeWindow:
 *  - "entity" (default): sin componente temporal → una por entidad y regla.
 *  - "day": día local del tenant → una por día (recordatorios diarios).
 *  - "occurrence": instante exacto → permite repeticiones planificadas.
 */
export function buildJobIdempotencyKey(input: IdempotencyKeyInput): string {
  const window = input.scheduleConfig?.dedupeWindow ?? "entity";
  const timezone = input.timezone || DEFAULT_TIMEZONE;

  const windowPart =
    window === "day"
      ? localDayKey(input.scheduledFor, timezone)
      : window === "occurrence"
        ? String(input.scheduledFor.getTime())
        : "entity";

  const parts = [
    `rule:${input.ruleId}`,
    `evt:${input.eventType}`,
    `ent:${input.entityType}:${input.entityId}`,
    `w:${windowPart}`,
  ];
  if (input.scheduleConfig?.dedupeTag) parts.push(`tag:${input.scheduleConfig.dedupeTag}`);
  return parts.join("|");
}

/**
 * Backoff con jitter para reintentos.
 * intento 1 → 30s, 2 → 2min, 3 → 10min, 4 → 30min, 5+ → 2h (tope).
 * El jitter (±20%) evita que N jobs fallidos a la vez reintenten en bloque.
 */
const BACKOFF_STEPS_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

export function backoffDelayMs(attemptCount: number, random: () => number = Math.random): number {
  const index = Math.min(Math.max(attemptCount, 1), BACKOFF_STEPS_MS.length) - 1;
  const base = BACKOFF_STEPS_MS[index];
  const jitter = base * 0.2 * (random() * 2 - 1);
  return Math.max(1_000, Math.round(base + jitter));
}

export function nextRetryAt(
  attemptCount: number,
  now: Date = new Date(),
  random: () => number = Math.random
): Date {
  return new Date(now.getTime() + backoffDelayMs(attemptCount, random));
}
