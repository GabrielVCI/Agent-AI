/**
 * Tipos y DTOs del Maestro de Clientes (Módulo 1).
 *
 * Regla de serialización: el frontend NUNCA recibe la fila Prisma cruda.
 * Hay dos DTOs con distinto nivel de exposición:
 *
 *  - CustomerListItem: lo mínimo para la tabla. NO lleva cédula, dirección,
 *    fecha de nacimiento ni notas (principio de mínima información: un
 *    listado se cachea, se copia y se ve en pantallas compartidas).
 *  - CustomerProfile: la ficha completa, solo en GET /api/customers/:id.
 */
import type {
  Customer,
  CustomerRiskStatus,
  CustomerSource,
  CustomerStage,
} from "@prisma/client";

import type { CustomerCategoryBadge } from "./customer-category.types.js";

export type { CustomerRiskStatus, CustomerSource, CustomerStage };
export type { CustomerCategoryBadge };

export interface CustomerListItem {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  phoneNormalized: string | null;
  phoneDisplay: string;
  email: string | null;
  stage: CustomerStage;
  source: CustomerSource;
  /**
   * Etiquetas de texto libre (legado del Módulo 1). Se conservan porque las
   * escriben la importación y el executor UPDATE_CUSTOMER_TAG, pero el eje
   * consultable de segmentación son `categories` (Módulo 2).
   */
  tags: string[];
  /** Categorías ACTIVAS del cliente. Se rellenan en el listado y en la ficha. */
  categories: CustomerCategoryBadge[];
  isVip: boolean;
  riskStatus: CustomerRiskStatus;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  visitCount: number;
  /** Días desde la última visita; null si nunca visitó. */
  daysSinceLastVisit: number | null;
  lastActivityAt: Date | null;
  createdAt: Date;
}

export interface CustomerProfile extends CustomerListItem {
  documentId: string | null;
  address: string | null;
  birthDate: string | null;
  notes: string | null;
  clientSince: Date | null;
  vipSince: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
}

/** Métricas comerciales: cada una declara de dónde sale (ver customer-metrics). */
export interface CustomerCommercialSummary {
  visitCount: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  daysSinceLastVisit: number | null;
  appointments: {
    total: number;
    completed: number;
    cancelled: number;
    noShow: number;
    upcoming: number;
  };
  quotes: {
    /** Cotizaciones que salieron al cliente (SENT / NEEDS_CONFIRMATION). */
    issued: number;
    /** Suma de esas cotizaciones, en la moneda del tenant. */
    totalQuoted: number;
    averageQuoted: number;
    currency: string;
  };
  /** Servicios/productos agendados y completados, agrupados. */
  services: { name: string; count: number; lastAt: Date }[];
  /**
   * Valor de lo REALIZADO en las visitas, con el precio del catálogo del día
   * (snapshot). NO es dinero cobrado: Sendwary no registra pagos de cliente
   * final, así que no existe `totalSpent` y no se inventa uno.
   */
  serviced: {
    total: number;
    averagePerVisit: number;
    visitsWithValue: number;
    currency: string;
  };
  products: { id: string; name: string; quantity: number; amount: number }[];
  conversations: number;
  messages: number;
}

export type CustomerTimelineType =
  | "APPOINTMENT"
  | "QUOTE"
  | "CONVERSATION"
  | "AUTOMATION"
  | "SCHEDULED_MESSAGE";

export interface CustomerTimelineEntry {
  id: string;
  type: CustomerTimelineType;
  occurredAt: Date;
  title: string;
  summary: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown>;
}

export interface CustomerListFilters {
  search?: string;
  stage?: CustomerStage;
  /** Incluye los archivados (por defecto quedan fuera del maestro). */
  includeArchived?: boolean;
  isVip?: boolean;
  riskStatus?: CustomerRiskStatus;
  /** Etiqueta de texto libre (legado). Se mantiene por compatibilidad. */
  tag?: string;
  /**
   * Filtro por categorías del Módulo 2. Va SIEMPRE contra la base de datos:
   * jamás se filtra la página actual en el navegador.
   */
  categoryIds?: string[];
  /**
   * Semántica del filtro anterior. `all` (por defecto) = el cliente pertenece
   * a TODAS las categorías seleccionadas; `any` = a alguna. Es explícito a
   * propósito: un filtro múltiple ambiguo devuelve listas que nadie entiende.
   */
  categoryMatch?: "all" | "any";
  source?: CustomerSource;
  /** Sin regresar desde hace N días o más (15 / 30 / 60 / 90...). */
  inactiveDays?: number;
  /** true = solo con visitas; false = solo sin ninguna visita. */
  hasVisits?: boolean;
  lastVisitFrom?: string;
  lastVisitTo?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  limit?: number;
  sortBy?: CustomerSortField;
  sortOrder?: "asc" | "desc";
}

export const CUSTOMER_SORT_FIELDS = [
  "lastVisitAt",
  "visitCount",
  "createdAt",
  "name",
  "firstVisitAt",
] as const;

export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

/** Alta/edición manual (el controller valida con zod antes de llegar aquí). */
export interface CustomerWriteInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  documentId?: string | null;
  address?: string | null;
  notes?: string | null;
  tags?: string[];
  isVip?: boolean;
  riskStatus?: CustomerRiskStatus;
}

export type CustomerRow = Customer;
