import { useEffect, useState, FormEvent } from 'react'
import { Tags, Sparkles } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import { ColorDot } from './CategoryBadge'
import { getUserFriendlyErrorMessage } from '../../lib/errors'
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_LABELS,
  customerCategoriesApi,
  managedByLabel,
  type CustomerCategory,
  type CustomerCategoryColor,
} from '../../services/customerCategoriesApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

const NAME_MAX = 40
const DESCRIPTION_MAX = 200

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (category: CustomerCategory) => void
  editing: CustomerCategory | null
}

export default function CategoryFormModal({ open, onClose, onSaved, editing }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<CustomerCategoryColor>('purple')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setColor(((editing?.color ?? 'purple') as CustomerCategoryColor) || 'purple')
  }, [open, editing])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')

    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.')
      return
    }

    setSaving(true)
    try {
      const payload = { name: trimmed, description: description.trim() || null, color }
      const saved = editing
        ? await customerCategoriesApi.update(editing.id, payload)
        : await customerCategoriesApi.create(payload)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const automaticHint = editing ? managedByLabel(editing) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar categoría' : 'Nueva categoría'}
      description={
        editing
          ? 'Cambia cómo se ve esta categoría en las fichas de tus clientes.'
          : 'Agrupa a tus clientes para encontrarlos rápido y usarlos después en automatizaciones.'
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {automaticHint && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-800">
              Es una categoría automática. {automaticHint} Puedes cambiar cómo se ve, pero no
              quién entra o sale de ella.
            </p>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="category-name">
            Nombre *
          </label>
          <input
            id="category-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="Coloración, Corporativo, Keratina…"
            className={inputClass}
            autoFocus
            required
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {name.trim().length}/{NAME_MAX} · Mayúsculas y acentos no crean categorías repetidas.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="category-description">
            Descripción
          </label>
          <textarea
            id="category-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={2}
            placeholder="Para qué usas esta categoría (opcional)"
            className={inputClass}
          />
        </div>

        <div>
          <span className={labelClass}>Color de la insignia</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition ${
                  color === option
                    ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ColorDot color={option} />
                {CATEGORY_COLOR_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} icon={<Tags className="h-4 w-4" />}>
            {editing ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
