import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { UserRole } from '../types'
import LoadingSpinner from './ui/LoadingSpinner'
import ForbiddenPage from '../pages/ForbiddenPage'
import { SendwaryWordmark } from './BrandLogo'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
  /** La ruta depende de una empresa (tenant). Usuarios sin tenantId no la montan. */
  requireTenant?: boolean
}

export default function ProtectedRoute({ allowedRoles, requireTenant }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

  // Esperamos a que termine la verificación de sesión antes de decidir nada.
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50">
        <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Páginas tenant (dashboard, agentes, etc.): un usuario sin empresa no debe montarlas.
  // SUPER_ADMIN (tenantId null) va a su panel admin; usuarios recién registrados
  // sin empresa van al onboarding para crearla.
  if (requireTenant && !user.tenantId) {
    if (user.role === 'SUPER_ADMIN') {
      return <Navigate to="/admin" replace />
    }
    return <Navigate to="/onboarding" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <ForbiddenPage />
  }

  return <Outlet />
}
