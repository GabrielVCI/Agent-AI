import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Phone, Mail, Clock, Bot, UserCheck, CalendarDays, FileText,
  Package, Plus, Save, Tag, XCircle,
} from 'lucide-react'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Alert from '../ui/Alert'
import LoadingSpinner from '../ui/LoadingSpinner'
import {
  getConversationProfile,
  updateConversationContact,
  labelsApi,
  ContactProfile,
  InboxLabel,
} from '../../services/conversationsApi'

/** Colores de etiqueta → clases Tailwind (literales para que el build las incluya). */
export const labelColorClasses: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  violet: 'bg-violet-100 text-violet-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  pink: 'bg-pink-100 text-pink-700',
}

export function LabelChip({ label, onRemove }: { label: InboxLabel; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        labelColorClasses[label.color] ?? labelColorClasses.slate
      }`}
    >
      {label.name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70" aria-label="Quitar etiqueta">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const appointmentStatusLabel: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  RESCHEDULED: 'Pospuesta',
  NO_SHOW: 'No asistió',
  COMPLETED: 'Completada',
}

interface Props {
  conversationId: string
  /** Etiquetas del tenant (compartidas con la lista) */
  allLabels: InboxLabel[]
  onLabelsCreated: () => void
  /** Notifica cambios que la lista debe reflejar (etiquetas, nombre, cierre) */
  onChanged: () => void
  onClose: () => void
  onCloseConversation: () => void
}

/** Panel derecho del inbox: perfil del contacto + datos relacionados. */
export default function ContactPanel({
  conversationId,
  allLabels,
  onLabelsCreated,
  onChanged,
  onClose,
  onCloseConversation,
}: Props) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ContactProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Edición de contacto
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Etiquetas
  const [labelPicker, setLabelPicker] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getConversationProfile(conversationId)
      setProfile(data)
      setName(data.contact.name ?? '')
      setEmail(data.contact.email ?? '')
      setNotes(data.contact.notes ?? '')
      setDirty(false)
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo cargar el perfil')
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    load()
  }, [load])

  const saveContact = async () => {
    setSaving(true)
    setError('')
    try {
      await updateConversationContact(conversationId, {
        name: name.trim() || undefined,
        email: email.trim() || null,
        notes: notes.trim() || null,
      })
      setDirty(false)
      onChanged()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const attachLabel = async (labelId: string) => {
    try {
      await labelsApi.attach(conversationId, labelId)
      setLabelPicker(false)
      await load()
      onChanged()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo agregar la etiqueta')
    }
  }

  const detachLabel = async (labelId: string) => {
    try {
      await labelsApi.detach(conversationId, labelId)
      await load()
      onChanged()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo quitar la etiqueta')
    }
  }

  const createAndAttachLabel = async () => {
    const trimmed = newLabelName.trim()
    if (trimmed.length < 2) return
    try {
      const colors = Object.keys(labelColorClasses)
      const color = colors[Math.floor(Math.random() * colors.length)]
      const label = await labelsApi.create(trimmed, color)
      setNewLabelName('')
      onLabelsCreated()
      if (label?.id) await attachLabel(label.id)
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'No se pudo crear la etiqueta')
    }
  }

  const goCreateAppointment = () => {
    if (!profile) return
    const params = new URLSearchParams({
      new: '1',
      name: profile.contact.name ?? '',
      phone: profile.contact.phone,
    })
    navigate(`/appointments?${params.toString()}`)
  }

  const attachedIds = new Set((profile?.labels ?? []).map(l => l.id))
  const availableLabels = allLabels.filter(l => !attachedIds.has(l.id))

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <h3 className="text-sm font-semibold text-slate-900">Perfil del contacto</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Cerrar panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : !profile ? (
        <div className="p-4">
          <Alert variant="warning">{error || 'Perfil no disponible'}</Alert>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          {error && <Alert variant="danger">{error}</Alert>}

          {/* Identidad */}
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value)
                setDirty(true)
              }}
              placeholder="Nombre del contacto"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="flex items-center gap-2 text-slate-600">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              {profile.contact.phone}
            </p>
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <input
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  setDirty(true)
                }}
                placeholder="Sin email"
                className="flex-1 px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-slate-200 text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              Última actividad: {formatDateTime(profile.contact.lastActivityAt)}
            </p>
          </div>

          {/* Estado de la conversación */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Bot className="h-3.5 w-3.5" />
              Agente IA: <span className="text-slate-700">{profile.conversation.agent?.name ?? '—'}</span>
            </p>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <UserCheck className="h-3.5 w-3.5" />
              Asignada a: <span className="text-slate-700">{profile.conversation.assignedTo?.name ?? 'Sin asignar'}</span>
            </p>
          </div>

          {/* Etiquetas */}
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              <Tag className="h-3.5 w-3.5" />
              Etiquetas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.labels.map(label => (
                <LabelChip key={label.id} label={label} onRemove={() => detachLabel(label.id)} />
              ))}
              <button
                onClick={() => setLabelPicker(v => !v)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-primary-400 hover:text-primary-600"
              >
                <Plus className="h-3 w-3" />
                Etiqueta
              </button>
            </div>
            {labelPicker && (
              <div className="mt-2 rounded-xl border border-slate-200 p-2 space-y-1.5">
                {availableLabels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {availableLabels.map(label => (
                      <button key={label.id} onClick={() => attachLabel(label.id)}>
                        <LabelChip label={label} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Todas las etiquetas ya están aplicadas</p>
                )}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={e => setNewLabelName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') createAndAttachLabel()
                    }}
                    placeholder="Nueva etiqueta…"
                    className="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <Button size="sm" variant="outline" onClick={createAndAttachLabel}>
                    Crear
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Notas internas */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Notas internas
            </p>
            <textarea
              value={notes}
              onChange={e => {
                setNotes(e.target.value)
                setDirty(true)
              }}
              rows={3}
              placeholder="Notas del equipo sobre este contacto (el cliente no las ve)"
              className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {dirty && (
            <Button size="sm" className="w-full" loading={saving} icon={<Save className="h-3.5 w-3.5" />} onClick={saveContact}>
              Guardar cambios del contacto
            </Button>
          )}

          {/* Citas */}
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              <CalendarDays className="h-3.5 w-3.5" />
              Citas del contacto
            </p>
            {profile.appointments.length === 0 ? (
              <p className="text-xs text-slate-400">Sin citas registradas</p>
            ) : (
              <div className="space-y-1.5">
                {profile.appointments.map(a => (
                  <div key={a.id} className="rounded-lg border border-slate-200 px-2.5 py-2">
                    <p className="text-xs font-medium text-slate-800 truncate">{a.serviceOrProduct}</p>
                    <p className="text-xs text-slate-500 flex items-center justify-between gap-2 mt-0.5">
                      {formatDateTime(a.scheduledAt)}
                      <Badge variant={a.status === 'CONFIRMED' ? 'success' : a.status === 'CANCELLED' || a.status === 'NO_SHOW' ? 'danger' : 'warning'}>
                        {appointmentStatusLabel[a.status] ?? a.status}
                      </Badge>
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-2"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={goCreateAppointment}
            >
              Crear cita
            </Button>
          </div>

          {/* Cotizaciones y productos */}
          {(profile.quotes.length > 0 || profile.lastProduct) && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                <FileText className="h-3.5 w-3.5" />
                Actividad comercial
              </p>
              {profile.lastProduct && (
                <p className="flex items-center gap-2 text-xs text-slate-600 mb-1.5">
                  <Package className="h-3.5 w-3.5 text-slate-400" />
                  Último producto consultado: <span className="font-medium">{profile.lastProduct}</span>
                </p>
              )}
              {profile.quotes.map(q => (
                <div key={q.id} className="flex items-center justify-between text-xs text-slate-600 py-1">
                  <span>Cotización {q.quoteNumber}</span>
                  <span className="font-medium">
                    RD${q.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Cerrar conversación */}
          {profile.conversation.status !== 'CLOSED' && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-red-600 hover:bg-red-50"
              icon={<XCircle className="h-3.5 w-3.5" />}
              onClick={onCloseConversation}
            >
              Cerrar conversación
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
