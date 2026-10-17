import {
  MessageSquare, Mail, Bell, Tag, Tags, TagsIcon, CalendarDays, CalendarCheck,
  CalendarX, CalendarClock, UserPlus, UserCheck, Repeat, ShoppingBag, Cake,
  Wrench, Clock, AlertTriangle, Star, Sparkles,
} from 'lucide-react'
import type {
  AutomationJobStatus,
  AutomationRuleStatus,
  AutomationScheduleStrategy,
} from '../../services/automationsApi'

/**
 * Metadatos de presentación del motor de automatizaciones.
 *
 * Es SOLO texto e iconos. Qué eventos y qué acciones existen lo decide el
 * catálogo del backend (`/api/automations/catalog`): si aquí falta una entrada
 * se muestra el código crudo, pero nunca se ofrece algo que el motor no pueda
 * ejecutar.
 */

// ─── Acciones ────────────────────────────────────────────────────────────────

export interface ActionMeta {
  label: string
  description: string
  icon: React.ReactNode
  /** Cómo se edita su configuración en el formulario. */
  configKind: 'whatsapp' | 'email' | 'note' | 'tag' | 'category'
}

export const ACTION_META: Record<string, ActionMeta> = {
  SEND_WHATSAPP_MESSAGE: {
    label: 'Enviar WhatsApp',
    description: 'Manda un mensaje al cliente por su conversación de WhatsApp.',
    icon: <MessageSquare className="h-4 w-4" />,
    configKind: 'whatsapp',
  },
  SEND_EMAIL: {
    label: 'Enviar correo',
    description: 'Manda un correo al cliente (necesita que tenga email en su ficha).',
    icon: <Mail className="h-4 w-4" />,
    configKind: 'email',
  },
  CREATE_INTERNAL_NOTIFICATION: {
    label: 'Nota interna',
    description: 'Deja un aviso en la conversación para tu equipo. El cliente no lo ve.',
    icon: <Bell className="h-4 w-4" />,
    configKind: 'note',
  },
  UPDATE_CUSTOMER_TAG: {
    label: 'Poner etiqueta',
    description: 'Etiqueta al cliente y crea su categoría equivalente.',
    icon: <Tag className="h-4 w-4" />,
    configKind: 'tag',
  },
  ASSIGN_CUSTOMER_CATEGORY: {
    label: 'Asignar categoría',
    description: 'Mete al cliente en una categoría de tu segmentación.',
    icon: <Tags className="h-4 w-4" />,
    configKind: 'category',
  },
  REMOVE_CUSTOMER_CATEGORY: {
    label: 'Quitar categoría',
    description: 'Saca al cliente de una categoría de tu segmentación.',
    icon: <TagsIcon className="h-4 w-4" />,
    configKind: 'category',
  },
}

export function actionLabel(actionType: string): string {
  return ACTION_META[actionType]?.label ?? actionType
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

/** Icono y nombre corto por evento. El "qué significa" viene del backend. */
export const EVENT_META: Record<string, { label: string; icon: React.ReactNode }> = {
  APPOINTMENT_CREATED: { label: 'Se agenda una cita', icon: <CalendarDays className="h-4 w-4" /> },
  APPOINTMENT_CONFIRMED: { label: 'Se confirma una cita', icon: <CalendarCheck className="h-4 w-4" /> },
  APPOINTMENT_RESCHEDULED: { label: 'Se pospone una cita', icon: <CalendarClock className="h-4 w-4" /> },
  APPOINTMENT_COMPLETED: { label: 'Se completa una cita', icon: <CalendarCheck className="h-4 w-4" /> },
  APPOINTMENT_CANCELLED: { label: 'Se cancela una cita', icon: <CalendarX className="h-4 w-4" /> },
  APPOINTMENT_NO_SHOW: { label: 'El cliente no asiste', icon: <AlertTriangle className="h-4 w-4" /> },
  CUSTOMER_CREATED: { label: 'Nuevo contacto', icon: <UserPlus className="h-4 w-4" /> },
  CUSTOMER_VISITED: { label: 'El cliente visita', icon: <UserCheck className="h-4 w-4" /> },
  SERVICE_USED: { label: 'Se realiza un servicio', icon: <Wrench className="h-4 w-4" /> },
  PRODUCT_PURCHASED: { label: 'Se vende un producto', icon: <ShoppingBag className="h-4 w-4" /> },
  CUSTOMER_BIRTHDAY: { label: 'Cumpleaños del cliente', icon: <Cake className="h-4 w-4" /> },
  MAINTENANCE_DUE: { label: 'Toca mantenimiento', icon: <Repeat className="h-4 w-4" /> },
  CUSTOMER_INACTIVE_15_DAYS: { label: '15 días sin volver', icon: <Clock className="h-4 w-4" /> },
  CUSTOMER_INACTIVE_30_DAYS: { label: '30 días sin volver', icon: <Clock className="h-4 w-4" /> },
  CUSTOMER_INACTIVE_60_DAYS: { label: '60 días sin volver', icon: <Clock className="h-4 w-4" /> },
  CUSTOMER_INACTIVE_90_DAYS: { label: '90 días sin volver', icon: <Clock className="h-4 w-4" /> },
  CUSTOMER_CHURN_RISK: { label: 'Riesgo de abandono', icon: <AlertTriangle className="h-4 w-4" /> },
  CUSTOMER_BECAME_VIP: { label: 'El cliente pasa a VIP', icon: <Star className="h-4 w-4" /> },
  CUSTOMER_CATEGORY_ASSIGNED: { label: 'Entra en una categoría', icon: <Tags className="h-4 w-4" /> },
  CUSTOMER_CATEGORY_REMOVED: { label: 'Sale de una categoría', icon: <Tags className="h-4 w-4" /> },
}

export function eventLabel(eventType: string): string {
  return EVENT_META[eventType]?.label ?? eventType
}

export function eventIcon(eventType: string): React.ReactNode {
  return EVENT_META[eventType]?.icon ?? <Sparkles className="h-4 w-4" />
}

// ─── Programación ────────────────────────────────────────────────────────────

export const SCHEDULE_META: Record<
  AutomationScheduleStrategy,
  { label: string; help: string }
> = {
  IMMEDIATE: {
    label: 'Enseguida',
    help: 'Se ejecuta en cuanto ocurre el evento.',
  },
  DELAY: {
    label: 'Después de un tiempo',
    help: 'Se ejecuta pasado el tiempo que indiques desde el evento.',
  },
  RELATIVE_TO_FIELD: {
    label: 'Relativo a una fecha del evento',
    help: 'Se ejecuta antes o después de una fecha que trae el evento (la de la cita, la próxima recomendada…).',
  },
  DAILY_AT_LOCAL_TIME: {
    label: 'A una hora concreta',
    help: 'Espera el tiempo indicado y luego salta a esa hora de tu negocio. Evita escribirle a nadie de madrugada.',
  },
}

/**
 * Campos de fecha que traen los eventos y sirven para RELATIVE_TO_FIELD.
 *
 * Solo se ofrecen los que los módulos emiten de verdad: no tiene sentido dejar
 * elegir una fecha que nunca va a llegar en el payload.
 */
export const RELATIVE_FIELDS: { value: string; label: string; forEvents: string[] }[] = [
  {
    value: 'scheduledAt',
    label: 'La fecha de la cita',
    forEvents: [
      'APPOINTMENT_CREATED',
      'APPOINTMENT_CONFIRMED',
      'APPOINTMENT_RESCHEDULED',
      'APPOINTMENT_COMPLETED',
    ],
  },
  {
    value: 'nextRecommendedAt',
    label: 'La próxima fecha recomendada del servicio',
    forEvents: ['SERVICE_USED', 'PRODUCT_PURCHASED'],
  },
]

// ─── Estados ─────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

export const RULE_STATUS_META: Record<
  AutomationRuleStatus,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: 'Borrador', variant: 'default' },
  ACTIVE: { label: 'Activa', variant: 'success' },
  INACTIVE: { label: 'Pausada', variant: 'warning' },
  ARCHIVED: { label: 'Archivada', variant: 'default' },
}

export const JOB_STATUS_META: Record<
  AutomationJobStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING: { label: 'En cola', variant: 'info' },
  SCHEDULED: { label: 'Programado', variant: 'info' },
  PROCESSING: { label: 'Enviando', variant: 'purple' },
  COMPLETED: { label: 'Enviado', variant: 'success' },
  FAILED: { label: 'Falló', variant: 'danger' },
  CANCELLED: { label: 'Cancelado', variant: 'default' },
  RETRY_PENDING: { label: 'Reintentando', variant: 'warning' },
}

// ─── Variables de plantilla ──────────────────────────────────────────────────

/**
 * Variables que el motor sabe rellenar. Se muestran en el formulario para que
 * nadie invente un `{{apellido}}` que saldría vacío en el mensaje real.
 */
export const TEMPLATE_VARIABLES: { token: string; help: string }[] = [
  { token: '{{nombre}}', help: 'Nombre del cliente' },
  { token: '{{negocio}}', help: 'Nombre de tu empresa' },
  { token: '{{servicio}}', help: 'Servicio o producto del evento' },
  { token: '{{fecha}}', help: 'Fecha de la cita, en tu zona horaria' },
  { token: '{{hora}}', help: 'Hora de la cita, en tu zona horaria' },
]
