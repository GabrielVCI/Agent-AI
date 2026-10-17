import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Tags, Plus, Search, Pencil, Archive, ArchiveRestore, Users, Sparkles,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import CategoryFormModal from '../components/customers/CategoryFormModal'
import CategoryBadge, { CategoryTypeBadge } from '../components/customers/CategoryBadge'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import {
  customerCategoriesApi,
  managedByLabel,
  type CustomerCategory,
} from '../services/customerCategoriesApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

export default function CustomerCategoriesPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [categories, setCategories] = useState<CustomerCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerCategory | null>(null)
  const [confirming, setConfirming] = useState<CustomerCategory | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await customerCategoriesApi.list({
        search: search.trim() || undefined,
        type: (typeFilter || undefined) as CustomerCategory['type'] | undefined,
        includeArchived: showArchived || undefined,
      })
      setCategories(data)
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter, showArchived])

  useEffect(() => {
    // Debounce de 300 ms solo para el buscador; el resto carga de inmediato.
    const timer = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const toggleArchive = async (category: CustomerCategory) => {
    setBusy(true)
    try {
      const archived = category.status === 'ACTIVE'
      await customerCategoriesApi.archive(category.id, archived)
      flash(
        archived
          ? `"${category.name}" quedó archivada. Sus clientes conservan el historial.`
          : `"${category.name}" volvió a estar disponible.`
      )
      setConfirming(null)
      await load()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
      setConfirming(null)
    } finally {
      setBusy(false)
    }
  }

  const hasFilters = Boolean(search || typeFilter || showArchived)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a clientes
      </Link>

      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Categorías de clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Organiza tu cartera para filtrarla, entenderla y usarla en tus automatizaciones
          </p>
        </div>
        {canManage && (
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            Nueva categoría
          </Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Barra compacta de filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(200px,1fr)_170px] gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar categoría…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className={inputClass}
          title="Tipo"
        >
          <option value="">Todos los tipos</option>
          <option value="MANUAL">Manuales</option>
          <option value="AUTOMATIC">Automáticas</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${
            showArchived
              ? 'bg-slate-100 border-slate-400 text-slate-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Archive className="h-3.5 w-3.5" />
          Ver archivadas
        </button>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch('')
              setTypeFilter('')
              setShowArchived(false)
            }}
            className="px-3 py-1.5 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 transition"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <Card padding="none">
        {categories.length === 0 ? (
          <EmptyState
            icon={<Tags className="h-10 w-10" />}
            title={
              hasFilters
                ? 'No encontramos categorías con estos filtros'
                : 'Aún no tienes categorías propias'
            }
            description={
              hasFilters
                ? 'Ajusta la búsqueda o limpia los filtros para ver todas.'
                : 'Crea categorías manuales para agrupar a tus clientes por servicio, tipo de negocio o lo que necesites. Las de VIP y riesgo de abandono ya se mantienen solas desde la ficha.'
            }
            action={
              canManage && !hasFilters ? (
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  Crear categoría
                </Button>
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
                    <th className="px-4 py-3 font-medium">Categoría</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium text-center">Clientes</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map(category => (
                    <tr key={category.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <CategoryBadge category={category} />
                        {category.description && (
                          <p className="mt-1 text-xs text-slate-500 max-w-md">
                            {category.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <CategoryTypeBadge type={category.type} />
                          {category.type === 'AUTOMATIC' && (
                            <span className="text-[11px] text-slate-400 max-w-[220px]">
                              {managedByLabel(category)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          to={`/clientes?categoria=${category.id}`}
                          className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-primary-600 transition"
                          title="Ver esos clientes"
                        >
                          <Users className="h-3.5 w-3.5" />
                          {category.customerCount}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs ${
                            category.status === 'ACTIVE' ? 'text-green-600' : 'text-slate-400'
                          }`}
                        >
                          {category.status === 'ACTIVE' ? 'Activa' : 'Archivada'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (
                            <button
                              title="Editar"
                              onClick={() => {
                                setEditing(category)
                                setFormOpen(true)
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canManage && !category.isSystem && (
                            <button
                              title={category.status === 'ACTIVE' ? 'Archivar' : 'Restaurar'}
                              onClick={() =>
                                category.status === 'ACTIVE'
                                  ? setConfirming(category)
                                  : void toggleArchive(category)
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            >
                              {category.status === 'ACTIVE' ? (
                                <Archive className="h-4 w-4" />
                              ) : (
                                <ArchiveRestore className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: tarjetas (nada de tablas con scroll horizontal) */}
            <div className="md:hidden divide-y divide-slate-100">
              {categories.map(category => (
                <div key={category.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CategoryBadge category={category} />
                      {category.description && (
                        <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                      )}
                    </div>
                    <CategoryTypeBadge type={category.type} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <Link
                      to={`/clientes?categoria=${category.id}`}
                      className="inline-flex items-center gap-1 hover:text-primary-600"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {category.customerCount} cliente{category.customerCount === 1 ? '' : 's'}
                    </Link>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(category)
                            setFormOpen(true)
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!category.isSystem && (
                          <button
                            onClick={() =>
                              category.status === 'ACTIVE'
                                ? setConfirming(category)
                                : void toggleArchive(category)
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                          >
                            {category.status === 'ACTIVE' ? (
                              <Archive className="h-4 w-4" />
                            ) : (
                              <ArchiveRestore className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <div className="flex items-start gap-2 text-xs text-slate-500">
        <Sparkles className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p>
          Las categorías <strong>automáticas</strong> las mantiene Sendwary: entran y salen solas
          según la ficha del cliente o una automatización, así que no se asignan a mano.
        </p>
      </div>

      <CategoryFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={category => {
          flash(editing ? 'Categoría actualizada' : `"${category.name}" está lista para usarse`)
          void load()
        }}
      />

      {/* Confirmación de archivado: es una acción que cambia lo que ve todo el equipo */}
      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title="¿Archivar esta categoría?"
        size="sm"
      >
        <p className="text-sm text-slate-600">
          <strong>{confirming?.name}</strong> dejará de ofrecerse para nuevas asignaciones.
          {confirming && confirming.customerCount > 0 && (
            <>
              {' '}
              Sus {confirming.customerCount} cliente(s) la conservan en su historial: no se pierde
              nada y puedes restaurarla cuando quieras.
            </>
          )}
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={() => setConfirming(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => confirming && void toggleArchive(confirming)}
          >
            Archivar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
