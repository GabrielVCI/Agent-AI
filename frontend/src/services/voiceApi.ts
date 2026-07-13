import api from '../lib/api'

// ─── Tipos (espejo del contrato /api/voice del backend) ──────────────────────

export type VoiceEntitlementReason =
  | 'OK'
  | 'TENANT_INACTIVE'
  | 'SUBSCRIPTION_INACTIVE'
  | 'PLAN_REQUIRED'
  | 'VOICE_NOT_ENABLED'
  | 'VOICE_MINUTES_LIMIT_REACHED'

export interface VoiceEntitlement {
  enabled: boolean
  canUseVoice: boolean
  reason: VoiceEntitlementReason
  planCode: string | null
  subscriptionStatus: string | null
  monthlyMinutesLimit: number
  minutesPerUser: number
  usedMinutes: number
  remainingMinutes: number
  percentUsed: number
  estimatedCost: number
  periodStart: string
  periodEnd: string
}

export interface VoiceCall {
  id: string
  agent: { id: string; name: string } | null
  direction: 'INBOUND' | 'OUTBOUND'
  status: string
  startedAt: string
  durationSeconds: number
  durationMinutes: number
  estimatedCost: number
  customerPhone: string | null
  summary: string | null
}

export interface VoiceCallDetail extends VoiceCall {
  transcript: string | null
  conversationId: string | null
}

export const voiceApi = {
  entitlement: () => api.get<VoiceEntitlement>('/api/voice/entitlement'),

  usage: () => api.get<Record<string, unknown>>('/api/voice/usage'),

  calls: (limit = 50) => api.get<VoiceCall[]>('/api/voice/calls', { limit }),

  call: (id: string) => api.get<VoiceCallDetail>(`/api/voice/calls/${id}`),

  /** Empuja el prompt del agente Sendwary hacia su agente de ElevenLabs */
  syncAgent: (agentId: string) =>
    api.post<{ synced: boolean; detail: string }>(`/api/voice/agents/${agentId}/sync`),

  /** Solo dev/SUPER_ADMIN: registra consumo simulado para probar la UI */
  testRecordUsage: (durationSeconds: number) =>
    api.post<{ entitlement: VoiceEntitlement }>('/api/voice/test-record-usage', {
      durationSeconds,
    }),
}
