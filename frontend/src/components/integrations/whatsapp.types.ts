// Contratos con /api/integrations/whatsapp.
// El access token NUNCA viene del backend: solo hasToken + tokenLastFour.

export type WhatsAppStatus =
  | 'DRAFT'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'REQUIRES_ACTION'
  | 'ERROR'
  | 'DISABLED'

export type WhatsAppMode = 'EASY_ONBOARDING' | 'MANUAL_CLOUD_API' | 'DEMO_SANDBOX'

/** Dónde vive HOY el número del cliente (lo declara en el wizard). */
export type DeclaredNumberType =
  | 'PERSONAL'
  | 'BUSINESS_APP'
  | 'CLOUD_API'
  | 'OTHER_PROVIDER'
  | 'NEW_NUMBER'

export type NumberReadiness =
  | 'UNKNOWN'
  | 'PERSONAL_WHATSAPP'
  | 'WHATSAPP_BUSINESS_APP'
  | 'CLOUD_API_READY'
  | 'BSP_CONNECTED'
  | 'NEW_NUMBER_RECOMMENDED'
  | 'NEEDS_MIGRATION'
  | 'NEEDS_ASSISTED_SETUP'
  | 'CONNECTED'
  | 'ERROR'

export type ReadinessStage =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'READY_TO_CONNECT'
  | 'CONNECTED'
  | 'REQUIRES_CUSTOMER_ACTION'

export type ReadinessAction =
  | 'USE_NEW_NUMBER'
  | 'REQUEST_ASSISTANCE'
  | 'ADVANCED_SETUP'
  | 'CONNECT_WITH_META'
  | 'TRY_DEMO'

/** Recomendación que devuelve POST /api/integrations/whatsapp/number-readiness */
export interface ReadinessAssessment {
  readiness: NumberReadiness
  title: string
  message: string
  details: string[]
  recommendedAction: ReadinessAction
  actions: ReadinessAction[]
  needsAssistance: boolean
  supportTier: 'TIER_1' | 'TIER_2'
}

export const readinessLabels: Record<NumberReadiness, string> = {
  UNKNOWN: 'Sin evaluar',
  PERSONAL_WHATSAPP: 'En WhatsApp personal',
  WHATSAPP_BUSINESS_APP: 'En app WhatsApp Business',
  CLOUD_API_READY: 'Listo (Cloud API propio)',
  BSP_CONNECTED: 'Con proveedor externo',
  NEW_NUMBER_RECOMMENDED: 'Número nuevo recomendado',
  NEEDS_MIGRATION: 'Requiere migración',
  NEEDS_ASSISTED_SETUP: 'Requiere asistencia',
  CONNECTED: 'Conectado',
  ERROR: 'Error',
}

export const readinessStageLabels: Record<ReadinessStage, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  READY_TO_CONNECT: 'Listo para conectar',
  CONNECTED: 'Conectado',
  REQUIRES_CUSTOMER_ACTION: 'Requiere acción del cliente',
}

export const numberTypeLabels: Record<DeclaredNumberType, string> = {
  PERSONAL: 'WhatsApp personal',
  BUSINESS_APP: 'App WhatsApp Business',
  CLOUD_API: 'WhatsApp Cloud API propio',
  OTHER_PROVIDER: 'Otro proveedor / BSP',
  NEW_NUMBER: 'Número nuevo dedicado',
}

export interface WhatsAppIntegration {
  id: string
  provider: string
  mode: WhatsAppMode
  status: WhatsAppStatus
  businessName: string | null
  /** @deprecated usar wabaId */
  businessAccountId: string | null
  wabaId: string | null
  businessId: string | null
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  graphApiVersion: string
  verifyToken: string
  hasToken: boolean
  tokenLastFour: string | null
  webhookUrl: string
  webhookVerifiedAt: string | null
  webhookSubscribedAt: string | null
  embeddedSignupCompletedAt: string | null
  lastValidationAt: string | null
  lastValidationError: string | null
  assistedSetupRequestedAt: string | null
  assistedSetupStartedAt: string | null
  demoMessagesUsed: number
  demoMessageLimit: number | null
  numberReadiness: NumberReadiness
  readinessStage: ReadinessStage | null
  declaredNumberType: DeclaredNumberType | null
  /** El número declarado se devuelve SIEMPRE enmascarado al cliente */
  declaredPhoneNumberMasked: string | null
  currentProvider: string | null
  readinessRecommendation: string | null
  readinessUpdatedAt: string | null
  assignedAgents: { id: string; name: string; status: string }[]
}

export interface WhatsAppCapabilities {
  easyOnboarding: {
    enabled: boolean
    selfService: boolean
    channel: 'EMBEDDED_SIGNUP' | 'BSP' | 'ASSISTED'
    bspProvider: string | null
  }
  /** Config PÚBLICA del SDK de Meta (nunca trae el app secret) */
  embeddedSignup: {
    enabled: boolean
    appId: string | null
    configId: string | null
    graphApiVersion: string
  }
  manualCloudApi: { enabled: boolean }
  demoSandbox: { enabled: boolean; displayNumber: string | null; messageLimit: number }
  providers: { id: string; label: string; implemented: boolean }[]
}

export interface WhatsAppConfigResponse {
  integrations: WhatsAppIntegration[]
  webhookUrl: string
  subscribeFields: string[]
  capabilities: WhatsAppCapabilities
}

export interface WhatsAppHealth {
  configured: boolean
  mode: string | null
  provider: string | null
  status: string | null
  healthy: boolean
  message: string
  qualityRating: string | null
  checkedAt: string
  checklist: { label: string; done: boolean }[]
  tokenConfigured: boolean
  wabaId: string | null
  phoneNumberId: string | null
  webhookSubscribedAt: string | null
  assignedAgent: { id: string; name: string; active: boolean } | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  lastError: string | null
  // Derivados del backend (Parte F). Se añaden a los de arriba, no los sustituyen.
  connected: boolean
  hasWabaId: boolean
  hasPhoneNumberId: boolean
  hasToken: boolean
  webhookSubscribed: boolean
  assignedAgentActive: boolean
  recommendations: string[]
}

/** Número de la WABA que el cliente puede elegir. Nunca trae credenciales. */
export interface SelectablePhoneNumber {
  id: string
  displayPhoneNumber: string | null
  verifiedName: string | null
  qualityRating: string | null
  status: string | null
}

/**
 * Respuesta de /embedded-signup/complete y /embedded-signup/select-phone-number.
 * `availablePhoneNumbers` solo viene con contenido cuando el cliente tiene
 * varios números y debe elegir uno.
 */
export interface EmbeddedSignupResult {
  status: WhatsAppStatus
  mode: WhatsAppMode
  provider: string
  displayPhoneNumber: string | null
  phoneNumberId: string | null
  wabaId: string | null
  businessId: string | null
  availablePhoneNumbers: SelectablePhoneNumber[]
  nextStep: string
  message: string
  webhookSubscribed: boolean
  warning?: string
}

export const whatsappStatusMeta: Record<
  WhatsAppStatus | 'NOT_CONFIGURED',
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  NOT_CONFIGURED: { label: 'No conectado', variant: 'default' },
  DRAFT: { label: 'Pendiente de validación', variant: 'warning' },
  CONNECTING: { label: 'Conectando', variant: 'info' },
  CONNECTED: { label: 'Conectado', variant: 'success' },
  REQUIRES_ACTION: { label: 'Requiere acción', variant: 'warning' },
  ERROR: { label: 'Error', variant: 'danger' },
  DISABLED: { label: 'Deshabilitado', variant: 'default' },
}

export const whatsappModeMeta: Record<WhatsAppMode, string> = {
  EASY_ONBOARDING: 'Conexión guiada',
  MANUAL_CLOUD_API: 'Configuración avanzada',
  DEMO_SANDBOX: 'Modo demo',
}
