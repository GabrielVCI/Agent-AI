import api from '../lib/api'
import { normalizePaginatedResponse, type PagedResult } from '../lib/pagination'

// ─── Tipos (espejo del contrato /api/catalog del backend) ───────────────────

export type CatalogItemType = 'PRODUCT' | 'SERVICE'

export interface CatalogCategory {
  id: string
  name: string
  description: string | null
  isActive: boolean
  itemCount: number
  createdAt: string
  updatedAt: string
}

/** Unidad del intervalo. "30 días" y "1 mes" no son lo mismo. */
export type RecurrenceUnit = "DAYS" | "WEEKS" | "MONTHS"

export const RECURRENCE_UNIT_LABELS: Record<RecurrenceUnit, string> = {
  DAYS: "días",
  WEEKS: "semanas",
  MONTHS: "meses",
}

export interface CatalogItem {
  id: string
  name: string
  description: string | null
  type: CatalogItemType
  categoryId: string | null
  category: { id: string; name: string } | null
  price: number
  /** Porcentaje: 18 = 18% */
  taxRate: number
  priceIncludesTax: boolean
  /** null para servicios */
  quantity: number | null
  sku: string | null
  unit: string
  isActive: boolean
  // ── Recurrencia del servicio (Módulo 3) ──
  // Apagada y sin intervalo por defecto: el plazo lo decide el negocio, no
  // Sendwary. Sin política, completar el servicio no programa nada.
  recurrenceEnabled: boolean
  recurrenceInterval: number | null
  recurrenceUnit: RecurrenceUnit | null
  /** Texto listo para la UI ("cada 40 días"); null si no tiene recurrencia. */
  recurrenceLabel: string | null
  createdAt: string
  updatedAt: string
}

export interface CatalogItemInput {
  name: string
  description?: string | null
  type: CatalogItemType
  categoryId?: string | null
  price: number
  taxRate?: number
  priceIncludesTax?: boolean
  quantity?: number | null
  sku?: string | null
  isActive?: boolean
  // Recurrencia del servicio (Módulo 3). Sin valor por defecto: el plazo lo
  // decide el negocio.
  recurrenceEnabled?: boolean
  recurrenceInterval?: number | null
  recurrenceUnit?: RecurrenceUnit | null
}

export interface ItemFilters {
  search?: string
  categoryId?: string
  type?: CatalogItemType
  status?: 'active' | 'inactive'
  page?: number
  limit?: number
  sortBy?: 'name' | 'price' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

// ─── Categorías ──────────────────────────────────────────────────────────────

export const catalogApi = {
  listCategories: () => api.get<CatalogCategory[]>('/api/catalog/categories'),

  createCategory: (data: { name: string; description?: string | null }) =>
    api.post<CatalogCategory>('/api/catalog/categories', data),

  updateCategory: (id: string, data: { name?: string; description?: string | null }) =>
    api.put<CatalogCategory>(`/api/catalog/categories/${id}`, data),

  setCategoryStatus: (id: string, isActive: boolean) =>
    api.patch<CatalogCategory>(`/api/catalog/categories/${id}/status`, { isActive }),

  deleteCategory: (id: string) =>
    api.delete<{ deleted: boolean; deactivated: boolean; productCount: number }>(
      `/api/catalog/categories/${id}`
    ),

  // ─── Ítems ─────────────────────────────────────────────────────────────────

  // Contrato paginado: { items, total, page, limit, pages } (filtros server-side)
  listItems: async (filters: ItemFilters = {}): Promise<PagedResult<CatalogItem>> => {
    const data = await api.get<unknown>(
      '/api/catalog/items',
      filters as Record<string, string | number | undefined>
    )
    return normalizePaginatedResponse<CatalogItem>(data)
  },

  createItem: (data: CatalogItemInput) => api.post<CatalogItem>('/api/catalog/items', data),

  updateItem: (id: string, data: Partial<CatalogItemInput>) =>
    api.put<CatalogItem>(`/api/catalog/items/${id}`, data),

  setItemStatus: (id: string, isActive: boolean) =>
    api.patch<CatalogItem>(`/api/catalog/items/${id}/status`, { isActive }),

  deleteItem: (id: string) => api.delete<{ deleted: boolean }>(`/api/catalog/items/${id}`),
}
