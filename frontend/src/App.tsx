import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import RequireActiveSubscription from './components/RequireActiveSubscription'
import ActivatePlanPage from './pages/ActivatePlanPage'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import VerifyEmailPendingPage from './pages/VerifyEmailPendingPage'
import ImplementationPendingPage from './pages/ImplementationPendingPage'
import IntegrationsPage from './pages/IntegrationsPage'
import OnboardingPage from './pages/OnboardingPage'
import ForbiddenPage from './pages/ForbiddenPage'
import NotFoundPage from './pages/NotFoundPage'
import DashboardPage from './pages/DashboardPage'
import ConversationsPage from './pages/ConversationsPage'
import AgentsPage from './pages/AgentsPage'
import CatalogPage from './pages/CatalogPage'
import AppointmentsPage from './pages/AppointmentsPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import CustomerCategoriesPage from './pages/CustomerCategoriesPage'
import AutomationsPage from './pages/AutomationsPage'
import MaintenancePage from './pages/MaintenancePage'
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
 * Landing por rol: SUPER_ADMIN -> panel admin; correo sin verificar ->
 * pantalla de verificación; usuarios sin empresa (recién registrados) ->
 * onboarding; resto -> dashboard de su empresa.
 */
function RoleHome() {
  const { user } = useAuth()
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/admin" replace />
  if (user && user.emailVerified === false) return <Navigate to="/verificar-correo" replace />
  if (user && !user.tenantId) return <Navigate to="/onboarding" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Destino del botón "Verificar Cuenta" del correo (pública) */}
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {/* Rutas autenticadas */}
          <Route element={<ProtectedRoute />}>
            {/* Onboarding: autenticado pero sin Layout (el usuario aún no tiene empresa) */}
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* Pantalla "Verifica tu correo": autenticado, sin más requisitos
                (anti-loop: fuera del gate de activación) */}
            <Route path="/verificar-correo" element={<VerifyEmailPendingPage />} />

            {/* Paywall e implementación: requieren empresa pero NO plan activo.
                Fuera del Layout y fuera de RequireActiveSubscription (anti-loop). */}
            <Route element={<ProtectedRoute requireTenant />}>
              <Route path="/activate" element={<ActivatePlanPage />} />
              <Route path="/implementacion" element={<ImplementationPendingPage />} />
            </Route>

            <Route element={<Layout />}>
              {/* "/" decide destino según el rol (evita que SUPER_ADMIN caiga en dashboard tenant) */}
              <Route index element={<RoleHome />} />

              {/* Páginas que requieren empresa (tenant) Y plan activo (paywall) */}
              <Route element={<ProtectedRoute requireTenant />}>
                <Route element={<RequireActiveSubscription />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/conversations" element={<ConversationsPage />} />
                  <Route path="/agents" element={<AgentsPage />} />
                  <Route path="/catalog" element={<CatalogPage />} />
                  <Route path="/appointments" element={<AppointmentsPage />} />
                  <Route path="/clientes" element={<CustomersPage />} />
                  {/* Estática ANTES que /:id: React Router prioriza el segmento fijo,
                      pero se deja explícito para que no dependa de ese detalle. */}
                  <Route path="/clientes/categorias" element={<CustomerCategoriesPage />} />
                  <Route path="/clientes/:id" element={<CustomerDetailPage />} />
                  <Route path="/calls" element={<CallsPage />} />
                  <Route path="/automatizaciones" element={<AutomationsPage />} />
                  <Route path="/mantenimiento" element={<MaintenancePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/company" element={<CompanyPage />} />
                  <Route path="/integrations" element={<IntegrationsPage />} />
                  <Route path="/account" element={<AccountPage />} />
                </Route>
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

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
