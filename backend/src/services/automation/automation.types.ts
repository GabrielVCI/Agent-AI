/**
 * Automation Core — catálogo tipado de eventos, acciones y contratos.
 *
 * Los enums viven en Prisma (fuente única); aquí se derivan los tipos de
 * TypeScript y los metadatos que el motor necesita (entidad esperada, si el
 * evento admite payload de fecha, etc.). Nunca se usan strings sueltos.
 */
import type {
  AutomationActionType,
  AutomationEntityType,
  AutomationEventType,
  AutomationScheduleStrategy,
} from "@prisma/client";

export type {
  AutomationActionType,
  AutomationEntityType,
  AutomationEventType,
  AutomationScheduleStrategy,
};

/** Metadatos del catálogo de eventos: entidad natural y descripción. */
export interface AutomationEventDefinition {
  type: AutomationEventType;
  entityType: AutomationEntityType;
  description: string;
  /** true = el motor ya lo emite desde algún módulo de Sendwary. */
  implemented: boolean;
}

export const AUTOMATION_EVENT_CATALOG: Record<AutomationEventType, AutomationEventDefinition> = {
  APPOINTMENT_CREATED: {
    type: "APPOINTMENT_CREATED",
    entityType: "APPOINTMENT",
    description: "Se registró una cita (manual, IA o WhatsApp).",
    implemented: true,
  },
  APPOINTMENT_CONFIRMED: {
    type: "APPOINTMENT_CONFIRMED",
    entityType: "APPOINTMENT",
    description: "La cita fue confirmada.",
    implemented: true,
  },
  APPOINTMENT_RESCHEDULED: {
    type: "APPOINTMENT_RESCHEDULED",
    entityType: "APPOINTMENT",
    description: "La cita cambió de fecha: los jobs asociados se reprograman.",
    implemented: true,
  },
  APPOINTMENT_COMPLETED: {
    type: "APPOINTMENT_COMPLETED",
    entityType: "APPOINTMENT",
    description: "La cita se completó (dispara postservicio y seguimiento).",
    implemented: true,
  },
  APPOINTMENT_CANCELLED: {
    type: "APPOINTMENT_CANCELLED",
    entityType: "APPOINTMENT",
    description: "La cita fue cancelada: los jobs asociados se cancelan.",
    implemented: true,
  },
  APPOINTMENT_NO_SHOW: {
    type: "APPOINTMENT_NO_SHOW",
    entityType: "APPOINTMENT",
    description: "El cliente no asistió a la cita.",
    implemented: true,
  },
  CUSTOMER_CREATED: {
    type: "CUSTOMER_CREATED",
    entityType: "CUSTOMER",
    description: "Se registró un contacto nuevo.",
    implemented: true,
  },
  CUSTOMER_VISITED: {
    type: "CUSTOMER_VISITED",
    entityType: "CUSTOMER",
    description: "El cliente volvió (visita/servicio): reinicia el seguimiento.",
    implemented: true,
  },
  SERVICE_USED: {
    type: "SERVICE_USED",
    entityType: "CUSTOMER",
    description: "El cliente consumió un servicio del catálogo.",
    implemented: false,
  },
  PRODUCT_PURCHASED: {
    type: "PRODUCT_PURCHASED",
    entityType: "CUSTOMER",
    description: "El cliente compró un producto.",
    implemented: false,
  },
  CUSTOMER_BIRTHDAY: {
    type: "CUSTOMER_BIRTHDAY",
    entityType: "CUSTOMER",
    description: "Cumpleaños del cliente (recurrente anual).",
    implemented: false,
  },
  MAINTENANCE_DUE: {
    type: "MAINTENANCE_DUE",
    entityType: "CUSTOMER",
    description: "Toca el mantenimiento de un servicio previo.",
    implemented: false,
  },
  CUSTOMER_INACTIVE_15_DAYS: {
    type: "CUSTOMER_INACTIVE_15_DAYS",
    entityType: "CUSTOMER",
    description: "15 días sin actividad del cliente.",
    implemented: false,
  },
  CUSTOMER_INACTIVE_30_DAYS: {
    type: "CUSTOMER_INACTIVE_30_DAYS",
    entityType: "CUSTOMER",
    description: "30 días sin actividad del cliente.",
    implemented: false,
  },
  CUSTOMER_INACTIVE_60_DAYS: {
    type: "CUSTOMER_INACTIVE_60_DAYS",
    entityType: "CUSTOMER",
    description: "60 días sin actividad del cliente.",
    implemented: false,
  },
  CUSTOMER_INACTIVE_90_DAYS: {
    type: "CUSTOMER_INACTIVE_90_DAYS",
    entityType: "CUSTOMER",
    description: "90 días sin actividad del cliente.",
    implemented: false,
  },
  CUSTOMER_CHURN_RISK: {
    type: "CUSTOMER_CHURN_RISK",
    entityType: "CUSTOMER",
    description: "Riesgo de abandono detectado por un evaluador externo.",
    implemented: false,
  },
  CUSTOMER_BECAME_VIP: {
    type: "CUSTOMER_BECAME_VIP",
    entityType: "CUSTOMER",
    description: "El cliente alcanzó el estatus VIP.",
    implemented: false,
  },
  CUSTOMER_CATEGORY_ASSIGNED: {
    type: "CUSTOMER_CATEGORY_ASSIGNED",
    entityType: "CUSTOMER",
    description:
      "El cliente entró en una categoría (Módulo 2). Solo se emite si la pertenencia cambió de verdad.",
    implemented: true,
  },
  CUSTOMER_CATEGORY_REMOVED: {
    type: "CUSTOMER_CATEGORY_REMOVED",
    entityType: "CUSTOMER",
    description: "El cliente salió de una categoría (Módulo 2).",
    implemented: true,
  },
};

export const AUTOMATION_EVENT_TYPES = Object.keys(
  AUTOMATION_EVENT_CATALOG
) as AutomationEventType[];

export function isAutomationEventType(value: unknown): value is AutomationEventType {
  return typeof value === "string" && value in AUTOMATION_EVENT_CATALOG;
}

// ─── Event envelope ──────────────────────────────────────────────────────────

/**
 * Sobre estándar de todo evento interno.
 *
 * `tenantId` SIEMPRE lo pone el emisor a partir del contexto autenticado o del
 * registro de BD que ya validó pertenencia — nunca se toma del cuerpo de una
 * request del frontend.
 *
 * `payload` solo lleva lo necesario para evaluar condiciones y renderizar el
 * mensaje. Prohibido: tokens, secretos, cookies, credenciales de Meta.
 */
export interface AutomationEventInput {
  tenantId: string;
  type: AutomationEventType;
  /** Módulo que originó el evento: "appointments", "whatsapp", "voice"... */
  source: string;
  entityType?: AutomationEntityType;
  entityId?: string;
  /** Contacto afectado (si aplica): permite cancelar secuencias por cliente. */
  customerId?: string;
  occurredAt?: Date;
  payload?: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  /**
   * Clave de deduplicación del evento. Si se repite (webhook reentregado),
   * el motor no vuelve a evaluar reglas.
   */
  idempotencyKey?: string;
  /**
   * Alcance de la cancelación que dispara este evento sobre las reglas que lo
   * declaran en `cancelOnEventTypes`.
   *
   * Por defecto (true) el alcance es "entidad ∪ contacto": el cliente vuelve y
   * se cae TODO su seguimiento pendiente de esa regla, que es lo correcto para
   * las secuencias de reactivación.
   *
   * Se pone en false cuando el evento es de grano más fino que el contacto —
   * SERVICE_USED lleva entityId `<clienteId>:<servicioId>` (Módulo 3) — para
   * que repetir la coloración cancele SOLO el retoque de coloración y no el
   * mantenimiento de keratina de la misma clienta.
   */
  cancelByCustomer?: boolean;
}

export interface AutomationEmitResult {
  /** false = evento ignorado por duplicado (misma idempotencyKey). */
  processed: boolean;
  eventId: string | null;
  matchedRules: number;
  createdJobs: number;
  cancelledJobs: number;
  reason?: "DUPLICATE" | "NO_RULES" | "TENANT_INACTIVE";
}

// ─── Configuración de programación (scheduleConfigJson) ──────────────────────

export interface AutomationScheduleConfig {
  /** RELATIVE_TO_FIELD: ruta dentro del payload con una fecha ISO. */
  field?: string;
  /** RELATIVE_TO_FIELD: minutos a sumar (negativo = antes de la fecha). */
  offsetMinutes?: number;
  /** DAILY_AT_LOCAL_TIME: hora local del tenant "HH:mm". */
  localTime?: string;
  /**
   * Sufijo extra de la idempotency key. Permite varias etapas de una misma
   * secuencia (15/30/60/90 días) sin que choquen entre sí.
   */
  dedupeTag?: string;
  /**
   * Cómo se agrupa la clave de idempotencia en el tiempo:
   * - "entity" (default): una sola automatización por entidad y regla.
   * - "day": una por día local del tenant (recordatorios diarios).
   * - "occurrence": una por instante programado (permite repetir la regla).
   */
  dedupeWindow?: "entity" | "day" | "occurrence";
}

// ─── Configuración de acciones (actionConfigJson) ────────────────────────────

export interface SendWhatsAppMessageConfig {
  /** Plantilla con {{placeholders}}; se renderiza al momento del envío. */
  template: string;
  /** Si la conversación está en HUMAN_ACTIVE: omitir el envío (default true). */
  skipWhenHumanActive?: boolean;
}

export interface SendEmailConfig {
  subject: string;
  template: string;
}

export interface CreateInternalNotificationConfig {
  /** Nota interna que se registra como mensaje SYSTEM en la conversación. */
  template: string;
}

export interface UpdateCustomerTagConfig {
  /** Nombre de la etiqueta (se crea en el tenant si no existe). */
  label: string;
  color?: string;
}

/**
 * Segmentación automática (Módulo 2). Se referencia la categoría por ID, nunca
 * por nombre: un `if (nombre.includes("keratina"))` sería exactamente la lógica
 * frágil que el módulo prohíbe. La pertenencia al tenant se comprueba al
 * ejecutar, contra el tenantId del job.
 */
export interface CustomerCategoryActionConfig {
  categoryId: string;
  /** Motivo que queda en la trazabilidad de la asignación. */
  reason?: string;
}

export type AutomationActionConfig =
  | SendWhatsAppMessageConfig
  | SendEmailConfig
  | CreateInternalNotificationConfig
  | UpdateCustomerTagConfig
  | CustomerCategoryActionConfig;

// ─── Payload persistido en el job ────────────────────────────────────────────

/**
 * Datos mínimos que el executor necesita. Se congelan al crear el job para
 * que el mensaje refleje el contexto del evento, pero SIN datos sensibles.
 */
export interface AutomationJobPayload {
  eventPayload?: Record<string, unknown>;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  conversationId?: string;
  agentId?: string;
  [key: string]: unknown;
}
