import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { UserRole } from '../types'
import LoadingSpinner from './ui/LoadingSpinner'
import ForbiddenPage from '../pages/ForbiddenPage'

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Páginas tenant (dashboard, agentes, etc.): un usuario sin empresa no debe montarlas.
  // SUPER_ADMIN (tenantId null) se redirige a su panel admin; cualquier otro caso → 403.
  if (requireTenant && !user.tenantId) {
    if (user.role === 'SUPER_ADMIN') {
      return <Navigate to="/admin" replace />
    }
    return <ForbiddenPage />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <ForbiddenPage />
  }

  return <Outlet />
}
