import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users, Plus, Search, Upload, Star, AlertTriangle, CalendarPlus, ChevronRight, Tags, X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PaginationBar from '../components/ui/PaginationBar'
import CustomerFormModal from '../components/customers/CustomerFormModal'
import CustomerImportModal from '../components/customers/CustomerImportModal'
import CategoryBadge from '../components/customers/CategoryBadge'
import {
  customersApi,
  type CustomerCounters,
  type CustomerFilters,
  type CustomerListItem,
  type CustomerProfile,
} from '../services/customersApi'
import {
  customerCategoriesApi,
  type CustomerCategory,
} from '../services/customerCategoriesApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

/** Presets de "sin regresar" (§31): el backend filtra por lastVisitAt. */
const INACTIVE_PRESETS = [15, 30, 60, 90] as const

export function stageBadge(stage: CustomerListItem['stage']) {
  if (stage === 'CLIENT') return <Badge variant="success">Cliente</Badge>
  if (stage === 'ARCHIVED') return <Badge variant="default">Archivado</Badge>
  return <Badge variant="info">Contacto</Badge>
}

export function riskBadge(risk: CustomerListItem['riskStatus']) {
  if (risk === 'HIGH') return <Badge variant="danger">Riesgo alto</Badge>
  if (risk === 'MEDIUM') return <Badge variant="warning">Riesgo medio</Badge>
  if (risk === 'LOW') return <Badge variant="default">Riesgo bajo</Badge>
  return null
}

export function formatDate(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** "hace 12 días" / "nunca": lo que el negocio realmente quiere leer. */
export function relativeVisit(item: { lastVisitAt: string | null; daysSinceLastVisit: number | null }) {
  if (!item.lastVisitAt || item.daysSinceLastVisit === null) return 'Sin visitas'
  if (item.daysSinceLastVisit === 0) return 'Hoy'
  if (item.daysSinceLastVisit === 1) return 'Ayer'
  return `Hace ${item.daysSinceLastVisit} días`
}

export default function CustomersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [counters, setCounters] = useState<CustomerCounters | null>(null)
  const [categories, setCategories] = useState<CustomerCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filtros (todos server-side)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  // Categorías seleccionadas. El enlace "42 clientes" del panel de categorías
  // llega con ?categoria=<id>, así que el filtro nace de la URL.
  const [categoryIds, setCategoryIds] = useState<string[]>(() => {
    const fromUrl = searchParams.get('categoria')
    return fromUrl ? [fromUrl] : []
  })
  // ALL por defecto: "VIP + Coloración" son los que tienen AMBAS, que es lo que
  // espera quien combina dos categorías. `any` es explícito, nunca implícito.
  const [categoryMatch, setCategoryMatch] = useState<'all' | 'any'>('all')
  const [risk, setRisk] = useState('')
  const [onlyVip, setOnlyVip] = useState(false)
  const [inactiveDays, setInactiveDays] = useState<number | ''>('')
  const [sortBy, setSortBy] = useState<NonNullable<CustomerFilters['sortBy']>>('lastVisitAt')

  // Paginación server-side. REGLA: cualquier cambio de filtro resetea page=1.
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerProfile | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await customersApi.list({
        search: search.trim() || undefined,
        stage: (stage || undefined) as CustomerFilters['stage'],
        categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
        categoryMatch: categoryIds.length > 1 ? categoryMatch : undefined,
        riskStatus: (risk || undefined) as CustomerFilters['riskStatus'],
        isVip: onlyVip || undefined,
        inactiveDays: inactiveDays === '' ? undefined : inactiveDays,
        page,
        limit,
        sortBy,
        sortOrder: sortBy === 'name' ? 'asc' : 'desc',
      })
      setCustomers(result.items)
      setTotal(result.total)
      setPages(result.pages)
    } catch (err) {
      setError((err as { message?: string })?.message || 'No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }, [search, stage, categoryIds, categoryMatch, risk, onlyVip, inactiveDays, page, limit, sortBy])

  useEffect(() => {
    // Debounce de 300 ms solo para el buscador; el resto carga de inmediato.
    const timer = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const loadAside = useCallback(() => {
    customersApi.counters().then(setCounters).catch(() => setCounters(null))
    customerCategoriesApi.list().then(setCategories).catch(() => setCategories([]))
  }, [])

  useEffect(loadAside, [loadAside])

  // Clientes nuevos (creados por el agente IA o por una cita) sin recargar.
  useAutoRefresh(load, 60_000)

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const refreshAll = () => {
    void load()
    loadAside()
  }

  /** Alterna una categoría del filtro. Cualquier cambio de filtro resetea page=1. */
  const toggleCategory = (id: string) => {
    setCategoryIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id]
    )
    setPage(1)
    // El ?categoria= de la URL solo sirve para llegar desde el panel de
    // categorías; una vez el usuario toca el filtro deja de mandar.
    if (searchParams.has('categoria')) {
      searchParams.delete('categoria')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const hasFilters = Boolean(
    search || stage || categoryIds.length > 0 || risk || onlyVip || inactiveDays !== ''
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tu maestro de clientes: WhatsApp, citas, importaciones y altas manuales en un solo lugar
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Tags className="h-4 w-4" />}
              onClick={() => navigate('/clientes/categorias')}
            >
              Categorías
            </Button>
            <Button
              variant="outline"
              icon={<Upload className="h-4 w-4" />}
              onClick={() => setImportOpen(true)}
            >
              Importar
            </Button>
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              Nuevo cliente
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Contadores reales del maestro */}
      {counters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: 'En el maestro', value: counters.total, tone: 'text-slate-900' },
            { label: 'Clientes', value: counters.clients, tone: 'text-green-600' },
            { label: 'Contactos', value: counters.contacts, tone: 'text-blue-600' },
            { label: 'VIP', value: counters.vip, tone: 'text-amber-600' },
            { label: 'En riesgo', value: counters.atRisk, tone: 'text-red-600' },
          ].map(item => (
            <Card key={item.label} padding="sm">
              <p className={`text-xl font-bold ${item.tone}`}>{item.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {item.label}
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* Barra compacta de filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1fr)_140px_150px_160px] gap-2">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => withPageReset(setSearch)(e.target.value)}
            placeholder="Nombre, teléfono o email…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={stage}
          onChange={e => withPageReset(setStage)(e.target.value)}
          className={inputClass}
          title="Tipo"
        >
          <option value="">Todos</option>
          <option value="CLIENT">Clientes</option>
          <option value="CONTACT">Contactos</option>
          <option value="ARCHIVED">Archivados</option>
        </select>
        <select
          value={risk}
          onChange={e => withPageReset(setRisk)(e.target.value)}
          className={inputClass}
          title="Riesgo de abandono"
        >
          <option value="">Todo riesgo</option>
          <option value="NONE">Sin riesgo</option>
          <option value="LOW">Riesgo bajo</option>
          <option value="MEDIUM">Riesgo medio</option>
          <option value="HIGH">Riesgo alto</option>
        </select>
        <select
          value={sortBy}
          onChange={e => withPageReset(setSortBy)(e.target.value as typeof sortBy)}
          className={inputClass}
          title="Ordenar por"
        >
          <option value="lastVisitAt">Última visita</option>
          <option value="visitCount">Más visitas</option>
          <option value="createdAt">Más recientes</option>
          <option value="name">Nombre (A-Z)</option>
        </select>
      </div>

      {/* Filtro por categorías (server-side, admite varias) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link
          to="/clientes/categorias"
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-primary-600 transition"
          title="Administrar categorías"
        >
          <Tags className="h-3.5 w-3.5" />
          Categorías:
        </Link>

        {categories.length === 0 ? (
          <Link to="/clientes/categorias" className="text-primary-600 hover:underline">
            Crea la primera
          </Link>
        ) : (
          categories.map(category => {
            const active = categoryIds.includes(category.id)
            return (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border transition ${
                  active
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {category.name}
                <span className="text-slate-400">{category.customerCount}</span>
                {active && <X className="h-3 w-3" />}
              </button>
            )
          })
        )}

        {/* La semántica del filtro múltiple es EXPLÍCITA, nunca implícita */}
        {categoryIds.length > 1 && (
          <div className="inline-flex rounded-full border border-slate-300 overflow-hidden">
            {(['all', 'any'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => {
                  setCategoryMatch(mode)
                  setPage(1)
                }}
                className={`px-3 py-1.5 transition ${
                  categoryMatch === mode
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                title={
                  mode === 'all'
                    ? 'Clientes que están en TODAS las categorías elegidas'
                    : 'Clientes que están en ALGUNA de las categorías elegidas'
                }
              >
                {mode === 'all' ? 'Todas' : 'Alguna'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => withPageReset(setOnlyVip)(!onlyVip)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${
            onlyVip
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${onlyVip ? 'fill-amber-400 text-amber-400' : ''}`} />
          Solo VIP
        </button>
        <span className="text-slate-400">Sin regresar:</span>
        {INACTIVE_PRESETS.map(days => (
          <button
            key={days}
            onClick={() => withPageReset(setInactiveDays)(inactiveDays === days ? '' : days)}
            className={`px-3 py-1.5 rounded-full border transition ${
              inactiveDays === days
                ? 'bg-primary-50 border-primary-300 text-primary-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {days}+ días
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={() => {
              setSearch('')
              setStage('')
              setCategoryIds([])
              setRisk('')
              setOnlyVip(false)
              setInactiveDays('')
              setPage(1)
            }}
            className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 transition"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <Card padding="none">
        {customers.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title={
              hasFilters
                ? 'No encontramos resultados con estos filtros'
                : 'Todavía no tienes clientes'
            }
            description={
              hasFilters
                ? 'Ajusta la búsqueda o limpia los filtros para ver todo tu maestro.'
                : 'Se registran solos cuando alguien agenda una cita por WhatsApp, o puedes crearlos e importarlos tú.'
            }
            action={
              canManage && !hasFilters ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => {
                      setEditing(null)
                      setFormOpen(true)
                    }}
                  >
                    Nuevo cliente
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Upload className="h-4 w-4" />}
                    onClick={() => setImportOpen(true)}
                  >
                    Importar
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop: tabla compacta */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">WhatsApp</th>
                    <th className="px-4 py-3 font-medium">Última visita</th>
                    <th className="px-4 py-3 font-medium text-center">Visitas</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map(customer => (
                    <tr key={customer.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/clientes/${customer.id}`}
                          className="font-medium text-slate-900 hover:text-primary-600 transition-colors"
                        >
                          {customer.name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {customer.email && (
                            <span className="text-xs text-slate-500 truncate max-w-[220px]">
                              {customer.email}
                            </span>
                          )}
                          {customer.categories.slice(0, 3).map(category => (
                            <CategoryBadge key={category.id} category={category} />
                          ))}
                          {customer.categories.length > 3 && (
                            <span className="text-xs text-slate-400">
                              +{customer.categories.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {customer.phoneDisplay}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-slate-700">{relativeVisit(customer)}</span>
                        {customer.lastVisitAt && (
                          <span className="block text-xs text-slate-400">
                            {formatDate(customer.lastVisitAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-700">
                        {customer.visitCount}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {stageBadge(customer.stage)}
                          {customer.isVip && (
                            <Badge variant="warning">
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              VIP
                            </Badge>
                          )}
                          {riskBadge(customer.riskStatus)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Agendar cita"
                            onClick={() =>
                              navigate(
                                `/appointments?new=1&name=${encodeURIComponent(
                                  customer.name
                                )}&phone=${encodeURIComponent(customer.phoneNormalized ?? customer.phone)}`
                              )
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition"
                          >
                            <CalendarPlus className="h-4 w-4" />
                          </button>
                          <Link
                            to={`/clientes/${customer.id}`}
                            title="Ver ficha"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: tarjetas (nada de tablas con scroll horizontal) */}
            <div className="md:hidden divide-y divide-slate-100">
              {customers.map(customer => (
                <Link
                  key={customer.id}
                  to={`/clientes/${customer.id}`}
                  className="block px-4 py-3 active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{customer.name}</p>
                      <p className="text-sm text-slate-500">{customer.phoneDisplay}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {stageBadge(customer.stage)}
                      {customer.isVip && <Badge variant="warning">VIP</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>{relativeVisit(customer)}</span>
                    <span>·</span>
                    <span>
                      {customer.visitCount} visita{customer.visitCount === 1 ? '' : 's'}
                    </span>
                    {customer.riskStatus !== 'NONE' && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {customer.riskStatus === 'HIGH' ? 'Riesgo alto' : 'En riesgo'}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            <div className="px-4 pb-3">
              <PaginationBar
                total={total}
                page={page}
                pages={pages}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={value => {
                  setLimit(value)
                  setPage(1)
                }}
                noun="clientes"
              />
            </div>
          </>
        )}
      </Card>

      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={customer => {
          flash(editing ? 'Cliente actualizado' : `${customer.name} se agregó a tu maestro`)
          refreshAll()
        }}
      />

      <CustomerImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          flash('Importación completada')
          refreshAll()
        }}
      />
    </div>
  )
}
