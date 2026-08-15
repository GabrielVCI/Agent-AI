import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Ban, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { AdminTenant } from '../../types'
import api from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import NewClientModal from '../../components/admin/NewClientModal'
import PaginationBar from '../../components/ui/PaginationBar'
import { normalizePaginatedResponse } from '../../lib/pagination'

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

function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>

    if (Array.isArray(obj.tenants)) return obj.tenants as T[]
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.items)) return obj.items as T[]

    if (obj.data && typeof obj.data === 'object') {
      const dataObj = obj.data as Record<string, unknown>

      if (Array.isArray(dataObj.tenants)) return dataObj.tenants as T[]
      if (Array.isArray(dataObj.items)) return dataObj.items as T[]
      if (Array.isArray(dataObj.data)) return dataObj.data as T[]
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
      tenant.planDisplayName ||
      tenant.planName ||
      tenant.plan?.name ||
      tenant.subscription?.plan?.name ||
      tenant.subscription?.planName ||
      tenant.subscription?.plan ||
      tenant.plan ||
      'Sin plan',

    monthlyPrice: tenant.effectiveMonthlyPrice != null ? toNumber(tenant.effectiveMonthlyPrice) : null,
    planCurrency: toStringSafe(tenant.planCurrency, 'USD'),
    billingMode: toStringSafe(tenant.billingMode) || null,
    paymentStatus: toStringSafe(tenant.paymentStatus) || null,
    nextBillingDate: tenant.nextBillingDate ? toStringSafe(tenant.nextBillingDate) : null,

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

    usageMessages: toNumber(tenant.monthlyUsage?.totalMessages),
    usageLimit: toNumber(tenant.monthlyUsage?.messageLimit),
    usageExceeded: Boolean(tenant.monthlyUsage?.exceeded),

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

function statusBadge(status: AdminTenant['status']) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Activo</Badge>

    case 'SUSPENDED':
      return <Badge variant="warning">Suspendido</Badge>

    case 'CANCELLED':
      return <Badge variant="danger">Cancelado</Badge>

    case 'TRIALING':
      return <Badge variant="info">Prueba</Badge>

    default:
      return <Badge variant="default">Desconocido</Badge>
  }
}

export default function AdminTenantsPage() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<AdminTenant[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')

  // Paginación + search server-side (fase de listados): con >20 clientes el
  // buscador antes solo veía la primera página cargada.
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get<AdminTenantsApiResponse | AdminTenant[]>(
        '/api/admin/tenants',
        {
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          page,
          limit,
        }
      )

      const paged = normalizePaginatedResponse<unknown>(response)
      setTenants(paged.items.map(normalizeTenant))
      setTotal(paged.total)
      setPages(paged.pages)
    } catch (err: unknown) {
      const e = err as { message?: string }

      console.error('Error cargando clientes admin:', err)

      setTenants([])
      setError(e?.message || 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, limit])

  useEffect(() => {
    // Debounce del search (300ms); los demás filtros cargan de inmediato
    const t = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [load, search])

  // Microfiltro visual por nombre de plan (texto libre, sobre la página actual;
  // el filtrado crítico —search/status— ya es server-side)
  const filtered = tenants.filter(t => {
    if (planFilter && !toStringSafe(t.plan).toLowerCase().includes(planFilter.toLowerCase()))
      return false
    return true
  })

  const suspend = async (id: string) => {
    if (!id) return

    const confirmed = window.confirm('¿Seguro que deseas suspender este cliente?')

    if (!confirmed) return

    try {
      await api.post(`/api/admin/tenants/${id}/suspend`)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Error al suspender cliente')
    }
  }

  const reactivate = async (id: string) => {
    if (!id) return

    try {
      await api.post(`/api/admin/tenants/${id}/reactivate`)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Error al reactivar cliente')
    }
  }

  const cancelTenant = async (id: string) => {
    if (!id) return

    const confirmed = window.confirm('¿Seguro que deseas cancelar este cliente?')

    if (!confirmed) return

    try {
      await api.post(`/api/admin/tenants/${id}/cancel`)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Error al cancelar cliente')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Clientes</h2>
          <p className="text-sm text-slate-500">
            {tenants.length} empresas registradas
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={load}
          />

          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setModalOpen(true)
              setError('')
            }}
          >
            Nuevo cliente
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, correo, plan o estado..."
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activas</option>
          <option value="SUSPENDED">Suspendidas</option>
          <option value="CANCELLED">Canceladas</option>
        </select>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos los planes</option>
          <option value="Básico">Básico</option>
          <option value="Pro">Pro</option>
          <option value="Enterprise">Enterprise</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Sin resultados
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    'Empresa',
                    'Email',
                    'Plan',
                    'Mensualidad',
                    'Estado',
                    'Uso (mes)',
                    'Próx. cobro',
                    'Creado',
                    'Acciones',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {t.name || 'Sin nombre'}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {t.email || 'Sin correo'}
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant={toStringSafe(t.plan).includes('personalizado') || toStringSafe(t.billingMode) === 'CUSTOM' ? 'purple' : 'info'}>
                        {t.plan || 'Sin plan'}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {t.monthlyPrice != null ? (
                        <>
                          {t.planCurrency === 'USD' ? 'USD ' : ''}
                          {t.monthlyPrice.toLocaleString()}
                          {t.paymentStatus === 'OVERDUE' && (
                            <span className="ml-1 text-red-600 font-semibold" title="Pago atrasado">⚠</span>
                          )}
                          {t.billingMode === 'FREE' && (
                            <span className="ml-1 text-xs text-slate-400">(gratis)</span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {statusBadge(t.status)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {t.usageLimit > 0 ? (
                        <span
                          className={`text-sm ${
                            t.usageExceeded
                              ? 'text-red-600 font-semibold'
                              : t.usageMessages / t.usageLimit >= 0.8
                                ? 'text-amber-600 font-medium'
                                : 'text-slate-700'
                          }`}
                        >
                          {toNumber(t.usageMessages).toLocaleString()} /{' '}
                          {toNumber(t.usageLimit).toLocaleString()}
                          {t.usageExceeded && ' ⚠'}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">
                          {toNumber(t.usageMessages).toLocaleString()} / —
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {t.nextBillingDate ? formatDate(t.nextBillingDate) : '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/admin/clientes/${t.id}`)}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {t.status === 'ACTIVE' && (
                          <button
                            onClick={() => suspend(t.id)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Suspender"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}

                        {t.status === 'SUSPENDED' && (
                          <button
                            onClick={() => reactivate(t.id)}
                            className="p-1.5 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Reactivar"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}

                        {t.status === 'ACTIVE' && (
                          <button
                            onClick={() => cancelTenant(t.id)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Cancelar"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="px-4 pb-3">
            <PaginationBar
              total={total}
              page={page}
              pages={pages}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={l => {
                setLimit(l)
                setPage(1)
              }}
              noun="clientes"
            />
          </div>
        )}
      </div>

      <NewClientModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} />
    </div>
  )
}