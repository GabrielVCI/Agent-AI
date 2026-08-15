import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ActivationStatus } from '../types'
import api from '../lib/api'
import Alert from './ui/Alert'
import LoadingSpinner from './ui/LoadingSpinner'
import { SendwaryWordmark } from './BrandLogo'

/**
 * Gate de activación comercial: envuelve las rutas tenant y decide, en orden:
 *   1. Email sin verificar   → /verificar-correo
 *   2. Tenant en implementación → /implementacion
 *   3. Paywall requerido     → /activate
 *   4. Todo OK               → dashboard (Outlet)
 * Reglas anti-loop:
 * - SUPER_ADMIN: bypass total (no tiene tenant; usa /admin).
 * - /activate, /verificar-correo, /implementacion NO están envueltas por este gate.
 * - Si el status no se puede consultar (backend caído), se permite el paso:
 *   el enforcement duro de límites vive en el backend, no aquí.
 * PAST_DUE en gracia: acceso permitido con banner de aviso.
 */
export default function RequireActiveSubscription() {
  const { user } = useAuth()
  const [status, setStatus] = useState<ActivationStatus | null>(null)
  const [checked, setChecked] = useState(false)

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    if (isSuperAdmin) {
      setChecked(true)
      return
    }
    let cancelled = false
    api
      .get<ActivationStatus>('/api/billing/activation-status')
      .then(data => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        // fail-open: un fallo transitorio del status no debe dejar fuera al
        // cliente que sí pagó; el backend sigue aplicando sus límites.
        if (!cancelled) setStatus(null)
      })
      .finally(() => {
        if (!cancelled) setChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [isSuperAdmin, user?.tenantId])

  if (!checked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50">
        <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!isSuperAdmin && status) {
    if (!status.emailVerified) {
      return <Navigate to="/verificar-correo" replace />
    }
    if (status.shouldShowImplementationScreen) {
      return <Navigate to="/implementacion" replace />
    }
    if (status.shouldShowPaywall) {
      return <Navigate to="/activate" replace />
    }
  }

  return (
    <>
      {status?.reason === 'PAST_DUE_GRACE' && (
        <div className="px-4 pt-3">
          <Alert variant="warning">
            Tu último pago está pendiente. Regulariza tu suscripción para no perder acceso: el
            período de gracia es de 3 días.
          </Alert>
        </div>
      )}
      <Outlet />
    </>
  )
}
