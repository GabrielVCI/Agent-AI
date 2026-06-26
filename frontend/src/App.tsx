import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import ForbiddenPage from './pages/ForbiddenPage'
import DashboardPage from './pages/DashboardPage'
import ConversationsPage from './pages/ConversationsPage'
import AgentsPage from './pages/AgentsPage'
import SettingsPage from './pages/SettingsPage'
import CompanyPage from './pages/CompanyPage'
import AccountPage from './pages/AccountPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminTenantsPage from './pages/admin/AdminTenantsPage'
import AdminTenantDetailPage from './pages/admin/AdminTenantDetailPage'
import AdminCancellationsPage from './pages/admin/AdminCancellationsPage'

/** Landing por rol: SUPER_ADMIN -> panel admin; resto -> dashboard de su empresa. */
function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {/* Rutas autenticadas */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              {/* "/" decide destino según el rol (evita que SUPER_ADMIN caiga en dashboard tenant) */}
              <Route index element={<RoleHome />} />

              {/* Páginas que requieren empresa (tenant) */}
              <Route element={<ProtectedRoute requireTenant />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/conversations" element={<ConversationsPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/company" element={<CompanyPage />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>

              {/* SUPER_ADMIN only */}
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="clientes" element={<AdminTenantsPage />} />
                  <Route path="clientes/:id" element={<AdminTenantDetailPage />} />
                  <Route path="solicitudes-cancelacion" element={<AdminCancellationsPage />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
