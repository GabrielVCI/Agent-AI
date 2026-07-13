import api from '../lib/api'

/**
 * Contrato de Entrenamiento (contexto del negocio) frontend <-> backend.
 *
 * El backend guarda esto en Tenant.trainingConfig (JSON) y lo inyecta al prompt
 * del agente. Aquí normalizamos SIEMPRE: las listas pueden venir null/undefined
 * o con objetos incompletos; la UI nunca debe operar sobre datos crudos.
 */

export interface TrainingService {
  name: string
  description?: string
  price?: string
  notes?: string
}

export interface TrainingFaq {
  question: string
  answer?: string
}

export interface TrainingPolicies {
  appointments?: string
  cancellations?: string
  deliveries?: string
  returns?: string
  warranties?: string
}

export interface TrainingConfig {
  businessDescription?: string
  customInstructions?: string
  communicationTone?: string
  services: TrainingService[]
  faqs: TrainingFaq[]
  schedule?: string
  address?: string
  serviceAreas?: string
  policies: TrainingPolicies
  escalationRules?: string
  welcomeMessage?: string
  outOfHoursMessage?: string
  fallbackMessage?: string
  forbiddenTopics?: string
}

export const emptyTraining: TrainingConfig = { services: [], faqs: [], policies: {} }

function tlog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log('[AGENT TRAINING]', ...args)
}

function s(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function normalizeServices(v: unknown): TrainingService[] {
  if (!Array.isArray(v)) return []
  return v.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>
    return {
      name: typeof o.name === 'string' ? o.name : '',
      description: s(o.description),
      price: s(o.price),
      notes: s(o.notes),
    }
  })
}

function normalizeFaqs(v: unknown): TrainingFaq[] {
  if (!Array.isArray(v)) return []
  return v.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>
    return {
      question: typeof o.question === 'string' ? o.question : '',
      answer: s(o.answer),
    }
  })
}

/** Backend -> TrainingConfig garantizado (listas siempre arrays, policies siempre objeto). */
export function normalizeTraining(raw: unknown): TrainingConfig {
  const r = (raw ?? {}) as Record<string, any>
  const pol = (r.policies ?? {}) as Record<string, any>
  return {
    businessDescription: s(r.businessDescription),
    customInstructions: s(r.customInstructions),
    communicationTone: s(r.communicationTone),
    services: normalizeServices(r.services),
    faqs: normalizeFaqs(r.faqs),
    schedule: s(r.schedule),
    address: s(r.address),
    serviceAreas: s(r.serviceAreas),
    policies: {
      appointments: s(pol.appointments),
      cancellations: s(pol.cancellations),
      deliveries: s(pol.deliveries),
      returns: s(pol.returns),
      warranties: s(pol.warranties),
    },
    escalationRules: s(r.escalationRules),
    welcomeMessage: s(r.welcomeMessage),
    outOfHoursMessage: s(r.outOfHoursMessage),
    fallbackMessage: s(r.fallbackMessage),
    forbiddenTopics: s(r.forbiddenTopics),
  }
}

export async function getTraining(): Promise<TrainingConfig> {
  tlog('loading config')
  const data = await api.get<unknown>('/api/settings/agent-training')
  return normalizeTraining(data)
}

export async function saveTraining(config: TrainingConfig): Promise<TrainingConfig> {
  tlog('saving config')
  const data = await api.put<unknown>('/api/settings/agent-training', config)
  return normalizeTraining(data)
}
