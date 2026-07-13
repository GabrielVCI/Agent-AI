import api from '../lib/api'

// ─── Tipos (espejo del contrato /api/knowledge del backend) ──────────────────

export interface KnowledgeDoc {
  id: string
  title: string
  fileName: string
  fileType: string
  status: string
  /** null = disponible para todos los agentes */
  agentId: string | null
  isActive: boolean
  contentText: string
  contentLength: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocInput {
  title: string
  contentText: string
  agentId?: string | null
  fileName?: string | null
  isActive?: boolean
}

export const knowledgeApi = {
  list: () => api.get<KnowledgeDoc[]>('/api/knowledge/documents'),

  create: (data: KnowledgeDocInput) => api.post<KnowledgeDoc>('/api/knowledge/documents', data),

  get: (id: string) => api.get<KnowledgeDoc>(`/api/knowledge/documents/${id}`),

  update: (id: string, data: Partial<KnowledgeDocInput>) =>
    api.put<KnowledgeDoc>(`/api/knowledge/documents/${id}`, data),

  remove: (id: string) => api.delete<{ deleted: boolean }>(`/api/knowledge/documents/${id}`),
}
