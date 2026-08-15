import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import { useAutoRefresh } from './useAutoRefresh'

/**
 * Base de los hooks de datos "casi en tiempo real" (sin React Query):
 *
 * - Carga inicial con `loading`; el polling posterior es silencioso
 *   (`refreshing`) y NUNCA borra los datos anteriores si el refetch falla —
 *   marca `staleWarning` para que la UI avise de forma no intrusiva.
 * - El intervalo respeta la visibilidad de la pestaña (useAutoRefresh):
 *   pestaña oculta = cero requests (no sobrecarga backend ni rate limits).
 * - Un solo interval por hook; se limpia al desmontar.
 * - `lastUpdatedAt` alimenta el "Actualizado hace Xs" de la UI.
 * - `refresh()` fuerza un refetch manual (con spinner sutil, no bloqueante).
 */
export interface LiveQueryResult<T> {
  data: T | null
  loading: boolean
  refreshing: boolean
  error: string
  /** true si el último refetch silencioso falló (se muestran datos previos). */
  staleWarning: boolean
  lastUpdatedAt: Date | null
  refresh: () => Promise<void>
}

export function useLiveQuery<T>(
  fetcher: () => Promise<T>,
  options: {
    intervalMs: number
    enabled?: boolean
    /** Cambios en estos valores re-disparan la carga (filtros, ids...). */
    deps?: unknown[]
  }
): LiveQueryResult<T> {
  const { intervalMs, enabled = true, deps = [] } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [staleWarning, setStaleWarning] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  // Evita aplicar respuestas viejas si los filtros cambiaron a mitad de un fetch
  const runIdRef = useRef(0)

  const run = useCallback(async (silent: boolean) => {
    const runId = ++runIdRef.current
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const result = await fetcherRef.current()
      if (runId !== runIdRef.current) return
      setData(result)
      setLastUpdatedAt(new Date())
      setError('')
      setStaleWarning(false)
    } catch (err) {
      if (runId !== runIdRef.current) return
      if (silent) {
        // Conservar los datos anteriores; solo avisar que pueden estar viejos
        setStaleWarning(true)
      } else {
        setError(getUserFriendlyErrorMessage(err))
      }
    } finally {
      if (runId === runIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void run(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps])

  useAutoRefresh(() => run(true), intervalMs, enabled)

  const refresh = useCallback(() => run(true), [run])

  return { data, loading, refreshing, error, staleWarning, lastUpdatedAt, refresh }
}
