/**
 * Render de las plantillas de texto de las automatizaciones.
 *
 * Mismo estilo de placeholders que ya usan los recordatorios de citas
 * ({{nombre}}, {{fecha}}...), para que el usuario no tenga que aprender dos
 * sintaxis. Sin motor de plantillas ni evaluación de expresiones: reemplazo
 * literal, imposible de convertir en ejecución de código.
 */
import { DEFAULT_TIMEZONE } from "../../utils/timezone.js";

/**
 * Fecha/hora en la zona del tenant, con el mismo formato que ya usan los
 * recordatorios de citas. Se implementa aquí (y no importando de
 * appointment.service) para no crear un ciclo de imports:
 * appointment.service → automation-events → executors → este módulo.
 */
function formatForCustomer(date: Date, timezone: string): { fecha: string; hora: string } {
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

export interface RenderVariables {
  [key: string]: string | number | null | undefined;
}

/** Reemplaza {{clave}} (tolerante a espacios y mayúsculas) por su valor. */
export function renderTemplate(template: string, variables: RenderVariables): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const found = Object.entries(variables).find(([k]) => k.toLowerCase() === key);
    if (!found) return match;
    const value = found[1];
    return value === null || value === undefined ? "" : String(value);
  });
}

/**
 * Variables disponibles para todas las plantillas. Solo datos de negocio:
 * nunca tokens, ids internos de Meta ni credenciales.
 */
export function buildRenderVariables(input: {
  customerName?: string | null;
  businessName?: string | null;
  timezone?: string | null;
  eventPayload?: Record<string, unknown>;
}): RenderVariables {
  const payload = input.eventPayload ?? {};
  const variables: RenderVariables = {
    nombre: (input.customerName as string) || "",
    negocio: input.businessName || "",
  };

  const servicio = payload.serviceOrProduct ?? payload.servicio;
  if (typeof servicio === "string") variables.servicio = servicio;

  const scheduledAt = payload.scheduledAt;
  if (typeof scheduledAt === "string" || scheduledAt instanceof Date) {
    const date = new Date(scheduledAt);
    if (!Number.isNaN(date.getTime())) {
      const { fecha, hora } = formatForCustomer(date, input.timezone || DEFAULT_TIMEZONE);
      variables.fecha = fecha;
      variables.hora = hora;
    }
  }

  // Cualquier valor escalar del payload queda disponible como {{clave}}.
  for (const [key, value] of Object.entries(payload)) {
    if (variables[key] !== undefined) continue;
    if (typeof value === "string" || typeof value === "number") variables[key] = value;
  }

  return variables;
}
