import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Tags, Plus, Search, Check, Sparkles, Settings2 } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import Alert from '../ui/Alert'
import CategoryBadge from './CategoryBadge'
import { getUserFriendlyErrorMessage } from '../../lib/errors'
import {
  customerCategoriesApi,
  type CustomerCategory,
  type CustomerCategoryAssignment,
} from '../../services/customerCategoriesApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

interface Props {
  customerId: string
  canManage: boolean
  /** Se avisa al padre para que refresque la ficha (las insignias del header). */
  onChanged?: () => void
}

/**
 * Categorías del cliente en su ficha (Módulo 2).
 *
 * Las manuales se añaden y se quitan desde aquí; las automáticas se muestran
 * con su chispa pero sin la X, porque quien decide su pertenencia es la ficha
 * (VIP, riesgo) o una automatización. En vez de dar un error al intentarlo, la
 * UI directamente no ofrece la acción y lo explica.
 */
export default function CustomerCategoriesCard({ customerId, canManage, onChanged }: Props) {
  const [assigned, setAssigned] = useState<CustomerCategoryAssignment[]>([])
  const [available, setAvailable] = useState<CustomerCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const rows = await customerCategoriesApi.forCustomer(customerId)
      setAssigned(rows)
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  // Las manuales activas solo se piden al abrir el selector: la ficha no tiene
  // por qué cargarlas si nadie va a asignar nada.
  useEffect(() => {
    if (!pickerOpen || available.length > 0) return
    customerCategoriesApi
      .list({ type: 'MANUAL' })
      .then(setAvailable)
      .catch(err => setError(getUserFriendlyErrorMessage(err)))
  }, [pickerOpen, available.length])

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!pickerOpen) return
    const onClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pickerOpen])

  const toggle = async (category: CustomerCategory, isAssigned: boolean) => {
    setBusyId(category.id)
    setError('')
    try {
      const rows = isAssigned
        ? await customerCategoriesApi.remove(customerId, category.id)
        : await customerCategoriesApi.assign(customerId, category.id)
      setAssigned(rows)
      onChanged?.()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const removeAssigned = async (assignment: CustomerCategoryAssignment) => {
    setBusyId(assignment.id)
    setError('')
    try {
      const rows = await customerCategoriesApi.remove(customerId, assignment.id)
      setAssigned(rows)
      onChanged?.()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const assignedIds = new Set(assigned.map(item => item.id))
  const term = search.trim().toLowerCase()
  const options = available.filter(item => !term || item.name.toLowerCase().includes(term))

  return (
    <Card>
      <CardHeader
        title="Categorías"
        description="Cómo está clasificado este cliente"
        action={
          <Link
            to="/clientes/categorias"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary-600 transition"
            title="Administrar categorías"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Administrar
          </Link>
        }
      />

      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {assigned.length === 0 && !canManage && (
            <p className="text-sm text-slate-400">Sin categorías todavía.</p>
          )}

          {assigned.map(item => (
            <CategoryBadge
              key={item.id}
              category={item}
              removing={busyId === item.id}
              onRemove={canManage ? () => void removeAssigned(item) : undefined}
            />
          ))}

          {canManage && (
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setPickerOpen(!pickerOpen)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-dashed border-slate-300 text-xs text-slate-500 hover:border-primary-400 hover:text-primary-600 transition"
              >
                <Plus className="h-3 w-3" />
                Agregar
              </button>

              {pickerOpen && (
                <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar categoría…"
                        className={`${inputClass} pl-8 py-1.5 text-xs`}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto py-1">
                    {options.length === 0 ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-xs text-slate-500">
                          {available.length === 0
                            ? 'Todavía no tienes categorías manuales.'
                            : 'No encontramos esa categoría.'}
                        </p>
                        <Link
                          to="/clientes/categorias"
                          className="mt-1 inline-block text-xs text-primary-600 hover:underline"
                        >
                          Crear una
                        </Link>
                      </div>
                    ) : (
                      options.map(option => {
                        const isAssigned = assignedIds.has(option.id)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={busyId === option.id}
                            onClick={() => void toggle(option, isAssigned)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 transition disabled:opacity-50"
                          >
                            <CategoryBadge category={option} />
                            {isAssigned && <Check className="h-4 w-4 text-primary-600" />}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {assigned.some(item => item.type === 'AUTOMATIC') && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
          Las categorías con chispa se mantienen solas: entran y salen según la ficha del cliente
          o una automatización.
        </p>
      )}

      {!loading && assigned.length === 0 && canManage && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
          <Tags className="h-3.5 w-3.5 flex-shrink-0" />
          Clasifícalo para encontrarlo rápido y usarlo después en campañas y seguimientos.
        </p>
      )}
    </Card>
  )
}
