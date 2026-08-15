// import { useEffect, useState } from 'react'
// import { useNavigate } from 'react-router-dom'
// import { AdminTenant, CancellationRequest } from '../../types'
// import api from '../../lib/api'
// import { StatCard } from '../../components/ui/Card'
// import Badge from '../../components/ui/Badge'
// import LoadingSpinner from '../../components/ui/LoadingSpinner'

// export default function AdminOverviewPage() {
//   const navigate = useNavigate()
//   const [tenants, setTenants] = useState<AdminTenant[]>([])
//   const [cancellations, setCancellations] = useState<CancellationRequest[]>([])
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     Promise.allSettled([
//       api.get<AdminTenant[]>('/api/admin/tenants'),
//       api.get<CancellationRequest[]>('/api/admin/cancellation-requests'),
//     ]).then(([t, c]) => {
//       if (t.status === 'fulfilled') setTenants(t.value)
//       if (c.status === 'fulfilled') setCancellations(c.value)
//       setLoading(false)
//     })
//   }, [])

//   if (loading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>

//   const active = tenants.filter(t => t.status === 'ACTIVE').length
//   const suspended = tenants.filter(t => t.status === 'SUSPENDED').length
//   const pending = cancellations.filter(c => c.status === 'PENDING').length

//   return (
//     <div className="p-6 space-y-6">
//       <h2 className="text-xl font-semibold text-slate-900">Resumen general</h2>

//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
//         <StatCard label="Total clientes" value={tenants.length} variant="primary" />
//         <StatCard label="Activos" value={active} variant="success" />
//         <StatCard label="Suspendidos" value={suspended} variant="warning" />
//         <StatCard label="Cancelaciones pendientes" value={pending} variant={pending > 0 ? 'danger' : 'default'} />
//       </div>

//       {/* Recent tenants */}
//       <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
//         <div className="p-4 border-b border-slate-100 flex items-center justify-between">
//           <h3 className="font-semibold text-slate-900 text-sm">Últimos clientes</h3>
//           <button
//             onClick={() => navigate('/admin/clientes')}
//             className="text-xs text-primary-600 hover:text-primary-700 font-medium"
//           >
//             Ver todos
//           </button>
//         </div>
//         <div className="overflow-x-auto">
//           <table className="w-full text-sm">
//             <thead className="bg-slate-50">
//               <tr>
//                 {['Empresa','Plan','Estado','Agentes','Creado'].map(h => (
//                   <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody className="divide-y divide-slate-100">
//               {tenants.slice(0, 8).map(t => (
//                 <tr
//                   key={t.id}
//                   className="hover:bg-slate-50 cursor-pointer"
//                   onClick={() => navigate(`/admin/clientes/${t.id}`)}
//                 >
//                   <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
//                   <td className="px-4 py-3"><Badge variant="info">{t.plan}</Badge></td>
//                   <td className="px-4 py-3">
//                     <Badge variant={t.status === 'ACTIVE' ? 'success' : t.status === 'SUSPENDED' ? 'warning' : 'danger'}>
//                       {t.status}
//                     </Badge>
//                   </td>
//                   <td className="px-4 py-3 text-slate-700">{t.agentsCount}</td>
//                   <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleDateString('es')}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   )
// }

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminTenant, CancellationRequest } from '../../types'
import api from '../../lib/api'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { StatCard } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

type AdminTenantsApiResponse = {
  success?: boolean
  tenants?: unknown
  data?: unknown
  items?: unknown
  total?: number
  page?: number
  limit?: number
  pages?: number
}

type AdminCancellationRequestsApiResponse = {
  success?: boolean
  data?: unknown
  cancellationRequests?: unknown
  requests?: unknown
  items?: unknown
}

function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>

    if (Array.isArray(obj.tenants)) return obj.tenants as T[]
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.items)) return obj.items as T[]
    if (Array.isArray(obj.cancellationRequests)) return obj.cancellationRequests as T[]
    if (Array.isArray(obj.requests)) return obj.requests as T[]

    if (obj.data && typeof obj.data === 'object') {
      const dataObj = obj.data as Record<string, unknown>

      if (Array.isArray(dataObj.tenants)) return dataObj.tenants as T[]
      if (Array.isArray(dataObj.items)) return dataObj.items as T[]
      if (Array.isArray(dataObj.data)) return dataObj.data as T[]
      if (Array.isArray(dataObj.cancellationRequests)) {
        return dataObj.cancellationRequests as T[]
      }
      if (Array.isArray(dataObj.requests)) return dataObj.requests as T[]
    }
  }

  return []
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

function toStringSafe(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback

  return String(value)
}

function formatDate(value: unknown): string {
  if (!value) return 'Sin fecha'

  const date = new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha'
  }

  return date.toLocaleDateString('es')
}

function normalizeTenant(raw: unknown): AdminTenant {
  const tenant = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>

  return {
    ...tenant,

    id: toStringSafe(tenant.id),
    name: toStringSafe(tenant.name || tenant.legalName || 'Sin nombre'),
    legalName: toStringSafe(tenant.legalName),
    email: toStringSafe(tenant.email),
    phone: toStringSafe(tenant.phone),
    industry: toStringSafe(tenant.industry),

    status: toStringSafe(tenant.status || 'ACTIVE') as AdminTenant['status'],

    plan:
      tenant.planName ||
      tenant.plan?.name ||
      tenant.subscription?.plan?.name ||
      tenant.subscription?.planName ||
      tenant.subscription?.plan ||
      tenant.plan ||
      'Sin plan',

    subscriptionStatus:
      tenant.subscriptionStatus ||
      tenant.subscription?.status ||
      tenant.statusSubscription ||
      'UNKNOWN',

    usersCount: toNumber(
      tenant.usersCount ??
        tenant._count?.users ??
        tenant._count?.User ??
        tenant.counts?.users
    ),

    agentsCount: toNumber(
      tenant.agentsCount ??
        tenant._count?.agents ??
        tenant._count?.Agent ??
        tenant.counts?.agents
    ),

    conversationsCount: toNumber(
      tenant.conversationsCount ??
        tenant._count?.conversations ??
        tenant._count?.Conversation ??
        tenant.counts?.conversations
    ),

    connectedNumbers: toNumber(
      tenant.connectedNumbers ??
        tenant._count?.connectedNumbers ??
        tenant._count?.whatsappNumbers ??
        tenant._count?.WhatsappNumber ??
        tenant.whatsappNumbersCount ??
        tenant.phoneNumbersCount ??
        tenant.counts?.connectedNumbers
    ),

    usedConversations: toNumber(
      tenant.usedConversations ??
        tenant.usage?.conversations ??
        tenant.metrics?.usedConversations ??
        tenant._count?.conversations ??
        tenant.counts?.conversations
    ),

    usedAudioMinutes: toNumber(
      tenant.usedAudioMinutes ??
        tenant.usage?.audioMinutes ??
        tenant.metrics?.usedAudioMinutes ??
        tenant.audioMinutes
    ),

    createdAt: toStringSafe(tenant.createdAt || new Date().toISOString()),
    updatedAt: toStringSafe(
      tenant.updatedAt || tenant.createdAt || new Date().toISOString()
    ),
  } as unknown as AdminTenant
}

function normalizeCancellation(raw: unknown): CancellationRequest {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>

  return {
    ...item,

    id: toStringSafe(item.id),
    tenantId: toStringSafe(item.tenantId),
    subscriptionId: toStringSafe(item.subscriptionId),
    requestedByUserId: toStringSafe(item.requestedByUserId),
    reason: toStringSafe(item.reason),
    adminNotes: toStringSafe(item.adminNotes),

    status: toStringSafe(item.status || 'UNKNOWN') as CancellationRequest['status'],

    createdAt: toStringSafe(item.createdAt || new Date().toISOString()),
    updatedAt: toStringSafe(
      item.updatedAt || item.createdAt || new Date().toISOString()
    ),
  } as unknown as CancellationRequest
}

export default function AdminOverviewPage() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [cancellations, setCancellations] = useState<CancellationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // silent=true: refresco de fondo sin spinner y conservando datos si falla
  const loadAdminData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    const [tenantsResult, cancellationsResult] = await Promise.allSettled([
      api.get<AdminTenantsApiResponse | AdminTenant[]>('/api/admin/tenants'),
      api.get<AdminCancellationRequestsApiResponse | CancellationRequest[]>(
        '/api/admin/cancellation-requests'
      ),
    ])

    if (tenantsResult.status === 'fulfilled') {
      setTenants(toArray(tenantsResult.value).map(normalizeTenant))
      setError(null)
    } else if (!silent) {
      console.error('Error cargando clientes admin:', tenantsResult.reason)
      setTenants([])
      setError('No se pudieron cargar los clientes.')
    }

    if (cancellationsResult.status === 'fulfilled') {
      setCancellations(toArray(cancellationsResult.value).map(normalizeCancellation))
    } else if (!silent) {
      console.error('Error cargando cancelaciones admin:', cancellationsResult.reason)
      setCancellations([])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadAdminData()
  }, [loadAdminData])

  // Vista admin casi en tiempo real (Parte A: cada 60s, agregados globales)
  useAutoRefresh(() => loadAdminData(true), 60_000)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const active = tenants.filter(t => t.status === 'ACTIVE').length
  const suspended = tenants.filter(t => t.status === 'SUSPENDED').length
  const pending = cancellations.filter(c => c.status === 'PENDING').length

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Resumen general</h2>
        <p className="text-sm text-slate-500">
          Vista administrativa de clientes, estados y solicitudes pendientes.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total clientes" value={tenants.length} variant="primary" />
        <StatCard label="Activos" value={active} variant="success" />
        <StatCard label="Suspendidos" value={suspended} variant="warning" />
        <StatCard
          label="Cancelaciones pendientes"
          value={pending}
          variant={pending > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm">Últimos clientes</h3>

          <button
            onClick={() => navigate('/admin/clientes')}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            Ver todos
          </button>
        </div>

        <div className="overflow-x-auto">
          {tenants.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No hay clientes registrados todavía.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Empresa', 'Plan', 'Estado', 'Agentes', 'Creado'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {tenants.slice(0, 8).map(t => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => navigate(`/admin/clientes/${t.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {t.name || 'Sin nombre'}
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant="info">{t.plan || 'Sin plan'}</Badge>
                    </td>

                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          t.status === 'ACTIVE'
                            ? 'success'
                            : t.status === 'SUSPENDED'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {t.status || 'UNKNOWN'}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {toNumber(t.agentsCount)}
                    </td>

                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(t.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}