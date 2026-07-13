import { useEffect, useRef } from 'react'

/**
 * Polling inteligente (Parte I): re-ejecuta `callback` cada `intervalMs`
 * mientras la pestaña esté visible. Al volver a la pestaña refresca de
 * inmediato. No dispara nada si la pestaña está oculta (no sobrecarga el
 * backend ni consume rate limit en vano).
 *
 * El callback siempre es la versión más reciente (ref), así que puede cerrar
 * sobre estado/filtros sin reiniciar el intervalo.
 */
export function useAutoRefresh(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return

    const id = window.setInterval(() => {
      if (!document.hidden) void callbackRef.current()
    }, intervalMs)

    const onVisibility = () => {
      if (!document.hidden) void callbackRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}
