import api from '../lib/api'

// ─── Tipos (espejo del contrato /api/customer-categories del backend) ────────

export type CustomerCategoryType = 'MANUAL' | 'AUTOMATIC'
export type CustomerCategoryStatus = 'ACTIVE' | 'ARCHIVED'
export type CustomerCategoryAssignmentSource =
  | 'MANUAL'
  | 'AUTOMATION'
  | 'SYSTEM'
  | 'IMPORT'
  | 'API'

/** Paleta cerrada: el backend rechaza cualquier otro valor. */
export const CATEGORY_COLORS = [
  'purple',
  'info',
  'success',
  'warning',
  'danger',
  'default',
] as const

export type CustomerCategoryColor = (typeof CATEGORY_COLORS)[number]

export const CATEGORY_COLOR_LABELS: Record<CustomerCategoryColor, string> = {
  purple: 'Morado',
  info: 'Azul',
  success: 'Verde',
  warning: 'Ámbar',
  danger: 'Rojo',
  default: 'Gris',
}

export interface CustomerCategory {
  id: string
  name: string
  slug: string
  description: string | null
  type: CustomerCategoryType
  status: CustomerCategoryStatus
  color: string
  /** true = la mantiene Sendwary; no se archiva ni se asigna a mano. */
  isSystem: boolean
  /**
   * Qué gestiona la pertenencia cuando es automática (`Customer.isVip`,
   * `Customer.riskStatus` o `automation`). Sirve para explicárselo al usuario.
   */
  managedBy: string | null
  customerCount: number
  createdAt: string
  updatedAt: string
}

/** Pertenencia de un cliente concreto, con su origen. */
export interface CustomerCategoryAssignment {
  id: string
  name: string
  slug: string
  color: string
  type: CustomerCategoryType
  status: CustomerCategoryStatus
  source: CustomerCategoryAssignmentSource
  reason: string | null
  assignedAt: string
}

export interface CustomerCategoryInput {
  name: string
  description?: string | null
  color?: CustomerCategoryColor
}

export interface CategoryListFilters {
  search?: string
  type?: CustomerCategoryType
  status?: CustomerCategoryStatus
  includeArchived?: boolean
}

export interface BulkCategoryResult {
  requested: number
  applied: number
  skipped: number
  alreadyDone: number
}

/**
 * Texto que explica por qué una categoría automática no se toca a mano. Se usa
 * en el tooltip de la insignia y en el selector de la ficha.
 */
export function managedByLabel(category: {
  type: CustomerCategoryType
  managedBy?: string | null
}): string | null {
  if (category.type !== 'AUTOMATIC') return null
  if (category.managedBy === 'Customer.isVip') {
    return 'Se activa con el botón VIP de la ficha del cliente.'
  }
  if (category.managedBy === 'Customer.riskStatus') {
    return 'Sigue al riesgo de abandono que fijes en la ficha del cliente.'
  }
  return 'La mantiene una automatización.'
}

// ─── Cliente HTTP ────────────────────────────────────────────────────────────

function cleanParams(filters: CategoryListFilters): Record<string, string | boolean> {
  const params: Record<string, string | boolean> = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = value as string | boolean
  }
  return params
}

export const customerCategoriesApi = {
  list: (filters: CategoryListFilters = {}) =>
    api.get<CustomerCategory[]>('/api/customer-categories', cleanParams(filters)),

  get: (id: string) => api.get<CustomerCategory>(`/api/customer-categories/${id}`),

  create: (data: CustomerCategoryInput) =>
    api.post<CustomerCategory>('/api/customer-categories', data),

  update: (id: string, data: Partial<CustomerCategoryInput>) =>
    api.patch<CustomerCategory>(`/api/customer-categories/${id}`, data),

  archive: (id: string, archived: boolean) =>
    api.patch<CustomerCategory>(`/api/customer-categories/${id}/archive`, { archived }),

  bulk: (id: string, customerIds: string[], action: 'assign' | 'remove' = 'assign') =>
    api.post<BulkCategoryResult>(`/api/customer-categories/${id}/customers`, {
      customerIds,
      action,
    }),

  // ── Pertenencias de un cliente ──
  forCustomer: (customerId: string) =>
    api.get<CustomerCategoryAssignment[]>(`/api/customers/${customerId}/categories`),

  assign: (customerId: string, categoryId: string) =>
    api.post<CustomerCategoryAssignment[]>(
      `/api/customers/${customerId}/categories/${categoryId}`,
      {}
    ),

  remove: (customerId: string, categoryId: string) =>
    api.delete<CustomerCategoryAssignment[]>(
      `/api/customers/${customerId}/categories/${categoryId}`
    ),
}
