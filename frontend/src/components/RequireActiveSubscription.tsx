import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ActivationStatus } from '../types'
import api from '../lib/api'
import Alert from './ui/Alert'
import LoadingSpinner from './ui/LoadingSpinner'
import { SendwaryWordmark } from './BrandLogo'
import PaymentConfirming from './billing/PaymentConfirming'
import { useBillingConfirmation } from '../hooks/useBillingConfirmation'

/**
 * El cliente volvió del checkout antes de que el webhook terminara.
 *
 * Se le enseña que su pago ya está en camino —nunca los planes otra vez— y se
 * consulta al backend hasta que la suscripción quede activa. Componente aparte
 * para que el hook de espera solo se monte en este caso.
 */
function PendingConfirmationScreen({ onActivated }: { onActivated: () => void }) {
  const { phase, retry } = useBillingConfirmation({ onActivated, initiallyConfirming: true })

  // Confirmado: mientras el gate vuelve a preguntar el estado se enseña el
  // mismo cargando de siempre. Sin esto la pantalla quedaría en blanco durante
  // ese intervalo.
  if (phase === 'active' || phase === 'idle') return <CheckingScreen />

  return <PaymentConfirming phase={phase} onRetry={retry} variant="screen" context="return" />
}

/**
 * Cargando a pantalla completa con la marca (mismo look que el gate).
 *
 * Fijo al viewport por el mismo motivo que la pantalla de confirmacion: el
 * gate vive dentro del Layout, y en el flujo normal este cargando solo tapaba
 * el area de contenido dejando sidebar y topbar a la vista.
 */
function CheckingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-50 px-4">
      <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
      <LoadingSpinner size="lg" />
    </div>
  )
}

/**
 * Gate de activación comercial: envuelve las rutas tenant y decide, en orden:
 *   1. Email sin verificar   → /verificar-correo
 *   2. Tenant en implementación → /implementacion
 *   3. Pago en confirmación  → pantalla "activando tu suscripción"
 *   4. Paywall requerido     → /activate
 *   5. Todo OK               → dashboard (Outlet)
 *
 * El paso 3 existe por una carrera real: LemonSqueezy redirige al panel en
 * cuanto el cliente pulsa "Continuar", y el webhook del primer cobro puede
 * tardar unos segundos más. Mandarlo a /activate en ese hueco sería invitarlo
 * a pagar por segunda vez. Quien decide que hay un pago en vuelo es el BACKEND
 * (`accessState = PENDING_CONFIRMATION`, derivado de la correlación de
 * LemonSqueezy): el navegador no puede afirmarlo por su cuenta.
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
  /** Se incrementa para volver a preguntar el estado (tras confirmar un pago). */
  const [version, setVersion] = useState(0)

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
  }, [isSuperAdmin, user?.tenantId, version])

  if (!checked) return <CheckingScreen />

  if (!isSuperAdmin && status) {
    if (!status.emailVerified) {
      return <Navigate to="/verificar-correo" replace />
    }
    if (status.shouldShowImplementationScreen) {
      return <Navigate to="/implementacion" replace />
    }
    if (status.accessState === 'PENDING_CONFIRMATION') {
      // Al confirmarse, se vuelve a preguntar el estado y el gate deja pasar
      // solo si el backend dice que sí. No se "asume" el acceso.
      return <PendingConfirmationScreen onActivated={() => setVersion(v => v + 1)} />
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
