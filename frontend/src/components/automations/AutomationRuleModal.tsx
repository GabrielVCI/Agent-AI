import { useCallback, useEffect, useState, FormEvent } from 'react'
import { Zap, Plus, Trash2, Info, AlertTriangle } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import { getUserFriendlyErrorMessage } from '../../lib/errors'
import {
  ACTION_META,
  RELATIVE_FIELDS,
  SCHEDULE_META,
  TEMPLATE_VARIABLES,
  eventLabel,
} from './automation-meta'
import {
  automationsApi,
  buildConditions,
  parseConditions,
  CONDITION_OPERATORS,
  CONDITION_OPERATOR_LABELS,
  type AutomationCatalog,
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationScheduleStrategy,
  type ConditionOperator,
  type LeafCondition,
} from '../../services/automationsApi'
import {
  customerCategoriesApi,
  type CustomerCategory,
} from '../../services/customerCategoriesApi'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'

const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

/** Minutos → una unidad legible, para no pedir "2880" al usuario. */
function splitDelay(minutes: number): { value: number; unit: 'minutes' | 'hours' | 'days' } {
  if (minutes > 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: 'days' }
  if (minutes > 0 && minutes % 60 === 0) return { value: minutes / 60, unit: 'hours' }
  return { value: minutes, unit: 'minutes' }
}

function toMinutes(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  if (unit === 'days') return value * 1440
  if (unit === 'hours') return value * 60
  return value
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (rule: AutomationRule) => void
  editing: AutomationRule | null
  catalog: AutomationCatalog | null
}

/**
 * Editor de una automatización.
 *
 * Traduce el motor a lenguaje de negocio ("Cuando… Entonces… ¿Cuándo?") sin
 * inventarse capacidades: los eventos y las acciones que ofrece salen del
 * catálogo real del backend, y un evento que el motor todavía no emite se
 * marca como tal en vez de dejar crear una regla que jamás se dispararía.
 */
export default function AutomationRuleModal({
  open,
  onClose,
  onSaved,
  editing,
  catalog,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('')
  const [actionType, setActionType] = useState('')
  const [strategy, setStrategy] = useState<AutomationScheduleStrategy>('IMMEDIATE')

  // Configuración de la acción
  const [template, setTemplate] = useState('')
  const [subject, setSubject] = useState('')
  const [label, setLabel] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Programación
  const [delayValue, setDelayValue] = useState(0)
  const [delayUnit, setDelayUnit] = useState<'minutes' | 'hours' | 'days'>('days')
  const [relativeField, setRelativeField] = useState('')
  const [offsetValue, setOffsetValue] = useState(24)
  const [offsetDirection, setOffsetDirection] = useState<'before' | 'after'>('before')
  const [localTime, setLocalTime] = useState('10:00')

  // Condiciones
  const [conditionMatch, setConditionMatch] = useState<'all' | 'any'>('all')
  const [conditions, setConditions] = useState<LeafCondition[]>([])
  /** true = la regla usa un DSL que este panel no sabe editar sin romperlo. */
  const [conditionsReadOnly, setConditionsReadOnly] = useState(false)

  const [cancelOn, setCancelOn] = useState<string[]>([])
  const [categories, setCategories] = useState<CustomerCategory[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const configKind = ACTION_META[actionType]?.configKind

  const reset = useCallback(() => {
    setError('')
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setEventType(editing?.eventType ?? catalog?.events[0]?.type ?? '')
    setActionType(editing?.actionType ?? catalog?.actions[0] ?? '')
    setStrategy(editing?.scheduleStrategy ?? 'IMMEDIATE')
    setCancelOn(editing?.cancelOnEventTypes ?? [])

    const config = (editing?.actionConfig ?? {}) as Record<string, unknown>
    setTemplate(typeof config.template === 'string' ? config.template : '')
    setSubject(typeof config.subject === 'string' ? config.subject : '')
    setLabel(typeof config.label === 'string' ? config.label : '')
    setCategoryId(typeof config.categoryId === 'string' ? config.categoryId : '')

    const delay = splitDelay(editing?.delayMinutes ?? 0)
    setDelayValue(delay.value)
    setDelayUnit(delay.unit)

    const schedule = editing?.scheduleConfig ?? {}
    setRelativeField(schedule.field ?? '')
    const offset = schedule.offsetMinutes ?? 0
    setOffsetDirection(offset < 0 ? 'before' : 'after')
    setOffsetValue(Math.abs(offset) / 60 || 24)
    setLocalTime(schedule.localTime ?? '10:00')

    const parsed = parseConditions(editing?.conditions ?? null)
    if (parsed) {
      setConditionMatch(parsed.match)
      setConditions(parsed.conditions)
      setConditionsReadOnly(false)
    } else {
      // Regla con condiciones avanzadas: no se tocan.
      setConditions([])
      setConditionsReadOnly(true)
    }
  }, [editing, catalog])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  // Las categorías solo hacen falta si la acción las usa.
  useEffect(() => {
    if (!open || configKind !== 'category' || categories.length > 0) return
    customerCategoriesApi
      .list()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [open, configKind, categories.length])

  const eventDefinition = catalog?.events.find(item => item.type === eventType)
  const availableFields = RELATIVE_FIELDS.filter(field => field.forEvents.includes(eventType))

  const addCondition = () =>
    setConditions(current => [...current, { field: '', op: 'eq', value: '' }])

  const updateCondition = (index: number, patch: Partial<LeafCondition>) =>
    setConditions(current =>
      current.map((condition, i) => (i === index ? { ...condition, ...patch } : condition))
    )

  const removeCondition = (index: number) =>
    setConditions(current => current.filter((_, i) => i !== index))

  const buildActionConfig = (): Record<string, unknown> | string => {
    switch (configKind) {
      case 'whatsapp':
        if (template.trim().length < 5) return 'Escribe el mensaje que se enviará.'
        return { template: template.trim() }
      case 'email':
        if (subject.trim().length < 2) return 'El correo necesita un asunto.'
        if (template.trim().length < 5) return 'Escribe el cuerpo del correo.'
        return { subject: subject.trim(), template: template.trim() }
      case 'note':
        if (template.trim().length < 5) return 'Escribe la nota interna.'
        return { template: template.trim() }
      case 'tag':
        if (label.trim().length < 2) return 'Escribe la etiqueta que se aplicará.'
        return { label: label.trim() }
      case 'category':
        if (!categoryId) return 'Elige la categoría que aplicará esta automatización.'
        return { categoryId }
      default:
        return 'Esa acción todavía no se puede configurar desde el panel.'
    }
  }

  const buildScheduleConfig = () => {
    if (strategy === 'RELATIVE_TO_FIELD') {
      if (!relativeField) return { error: 'Elige la fecha del evento sobre la que calcular.' }
      const minutes = Math.round(offsetValue * 60)
      return {
        config: {
          field: relativeField,
          offsetMinutes: offsetDirection === 'before' ? -minutes : minutes,
        },
      }
    }
    if (strategy === 'DAILY_AT_LOCAL_TIME') {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(localTime)) {
        return { error: 'La hora debe tener el formato HH:mm (por ejemplo 10:00).' }
      }
      return { config: { localTime } }
    }
    return { config: null }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')

    if (name.trim().length < 3) {
      setError('El nombre debe tener al menos 3 caracteres.')
      return
    }

    const actionConfig = buildActionConfig()
    if (typeof actionConfig === 'string') {
      setError(actionConfig)
      return
    }

    const schedule = buildScheduleConfig()
    if ('error' in schedule && schedule.error) {
      setError(schedule.error)
      return
    }

    const payload: AutomationRuleInput = {
      name: name.trim(),
      description: description.trim() || null,
      eventType,
      actionType,
      actionConfig,
      scheduleStrategy: strategy,
      delayMinutes:
        strategy === 'DELAY' || strategy === 'DAILY_AT_LOCAL_TIME'
          ? toMinutes(delayValue, delayUnit)
          : 0,
      scheduleConfig: 'config' in schedule ? schedule.config : null,
      cancelOnEventTypes: cancelOn,
      // Una regla que el panel no sabe editar conserva su DSL intacto.
      ...(conditionsReadOnly
        ? {}
        : { conditions: buildConditions(conditionMatch, conditions) }),
    }

    setSaving(true)
    try {
      const saved = editing
        ? await automationsApi.updateRule(editing.id, payload)
        : await automationsApi.createRule({ ...payload, status: 'DRAFT' })
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const showsTemplate = configKind === 'whatsapp' || configKind === 'email' || configKind === 'note'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={editing ? 'Editar automatización' : 'Nueva automatización'}
      description="Cuando pase algo en tu negocio, Sendwary hace algo por ti."
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert variant="danger">{error}</Alert>}

        <div>
          <label className={labelClass} htmlFor="rule-name">
            Nombre *
          </label>
          <input
            id="rule-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            placeholder="Recordatorio de cita 24 h antes"
            className={inputClass}
            autoFocus
            required
          />
        </div>

        {/* ── CUANDO ── */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cuando…
          </p>
          <select
            value={eventType}
            onChange={e => {
              setEventType(e.target.value)
              setRelativeField('')
            }}
            className={inputClass}
          >
            {catalog?.events.map(item => (
              <option key={item.type} value={item.type}>
                {eventLabel(item.type)}
                {!item.implemented ? ' (aún no disponible)' : ''}
              </option>
            ))}
          </select>

          {eventDefinition && (
            <p className="mt-1.5 text-xs text-slate-500">{eventDefinition.description}</p>
          )}

          {eventDefinition && !eventDefinition.implemented && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="text-xs text-amber-800">
                Sendwary todavía no emite este evento desde ningún módulo, así que la regla se
                guardará pero <strong>no se disparará</strong> hasta que esa parte exista.
              </p>
            </div>
          )}
        </div>

        {/* ── ENTONCES ── */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Entonces…
          </p>
          <select
            value={actionType}
            onChange={e => setActionType(e.target.value)}
            className={inputClass}
          >
            {catalog?.actions.map(action => (
              <option key={action} value={action}>
                {ACTION_META[action]?.label ?? action}
              </option>
            ))}
          </select>
          {ACTION_META[actionType] && (
            <p className="mt-1.5 text-xs text-slate-500">
              {ACTION_META[actionType].description}
            </p>
          )}

          {/* Configuración según la acción */}
          <div className="mt-3 space-y-2">
            {configKind === 'email' && (
              <div>
                <label className={labelClass}>Asunto</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  maxLength={160}
                  placeholder="Tu cita en {{negocio}}"
                  className={inputClass}
                />
              </div>
            )}

            {showsTemplate && (
              <div>
                <label className={labelClass}>
                  {configKind === 'note' ? 'Nota para tu equipo' : 'Mensaje'}
                </label>
                <textarea
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  rows={3}
                  maxLength={1500}
                  placeholder="Hola {{nombre}} 👋 Te recordamos tu cita de {{servicio}} el {{fecha}} a las {{hora}}."
                  className={inputClass}
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map(variable => (
                    <button
                      key={variable.token}
                      type="button"
                      title={variable.help}
                      onClick={() => setTemplate(current => `${current}${variable.token}`)}
                      className="rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 transition hover:border-primary-300 hover:text-primary-600"
                    >
                      {variable.token}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {configKind === 'tag' && (
              <div>
                <label className={labelClass}>Etiqueta</label>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  maxLength={40}
                  placeholder="Recurrente"
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  También crea (o reutiliza) la categoría con ese nombre.
                </p>
              </div>
            )}

            {configKind === 'category' && (
              <div>
                <label className={labelClass}>Categoría</label>
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Elige una categoría…</option>
                  {categories
                    .filter(category => !category.isSystem)
                    .map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Al guardar, esta categoría pasa a mostrarse como <strong>automática</strong>: la
                  gestiona esta regla y deja de asignarse a mano. Las de sistema (VIP, Riesgo) no
                  se pueden mover desde aquí.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── CUÁNDO ── */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            ¿Cuándo?
          </p>
          <select
            value={strategy}
            onChange={e => setStrategy(e.target.value as AutomationScheduleStrategy)}
            className={inputClass}
          >
            {(Object.keys(SCHEDULE_META) as AutomationScheduleStrategy[]).map(value => (
              <option
                key={value}
                value={value}
                disabled={value === 'RELATIVE_TO_FIELD' && availableFields.length === 0}
              >
                {SCHEDULE_META[value].label}
                {value === 'RELATIVE_TO_FIELD' && availableFields.length === 0
                  ? ' (este evento no trae fechas)'
                  : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">{SCHEDULE_META[strategy].help}</p>

          {(strategy === 'DELAY' || strategy === 'DAILY_AT_LOCAL_TIME') && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">Esperar</span>
              <input
                type="number"
                min={0}
                value={delayValue}
                onChange={e => setDelayValue(Math.max(0, Number(e.target.value) || 0))}
                className={`${inputClass} w-24`}
              />
              <select
                value={delayUnit}
                onChange={e => setDelayUnit(e.target.value as typeof delayUnit)}
                className={`${inputClass} w-32`}
              >
                <option value="minutes">minutos</option>
                <option value="hours">horas</option>
                <option value="days">días</option>
              </select>
              {strategy === 'DAILY_AT_LOCAL_TIME' && (
                <>
                  <span className="text-sm text-slate-600">y enviar a las</span>
                  <input
                    type="time"
                    value={localTime}
                    onChange={e => setLocalTime(e.target.value)}
                    className={`${inputClass} w-32`}
                  />
                </>
              )}
            </div>
          )}

          {strategy === 'RELATIVE_TO_FIELD' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                value={offsetValue}
                onChange={e => setOffsetValue(Math.max(0, Number(e.target.value) || 0))}
                className={`${inputClass} w-24`}
              />
              <span className="text-sm text-slate-600">horas</span>
              <select
                value={offsetDirection}
                onChange={e => setOffsetDirection(e.target.value as 'before' | 'after')}
                className={`${inputClass} w-28`}
              >
                <option value="before">antes de</option>
                <option value="after">después de</option>
              </select>
              <select
                value={relativeField}
                onChange={e => setRelativeField(e.target.value)}
                className={`${inputClass} flex-1 min-w-[200px]`}
              >
                <option value="">Elige la fecha…</option>
                {availableFields.map(field => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── SOLO SI (condiciones) ── */}
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Solo si… <span className="normal-case font-normal">(opcional)</span>
            </p>
            {!conditionsReadOnly && conditions.length > 1 && (
              <div className="inline-flex overflow-hidden rounded-full border border-slate-300 text-xs">
                {(['all', 'any'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setConditionMatch(mode)}
                    className={`px-3 py-1 transition ${
                      conditionMatch === mode
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mode === 'all' ? 'Se cumplen todas' : 'Se cumple alguna'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {conditionsReadOnly ? (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <p className="text-xs text-slate-600">
                Esta automatización usa condiciones avanzadas que este panel no sabe editar. Se
                conservan tal cual al guardar; para cambiarlas hace falta soporte.
              </p>
            </div>
          ) : (
            <>
              {conditions.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Sin condiciones, la automatización se aplica siempre que ocurra el evento.
                </p>
              )}

              <div className="mt-2 space-y-2">
                {conditions.map((condition, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={condition.field}
                      onChange={e => updateCondition(index, { field: e.target.value })}
                      placeholder="campo (ej. status)"
                      className={`${inputClass} flex-1 min-w-[140px]`}
                    />
                    <select
                      value={condition.op}
                      onChange={e =>
                        updateCondition(index, { op: e.target.value as ConditionOperator })
                      }
                      className={`${inputClass} w-44`}
                    >
                      {CONDITION_OPERATORS.map(op => (
                        <option key={op} value={op}>
                          {CONDITION_OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>
                    {condition.op !== 'exists' && (
                      <input
                        type="text"
                        value={String(condition.value ?? '')}
                        onChange={e => updateCondition(index, { value: e.target.value })}
                        placeholder="valor"
                        className={`${inputClass} flex-1 min-w-[120px]`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCondition}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar condición
              </button>
            </>
          )}
        </div>

        {/* ── CANCELAR SI ── */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cancelar lo pendiente si… <span className="normal-case font-normal">(opcional)</span>
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Si ocurre alguno de estos eventos, los envíos aún no realizados de esta automatización
            se cancelan. Es lo que evita recordarle una cita a quien ya la canceló.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {catalog?.events
              .filter(item => item.implemented)
              .map(item => {
                const active = cancelOn.includes(item.type)
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() =>
                      setCancelOn(current =>
                        active
                          ? current.filter(value => value !== item.type)
                          : [...current, item.type]
                      )
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      active
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {eventLabel(item.type)}
                  </button>
                )
              })}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="rule-description">
            Nota interna
          </label>
          <input
            id="rule-description"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Para qué sirve esta automatización (opcional)"
            className={inputClass}
          />
        </div>

        {!editing && (
          <p className="text-xs text-slate-500">
            Se creará como <strong>borrador</strong>: no enviará nada hasta que la actives.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} icon={<Zap className="h-4 w-4" />}>
            {editing ? 'Guardar cambios' : 'Crear automatización'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
