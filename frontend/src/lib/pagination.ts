/**
 * Normalizador de respuestas paginadas (Parte H de la fase de listados).
 *
 * El backend usa dos formas según el módulo (documentado en
 * docs/DATA_CONSISTENCY_AUDIT.md):
 *   1. { items: [...], total, page, limit, pages, filters? }      ← estándar nuevo
 *   2. { conversations|tickets|appointments|tenants: [...], pagination: {...} }
 *   3. arrays directos (listados no paginados legacy)
 * api.ts ya desenvuelve el sobre { success, data }.
 */

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  pages: number
  /** Filtros efectivos que aplicó el backend (ej. rango default de citas). */
  filters?: Record<string, unknown>
}

const ITEM_KEYS = ['items', 'appointments', 'conversations', 'tickets', 'tenants', 'results'] as const

export function normalizePaginatedResponse<T>(raw: unknown): PagedResult<T> {
  // Array directo (endpoint sin paginación): una sola "página" con todo
  if (Array.isArray(raw)) {
    return { items: raw as T[], total: raw.length, page: 1, limit: raw.length || 1, pages: 1 }
  }

  const obj = (raw ?? {}) as Record<string, unknown>

  let items: T[] = []
  for (const key of ITEM_KEYS) {
    if (Array.isArray(obj[key])) {
      items = obj[key] as T[]
      break
    }
  }

  // total/page/limit/pages pueden venir en la raíz o dentro de `pagination`
  const pag = (obj.pagination ?? obj) as Record<string, unknown>
  const total = Number(pag.total ?? items.length) || 0
  const page = Math.max(1, Number(pag.page) || 1)
  const limit = Math.max(1, Number(pag.limit) || items.length || 20)
  const pages = Math.max(1, Number(pag.pages) || Math.ceil(total / limit) || 1)

  return {
    items,
    total,
    page,
    limit,
    pages,
    filters: (obj.filters as Record<string, unknown> | undefined) ?? undefined,
  }
}
