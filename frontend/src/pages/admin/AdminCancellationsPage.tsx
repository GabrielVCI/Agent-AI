import { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Flag } from 'lucide-react'
import { CancellationRequest } from '../../types'
import api from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

function statusBadge(status: CancellationRequest['status']) {
  switch (status) {
    case 'PENDING': return <Badge variant="warning">Pendiente</Badge>
    case 'APPROVED': return <Badge variant="success">Aprobada</Badge>
    case 'REJECTED': return <Badge variant="danger">Rechazada</Badge>
    case 'COMPLETED': return <Badge variant="default">Completada</Badge>
  }
}

export default function AdminCancellationsPage() {
  const [requests, setRequests] = useState<CancellationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<CancellationRequest[]>('/api/admin/cancellation-requests')
      setRequests(Array.isArray(data) ? data : [])
    } catch {
      setRequests([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'reject' | 'complete') => {
    try {
      await api.post(`/api/admin/cancellation-requests/${id}/${action}`)
      setMessage({ type: 'success', text: 'Operación realizada' })
      await load()
    } catch {
      setMessage({ type: 'error', text: 'Error en la operación' })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Solicitudes de cancelación</h2>
        <p className="text-sm text-slate-500">{requests.filter(r => r.status === 'PENDING').length} pendientes</p>
      </div>

      {message && <Alert variant={message.type === 'success' ? 'success' : 'danger'}>{message.text}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Sin solicitudes</div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-semibold text-slate-900">{req.tenantName}</p>
                  <p className="text-xs text-slate-500">
                    Solicitado: {new Date(req.requestedAt).toLocaleString('es')}
                    {req.resolvedAt && ` · Resuelto: ${new Date(req.resolvedAt).toLocaleString('es')}`}
                  </p>
                </div>
                {statusBadge(req.status)}
              </div>
              <p className="text-sm text-slate-700 mb-3 bg-slate-50 px-3 py-2 rounded-lg">{req.reason}</p>
              {req.status === 'PENDING' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                    onClick={() => act(req.id, 'approve')}
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    onClick={() => act(req.id, 'reject')}
                  >
                    Rechazar
                  </Button>
                </div>
              )}
              {req.status === 'APPROVED' && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Flag className="h-3.5 w-3.5" />}
                  onClick={() => act(req.id, 'complete')}
                >
                  Marcar como completada
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
