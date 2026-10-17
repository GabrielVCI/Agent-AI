import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Trash2, Check, Ban, Scissors, ShoppingBag, FlaskConical, RotateCw, Lock,
} from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Alert from '../ui/Alert'
import LoadingSpinner from '../ui/LoadingSpinner'
import { getUserFriendlyErrorMessage } from '../../lib/errors'
import {
  appointmentsApi,
  type Appointment,
  type AppointmentLine,
  type AppointmentLineKind,
} from '../../services/appointmentsApi'
import { catalogApi, type CatalogItem } from '../../services/catalogApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const KIND_META: Record<
  AppointmentLineKind,
  { label: string; hint: string; icon: React.ReactNode; variant: 'purple' | 'success' | 'default' }
> = {
  SERVICE: {
    label: 'Servicio',
    hint: 'Trabajo realizado al cliente',
    icon: <Scissors className="h-3.5 w-3.5" />,
    variant: 'purple',
  },
  PRODUCT_SOLD: {
    label: 'Producto vendido',
    hint: 'El cliente se lo lleva y lo paga',
    icon: <ShoppingBag className="h-3.5 w-3.5" />,
    variant: 'success',
  },
  PRODUCT_USED: {
    label: 'Material usado',
    hint: 'Se gastó durante el servicio: no se le cobra al cliente',
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    variant: 'default',
  },
}

function money(amount: number): string {
  return amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

interface Props {
  open: boolean
  appointment: Appointment | null
  onClose: () => void
  /** Se avisa al padre para que recargue el listado. */
  onChanged: () => void
}

/**
 * Servicios y productos de una cita (Módulo 3).
 *
 * Una cita cerrada es historial: el backend rechaza editarla, así que aquí
 * pasa a modo solo lectura y se ofrece "Reabrir" en su lugar. Los importes que
 * se ven de una cita cerrada son los del día en que se cerró, no los del
 * catálogo de hoy.
 */
export default function AppointmentLinesModal({ open, appointment, onClose, onChanged }: Props) {
  const [lines, setLines] = useState<AppointmentLine[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Formulario de alta
  const [productId, setProductId] = useState('')
  const [customName, setCustomName] = useState('')
  const [kind, setKind] = useState<AppointmentLineKind>('SERVICE')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState<number | ''>('')

  const closed = appointment?.status === 'COMPLETED'
  const cancelled = appointment?.status === 'CANCELLED'
  const editable = Boolean(appointment) && !closed && !cancelled

  const load = useCallback(async () => {
    if (!appointment) return
    setError('')
    try {
      const rows = await appointmentsApi.lines(appointment.id)
      setLines(rows)
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [appointment])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void load()
  }, [open, load])

  // El catálogo solo hace falta si se puede editar.
  useEffect(() => {
    if (!open || !editable || catalog.length > 0) return
    catalogApi
      .listItems({ status: 'active', limit: 100 })
      .then(result => setCatalog(result.items))
      .catch(() => setCatalog([]))
  }, [open, editable, catalog.length])

  const resetForm = () => {
    setProductId('')
    setCustomName('')
    setKind('SERVICE')
    setQuantity(1)
    setUnitPrice('')
  }

  /** Al elegir un ítem del catálogo se precargan su tipo y su precio. */
  const pickProduct = (id: string) => {
    setProductId(id)
    const item = catalog.find(candidate => candidate.id === id)
    if (!item) return
    setKind(item.type === 'SERVICE' ? 'SERVICE' : 'PRODUCT_SOLD')
    setUnitPrice(item.price)
  }

  const addLine = async () => {
    if (!appointment || saving) return
    if (!productId && customName.trim().length < 2) {
      setError('Elige un ítem del catálogo o escribe qué se atendió.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await appointmentsApi.addLine(appointment.id, {
        productId: productId || null,
        name: customName.trim() || undefined,
        kind,
        quantity,
        unitPrice: unitPrice === '' ? undefined : Number(unitPrice),
      })
      resetForm()
      await load()
      onChanged()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (line: AppointmentLine, status: AppointmentLine['status']) => {
    if (!appointment) return
    setBusyId(line.id)
    setError('')
    try {
      await appointmentsApi.updateLine(appointment.id, line.id, { status })
      await load()
      onChanged()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const removeLine = async (line: AppointmentLine) => {
    if (!appointment) return
    setBusyId(line.id)
    setError('')
    try {
      await appointmentsApi.removeLine(appointment.id, line.id)
      await load()
      onChanged()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  // El material usado no se le cobra al cliente: no suma al total.
  const total = lines
    .filter(line => line.status !== 'SKIPPED' && line.kind !== 'PRODUCT_USED')
    .reduce((sum, line) => sum + line.total, 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Servicios y productos de la cita"
      description={
        appointment
          ? `${appointment.customerName} · ${formatDate(appointment.scheduledAt)}`
          : undefined
      }
    >
      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}

      {closed && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
          <p className="text-xs text-slate-600">
            Esta cita está cerrada, así que su historial ya no cambia. Los precios que ves son los
            del día en que se realizó, no los del catálogo de hoy. Si necesitas corregirla,
            reábrela desde el listado de citas.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {/* Líneas */}
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Todavía no registraste nada. Al cerrar la cita se guardará lo que se agendó.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {lines.map(line => {
                const meta = KIND_META[line.kind]
                const skipped = line.status === 'SKIPPED'
                return (
                  <div
                    key={line.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 ${
                      skipped ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-medium text-slate-900 ${
                            skipped ? 'line-through' : ''
                          }`}
                        >
                          {line.name}
                        </span>
                        <Badge variant={meta.variant} className="gap-1">
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        {line.status === 'PERFORMED' && (
                          <Badge variant="success">Realizado</Badge>
                        )}
                        {skipped && <Badge variant="default">No se hizo</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {line.quantity} × {money(line.unitPrice)}
                        {line.kind === 'PRODUCT_USED' && ' · no se le cobra al cliente'}
                        {line.nextRecommendedAt &&
                          ` · próxima vez: ${formatDate(line.nextRecommendedAt)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        {money(line.total)}
                      </span>
                      {editable && (
                        <>
                          <button
                            title={skipped ? 'Marcar como realizado' : 'Marcar como no realizado'}
                            disabled={busyId === line.id}
                            onClick={() =>
                              void setStatus(line, skipped ? 'PLANNED' : 'SKIPPED')
                            }
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                          >
                            {skipped ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            title="Quitar"
                            disabled={busyId === line.id}
                            onClick={() => void removeLine(line)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total al cliente
                </span>
                <span className="text-sm font-bold text-slate-900">{money(total)}</span>
              </div>
            </div>
          )}

          {/* Alta */}
          {editable && (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600">Agregar servicio o producto</p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={productId}
                  onChange={e => pickProduct(e.target.value)}
                  className={inputClass}
                  title="Ítem del catálogo"
                >
                  <option value="">Del catálogo…</option>
                  {catalog.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {money(item.price)}
                      {item.recurrenceLabel ? ` · ${item.recurrenceLabel}` : ''}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="…o escríbelo a mano"
                  maxLength={160}
                  className={inputClass}
                />

                <select
                  value={kind}
                  onChange={e => setKind(e.target.value as AppointmentLineKind)}
                  className={inputClass}
                  title="Tipo"
                >
                  {(Object.keys(KIND_META) as AppointmentLineKind[]).map(value => (
                    <option key={value} value={value}>
                      {KIND_META[value].label}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    placeholder="Cant."
                    className={inputClass}
                    title="Cantidad"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={kind === 'PRODUCT_USED' ? 0 : unitPrice}
                    disabled={kind === 'PRODUCT_USED'}
                    onChange={e => setUnitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Precio"
                    className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
                    title={
                      kind === 'PRODUCT_USED'
                        ? 'El material usado en el servicio no se le cobra al cliente'
                        : 'Precio unitario'
                    }
                  />
                </div>
              </div>

              <p className="mt-1.5 text-[11px] text-slate-400">{KIND_META[kind].hint}</p>

              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  loading={saving}
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => void addLine()}
                >
                  Agregar
                </Button>
              </div>
            </div>
          )}

          {cancelled && (
            <p className="mt-4 text-center text-sm text-slate-500">
              La cita está cancelada: no se registran servicios.
            </p>
          )}
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        {editable && (
          <Button
            icon={<RotateCw className="h-4 w-4" />}
            onClick={() => {
              void load()
              onChanged()
            }}
          >
            Actualizar
          </Button>
        )}
      </div>
    </Modal>
  )
}
