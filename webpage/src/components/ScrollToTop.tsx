import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Restaura el scroll al inicio en cada cambio de ruta.
 * (React Router no lo hace por defecto.)
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
