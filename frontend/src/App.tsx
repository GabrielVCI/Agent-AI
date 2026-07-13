import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import IntegrationsPage from './pages/IntegrationsPage'
import OnboardingPage from './pages/OnboardingPage'
import ForbiddenPage from './pages/ForbiddenPage'
import DashboardPage from './pages/DashboardPage'
import ConversationsPage from './pages/ConversationsPage'
import AgentsPage from './pages/AgentsPage'
import CatalogPage from './pages/CatalogPage'
import AppointmentsPage from './pages/AppointmentsPage'
import CallsPage from './pages/CallsPage'
import SettingsPage from './pages/SettingsPage'
import CompanyPage from './pages/CompanyPage'
import AccountPage from './pages/AccountPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminTenantsPage from './pages/admin/AdminTenantsPage'
import AdminTenantDetailPage from './pages/admin/AdminTenantDetailPage'
import AdminCancellationsPage from './pages/admin/AdminCancellationsPage'
import AdminSupportPage from './pages/admin/AdminSupportPage'

/**
 * Landing por rol: SUPER_ADMIN -> panel admin; usuarios sin empresa (recién
 * registrados) -> onboarding; resto -> dashboard de su empresa.
 */
function RoleHome() {
  const { user } = useAuth()
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />
  if (user && !user.tenantId) return <Navigate to="/onboarding" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {/* Rutas autenticadas */}
          <Route element={<ProtectedRoute />}>
            {/* Onboarding: autenticado pero sin Layout (el usuario aún no tiene empresa) */}
            <Route path="/onboarding" element={<OnboardingPage />} />

            <Route element={<Layout />}>
              {/* "/" decide destino según el rol (evita que SUPER_ADMIN caiga en dashboard tenant) */}
              <Route index element={<RoleHome />} />

              {/* Páginas que requieren empresa (tenant) */}
              <Route element={<ProtectedRoute requireTenant />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/conversations" element={<ConversationsPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/appointments" element={<AppointmentsPage />} />
                <Route path="/calls" element={<CallsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/company" element={<CompanyPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>

              {/* SUPER_ADMIN only */}
              <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverviewPage />} />
                  <Route path="clientes" element={<AdminTenantsPage />} />
                  <Route path="clientes/:id" element={<AdminTenantDetailPage />} />
                  <Route path="solicitudes-cancelacion" element={<AdminCancellationsPage />} />
                  <Route path="soporte" element={<AdminSupportPage />} />
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
