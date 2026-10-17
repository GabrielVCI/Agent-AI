import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, X, Clock } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Alert from '../ui/Alert'
import Modal from '../ui/Modal'
import { getUserFriendlyErrorMessage } from '../../lib/errors'
import { customersApi, type CustomerFollowUp } from '../../services/customersApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition'

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** "en 38 días" / "mañana": lo que el negocio realmente quiere leer. */
function relative(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

/** Valor de <input type="date"> a partir de una fecha ISO. */
function toDateInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

interface Props {
  customerId: string
  canManage: boolean
}

/**
 * Próximos seguimientos del cliente (Módulo 3).
 *
 * Lo que se ve aquí son automatizaciones REALES ya programadas en el motor, no
 * fechas calculadas en el navegador: si la lista está vacía es porque no hay
 * nada programado. Cancelar o mover pasa por el Automation Core, así que el
 * mensaje asociado se cancela/mueve con el seguimiento.
 */
export default function CustomerFollowUpsCard({ customerId, canManage }: Props) {
  const [followUps, setFollowUps] = useState<CustomerFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [moving, setMoving] = useState<CustomerFollowUp | null>(null)
  const [newDate, setNewDate] = useState('')

  const load = useCallback(async () => {
    try {
      setFollowUps(await customersApi.followUps(customerId))
      setError('')
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const cancel = async (followUp: CustomerFollowUp) => {
    setBusyId(followUp.id)
    setError('')
    try {
      await customersApi.cancelFollowUp(customerId, followUp.id)
      flash('Seguimiento cancelado')
      await load()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const reschedule = async () => {
    if (!moving || !newDate) return
    setBusyId(moving.id)
    setError('')
    try {
      // Se envía a mediodía local para que el cambio de zona no lo corra un día.
      await customersApi.rescheduleFollowUp(
        customerId,
        moving.id,
        new Date(`${newDate}T12:00:00`).toISOString()
      )
      flash('Seguimiento reprogramado')
      setMoving(null)
      await load()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return null
  if (followUps.length === 0 && !error) return null

  return (
    <Card>
      <CardHeader
        title="Próximos seguimientos"
        description="Automatizaciones ya programadas para este cliente"
      />

      {error && (
        <Alert variant="danger" className="mb-3">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="mb-3">
          {notice}
        </Alert>
      )}

      <div className="divide-y divide-slate-100">
        {followUps.map(followUp => (
          <div
            key={followUp.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="mt-0.5 rounded-lg bg-violet-50 p-1.5 text-violet-600">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {followUp.serviceName ?? followUp.ruleName}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(followUp.scheduledFor)} · {relative(followUp.scheduledFor)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Badge variant="info">Programado</Badge>
              {canManage && (
                <>
                  <button
                    title="Mover a otra fecha"
                    disabled={busyId === followUp.id}
                    onClick={() => {
                      setMoving(followUp)
                      setNewDate(toDateInput(followUp.scheduledFor))
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                  <button
                    title="Cancelar seguimiento"
                    disabled={busyId === followUp.id}
                    onClick={() => void cancel(followUp)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={moving !== null}
        onClose={() => setMoving(null)}
        title="Mover el seguimiento"
        size="sm"
      >
        <p className="mb-3 text-sm text-slate-600">
          <strong>{moving?.serviceName ?? moving?.ruleName}</strong> se enviará en la nueva fecha
          que elijas.
        </p>
        <input
          type="date"
          value={newDate}
          onChange={e => setNewDate(e.target.value)}
          className={inputClass}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMoving(null)}>
            Cancelar
          </Button>
          <Button
            loading={busyId === moving?.id}
            disabled={!newDate}
            onClick={() => void reschedule()}
          >
            Mover
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
