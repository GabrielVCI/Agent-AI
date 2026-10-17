/**
 * Tipos y DTOs del Módulo 2 — Categorías y segmentación de clientes.
 *
 * Igual que en el Maestro de Clientes: el frontend NUNCA recibe la fila Prisma
 * cruda. `tenantId`, `systemKey` interno y los ids de usuario que asignaron no
 * salen del backend salvo donde aportan algo real a la UI.
 */
import type {
  CustomerCategory,
  CustomerCategoryAssignmentSource,
  CustomerCategoryStatus,
  CustomerCategoryType,
} from "@prisma/client";

export type {
  CustomerCategoryAssignmentSource,
  CustomerCategoryStatus,
  CustomerCategoryType,
};

export type CustomerCategoryRow = CustomerCategory;

/**
 * Paleta cerrada de la insignia. NO se acepta CSS ni color libre del cliente:
 * el valor viaja a `className` del design system, así que un string arbitrario
 * sería una vía de inyección de estilos.
 */
export const CUSTOMER_CATEGORY_COLORS = [
  "purple",
  "info",
  "success",
  "warning",
  "danger",
  "default",
] as const;

export type CustomerCategoryColor = (typeof CUSTOMER_CATEGORY_COLORS)[number];

export function isCategoryColor(value: unknown): value is CustomerCategoryColor {
  return (
    typeof value === "string" &&
    (CUSTOMER_CATEGORY_COLORS as readonly string[]).includes(value)
  );
}

/**
 * Claves de las categorías de SISTEMA.
 *
 * Cada una refleja un campo de dominio que YA existe en Customer (Módulo 1) y
 * que es la fuente de verdad. No inventan criterio comercial alguno: son la
 * proyección consultable de un estado que el negocio ya fija a mano o por
 * regla. Ver `syncDomainCategories` en el servicio.
 */
export const SYSTEM_CATEGORY_KEYS = ["VIP", "CHURN_RISK"] as const;
export type SystemCategoryKey = (typeof SYSTEM_CATEGORY_KEYS)[number];

export interface SystemCategoryDefinition {
  key: SystemCategoryKey;
  name: string;
  description: string;
  color: CustomerCategoryColor;
  /** Campo de Customer del que se deriva la pertenencia. */
  derivedFrom: string;
}

export const SYSTEM_CATEGORY_DEFINITIONS: Record<
  SystemCategoryKey,
  SystemCategoryDefinition
> = {
  VIP: {
    key: "VIP",
    name: "VIP",
    description:
      "Se mantiene sola: agrupa a los clientes marcados como VIP en su ficha.",
    color: "warning",
    derivedFrom: "Customer.isVip",
  },
  CHURN_RISK: {
    key: "CHURN_RISK",
    name: "Riesgo de abandono",
    description:
      "Se mantiene sola: agrupa a los clientes con riesgo medio o alto en su ficha.",
    color: "danger",
    derivedFrom: "Customer.riskStatus",
  },
};

// ─── DTOs ────────────────────────────────────────────────────────────────────

/** Categoría tal como la ve el panel del tenant. */
export interface CustomerCategoryDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: CustomerCategoryType;
  status: CustomerCategoryStatus;
  color: string;
  /** true = la gestiona Sendwary; no se puede archivar ni cambiar de tipo. */
  isSystem: boolean;
  /**
   * De qué depende la pertenencia cuando es automática. Se envía para que la
   * UI pueda explicar por qué el usuario no puede asignarla a mano.
   */
  managedBy: string | null;
  customerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Insignia compacta: lo que se pinta junto al nombre de un cliente. */
export interface CustomerCategoryBadge {
  id: string;
  name: string;
  color: string;
  type: CustomerCategoryType;
}

/** Pertenencia de un cliente, con su trazabilidad. */
export interface CustomerCategoryAssignmentDTO extends CustomerCategoryBadge {
  slug: string;
  status: CustomerCategoryStatus;
  source: CustomerCategoryAssignmentSource;
  reason: string | null;
  assignedAt: Date;
}

export interface CustomerCategoryListFilters {
  search?: string;
  type?: CustomerCategoryType;
  status?: CustomerCategoryStatus;
  /** true = también las archivadas (por defecto solo ACTIVE). */
  includeArchived?: boolean;
}

export interface CustomerCategoryWriteInput {
  name: string;
  description?: string | null;
  color?: string;
}

/** Contexto del actor de una asignación: quién y por qué. */
export interface AssignmentContext {
  source?: CustomerCategoryAssignmentSource;
  userId?: string | null;
  reason?: string | null;
  /** Correlación del Automation Core, si la asignación viene de una regla. */
  correlationId?: string | null;
  causationId?: string | null;
}

// ─── Límites técnicos ────────────────────────────────────────────────────────
//
// Son topes ANTIABUSO, no límites comerciales de plan (Sendwary no ha definido
// ninguno para segmentación). Amplios a propósito.

export const CATEGORY_NAME_MAX = 40;
export const CATEGORY_DESCRIPTION_MAX = 200;
/** Categorías ACTIVAS por tenant. Las archivadas no cuentan. */
export const MAX_ACTIVE_CATEGORIES_PER_TENANT = 200;
/** Clientes por operación masiva. */
export const MAX_BULK_CUSTOMERS = 200;
/** Categorías que se pueden combinar en un filtro del listado. */
export const MAX_FILTER_CATEGORIES = 10;
