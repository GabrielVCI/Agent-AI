import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Ban, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { AdminTenant } from '../../types'
import api from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Alert from '../../components/ui/Alert'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

interface NewTenantForm {
  name: string
  email: string
  ownerName: string
  planId: string
}

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

const defaultForm: NewTenantForm = {
  name: '',
  email: '',
  ownerName: '',
  planId: '',
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
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<NewTenantForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get<AdminTenantsApiResponse | AdminTenant[]>(
        '/api/admin/tenants'
      )

      const normalizedTenants = toArray(response).map(normalizeTenant)

      setTenants(normalizedTenants)
    } catch (err: unknown) {
      const e = err as { message?: string }

      console.error('Error cargando clientes admin:', err)

      setTenants([])
      setError(e?.message || 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const normalizedSearch = search.trim().toLowerCase()

  const filtered = tenants.filter(t => {
    if (!normalizedSearch) return true

    const name = toStringSafe(t.name).toLowerCase()
    const email = toStringSafe(t.email).toLowerCase()
    const plan = toStringSafe(t.plan).toLowerCase()
    const status = toStringSafe(t.status).toLowerCase()

    return (
      name.includes(normalizedSearch) ||
      email.includes(normalizedSearch) ||
      plan.includes(normalizedSearch) ||
      status.includes(normalizedSearch)
    )
  })

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nombre y correo son requeridos')
      return
    }

    setSaving(true)
    setError('')

    try {
      await api.post('/api/admin/tenants', {
        name: form.name.trim(),
        email: form.email.trim(),
        ownerName: form.ownerName.trim(),
        planId: form.planId.trim() || undefined,
      })

      setModalOpen(false)
      setForm(defaultForm)
      await load()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Error al crear cliente')
    } finally {
      setSaving(false)
    }
  }

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />

        <input
          type="text"
          placeholder="Buscar por nombre, correo, plan o estado..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
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
                    'Estado',
                    'Agentes',
                    'Números',
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
                      <Badge variant="info">{t.plan || 'Sin plan'}</Badge>
                    </td>

                    <td className="px-4 py-3">
                      {statusBadge(t.status)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {toNumber(t.agentsCount)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {toNumber(t.connectedNumbers)}
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
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Crear nuevo cliente"
        size="md"
      >
        <div className="space-y-4">
          {error && (
            <Alert variant="danger">
              {error}
            </Alert>
          )}

          <div>
            <label className="label">Nombre de la empresa *</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Correo del propietario *</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Nombre del propietario</label>
            <input
              className="input"
              value={form.ownerName}
              onChange={e => setForm(p => ({ ...p, ownerName: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Plan</label>
            <input
              className="input"
              value={form.planId}
              onChange={e => setForm(p => ({ ...p, planId: e.target.value }))}
              placeholder="ID del plan"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>

            <Button
              loading={saving}
              onClick={handleCreate}
              className="flex-1"
            >
              Crear cliente
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}