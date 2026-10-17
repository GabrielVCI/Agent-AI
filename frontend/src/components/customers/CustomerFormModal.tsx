import { useEffect, useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, ArrowRight } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import { customersApi, type CustomerInput, type CustomerProfile } from '../../services/customersApi'
import { ApiError } from '../../lib/api'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

interface FormState {
  firstName: string
  lastName: string
  phone: string
  email: string
  birthDate: string
  documentId: string
  address: string
  notes: string
  tags: string
}

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  birthDate: '',
  documentId: '',
  address: '',
  notes: '',
  tags: '',
}

/** Detalle que manda el backend en un 409 de teléfono repetido. */
interface DuplicateDetail {
  duplicate?: boolean
  customerId?: string
  customerName?: string
}

export default function CustomerFormModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: (customer: CustomerProfile) => void
  editing: CustomerProfile | null
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<DuplicateDetail | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            firstName: editing.firstName ?? '',
            lastName: editing.lastName ?? '',
            phone: editing.phoneNormalized ?? editing.phone,
            email: editing.email ?? '',
            birthDate: editing.birthDate ?? '',
            documentId: editing.documentId ?? '',
            address: editing.address ?? '',
            notes: editing.notes ?? '',
            tags: editing.tags.join(', '),
          }
        : emptyForm
    )
    setError('')
    setDuplicate(null)
    setFieldErrors({})
  }, [open, editing])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setDuplicate(null)
    setFieldErrors({})

    const payload: CustomerInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      birthDate: form.birthDate || null,
      documentId: form.documentId.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      tags: form.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    }

    try {
      const saved = editing
        ? await customersApi.update(editing.id, payload)
        : await customersApi.create(payload)
      onSaved(saved)
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 de teléfono repetido: en vez de un error seco, ofrecemos abrir
        // la ficha que ya existe.
        if (err.statusCode === 409) {
          setDuplicate((err.details as DuplicateDetail | undefined) ?? { duplicate: true })
        }
        if (err.fieldErrors) {
          const flat: Record<string, string> = {}
          for (const [key, value] of Object.entries(err.fieldErrors)) {
            flat[key] = Array.isArray(value) ? value[0] : String(value)
          }
          setFieldErrors(flat)
        }
        setError(err.message)
      } else {
        setError('No se pudo guardar el cliente. Inténtalo nuevamente.')
      }
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (name: string) => fieldErrors[name]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar cliente' : 'Nuevo cliente'}
      description={
        editing
          ? 'Actualiza los datos del cliente en tu maestro.'
          : 'Nombre, apellido y WhatsApp son obligatorios. El resto puedes completarlo después.'
      }
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && !duplicate && <Alert variant="danger">{error}</Alert>}

        {duplicate && (
          <Alert variant="warning" title="Ya existe un cliente con este número">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {duplicate.customerName
                  ? `Está registrado como ${duplicate.customerName}.`
                  : 'Revisa tu maestro de clientes.'}
              </span>
              {duplicate.customerId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                  onClick={() => {
                    onClose()
                    navigate(`/clientes/${duplicate.customerId}`)
                  }}
                >
                  Ver su ficha
                </Button>
              )}
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="customer-firstName">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="customer-firstName"
              className={inputClass}
              value={form.firstName}
              onChange={e => set('firstName', e.target.value)}
              placeholder="Gabriela"
              required
              maxLength={80}
            />
            {fieldError('firstName') && (
              <p className="mt-1 text-xs text-red-600">{fieldError('firstName')}</p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="customer-lastName">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input
              id="customer-lastName"
              className={inputClass}
              value={form.lastName}
              onChange={e => set('lastName', e.target.value)}
              placeholder="Pérez"
              required
              maxLength={80}
            />
            {fieldError('lastName') && (
              <p className="mt-1 text-xs text-red-600">{fieldError('lastName')}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="customer-phone">
              Número de WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              id="customer-phone"
              className={inputClass}
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+1 809 555 5555"
              required
              maxLength={30}
            />
            <p className="mt-1 text-xs text-slate-400">
              Con código de país. Aceptamos guiones, espacios y paréntesis.
            </p>
            {fieldError('phone') && (
              <p className="mt-1 text-xs text-red-600">{fieldError('phone')}</p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="customer-email">
              Email
            </label>
            <input
              id="customer-email"
              type="email"
              className={inputClass}
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="gabriela@ejemplo.com"
              maxLength={160}
            />
            {fieldError('email') && (
              <p className="mt-1 text-xs text-red-600">{fieldError('email')}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="customer-birthDate">
              Fecha de nacimiento
            </label>
            <input
              id="customer-birthDate"
              type="date"
              className={inputClass}
              value={form.birthDate}
              onChange={e => set('birthDate', e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
            {fieldError('birthDate') && (
              <p className="mt-1 text-xs text-red-600">{fieldError('birthDate')}</p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="customer-documentId">
              Cédula o documento
            </label>
            <input
              id="customer-documentId"
              className={inputClass}
              value={form.documentId}
              onChange={e => set('documentId', e.target.value)}
              placeholder="001-1234567-8"
              maxLength={40}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="customer-address">
            Dirección
          </label>
          <input
            id="customer-address"
            className={inputClass}
            value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="Av. Winston Churchill 1, Santo Domingo"
            maxLength={300}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="customer-tags">
            Etiquetas
          </label>
          <input
            id="customer-tags"
            className={inputClass}
            value={form.tags}
            onChange={e => set('tags', e.target.value)}
            placeholder="Recomendado por, Referido web"
            maxLength={400}
          />
          <p className="mt-1 text-xs text-slate-400">
            Sepáralas con comas. Para clasificar y filtrar clientes usa las{' '}
            <strong>categorías</strong> desde su ficha.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="customer-notes">
            Notas internas
          </label>
          <textarea
            id="customer-notes"
            className={`${inputClass} min-h-[80px]`}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Preferencias, historial relevante… (el cliente nunca las ve)"
            maxLength={2000}
          />
          {fieldError('notes') && (
            <p className="mt-1 text-xs text-red-600">{fieldError('notes')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} icon={<UserPlus className="h-4 w-4" />}>
            {editing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
