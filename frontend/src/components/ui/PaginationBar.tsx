import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Barra estándar de paginación (Parte I): total, página actual, límite
 * 10/20/50 y anterior/siguiente. El padre resetea page=1 al cambiar filtros.
 */
export default function PaginationBar({
  total,
  page,
  pages,
  limit,
  onPageChange,
  onLimitChange,
  noun = 'resultados',
}: {
  total: number
  page: number
  pages: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
  noun?: string
}) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-sm">
      <p className="text-slate-500">
        {total} {noun} · página {page} de {pages}
      </p>
      <div className="flex items-center gap-2">
        <select
          value={limit}
          onChange={e => onLimitChange(Number(e.target.value))}
          className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label="Resultados por página"
        >
          {[10, 20, 50].map(n => (
            <option key={n} value={n}>
              {n} / pág.
            </option>
          ))}
        </select>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
