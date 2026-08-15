import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Save, PlayCircle, PlugZap, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react'
import api from '../../lib/api'
import { Card, CardHeader } from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import {
  whatsappStatusMeta,
  whatsappModeMeta,
  readinessLabels,
  readinessStageLabels,
  numberTypeLabels,
  type WhatsAppHealth,
  type WhatsAppIntegration,
  type WhatsAppMode,
  type WhatsAppStatus,
  type NumberReadiness,
  type ReadinessStage,
} from '../integrations/whatsapp.types'

/**
 * Panel SUPER_ADMIN de la conexión de WhatsApp de un cliente.
 * Nunca muestra el access token (solo los últimos 4 dígitos, como el resto
 * del sistema). Permite atender solicitudes de conexión asistida.
 */

interface AdminIntegration extends WhatsAppIntegration {
  adminNotes: string | null
  /** Solo el admin ve el número completo (lo necesita para configurarlo) */
  declaredPhoneNumber: string | null
  readinessNotes: string | null
  assistedSetupRequest: {
    requestedBy?: { name?: string; email?: string }
    contactPhone?: string | null
    desiredNumber?: string | null
    checklist?: Record<string, boolean>
    notes?: string | null
  } | null
}

interface AdminWhatsAppResponse {
  integrations: AdminIntegration[]
  health: WhatsAppHealth
}

const STATUSES: WhatsAppStatus[] = [
  'DRAFT',
  'CONNECTING',
  'CONNECTED',
  'REQUIRES_ACTION',
  'ERROR',
  'DISABLED',
]
const MODES: WhatsAppMode[] = ['EASY_ONBOARDING', 'MANUAL_CLOUD_API', 'DEMO_SANDBOX']

export default function TenantWhatsAppCard({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<AdminWhatsAppResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [status, setStatus] = useState<string>('')
  const [mode, setMode] = useState<string>('')
  const [adminNotes, setAdminNotes] = useState('')
  const [connectForm, setConnectForm] = useState({
    phoneNumberId: '',
    accessToken: '',
    displayPhoneNumber: '',
  })

  const integration = data?.integrations[0] ?? null

  const load = useCallback(async () => {
    try {
      const res = await api.get<AdminWhatsAppResponse>(`/api/admin/tenants/${tenantId}/whatsapp`)
      setData(res)
      const row = res.integrations[0]
      if (row) {
        setStatus(row.status)
        setMode(row.mode)
        setAdminNotes(row.adminNotes ?? '')
        setConnectForm(f => ({
          ...f,
          phoneNumberId: row.phoneNumberId ?? f.phoneNumberId,
          displayPhoneNumber: row.displayPhoneNumber ?? f.displayPhoneNumber,
        }))
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    load()
  }, [load])

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key)
    setMessage(null)
    try {
      const res = (await fn()) as { message?: string } | undefined
      setMessage({ type: 'success', text: res?.message || okMsg })
      await load()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: (err as { message?: string })?.message || 'Error en la operación' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader title="WhatsApp" />
        <p className="text-sm text-slate-400">Cargando…</p>
      </Card>
    )
  }

  /** Seguimiento de la preparación del número (etapa / diagnóstico). */
  const patchReadiness = (
    body: { readinessStage?: string; numberReadiness?: string },
    key: string
  ) =>
    run(
      key,
      () => api.patch(`/api/admin/tenants/${tenantId}/whatsapp/readiness`, body),
      'Seguimiento del número actualizado'
    )

  const statusMeta = integration
    ? whatsappStatusMeta[integration.status] ?? whatsappStatusMeta.NOT_CONFIGURED
    : whatsappStatusMeta.NOT_CONFIGURED

  return (
    <Card>
      <CardHeader
        title="WhatsApp"
        description="Estado de la conexión del cliente, solicitudes de ayuda y configuración asistida"
        action={
          <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={load}>
            Actualizar
          </Button>
        }
      />

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'danger'} className="mb-3">
          {message.text}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-primary-600" />
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        {integration && (
          <span className="text-xs text-slate-500">
            {whatsappModeMeta[integration.mode] ?? integration.mode} · {integration.provider}
          </span>
        )}
        {integration?.displayPhoneNumber && (
          <span className="text-xs text-slate-500">· {integration.displayPhoneNumber}</span>
        )}
      </div>

      {/* Health en lenguaje de negocio + detalle técnico (sin token) */}
      {data?.health && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 mb-4">
          <p className={`text-xs font-medium ${data.health.healthy ? 'text-emerald-700' : 'text-amber-700'}`}>
            {data.health.healthy ? 'Conexión operativa' : 'Conexión incompleta'}
            {data.health.qualityRating ? ` · calidad ${data.health.qualityRating}` : ''}
          </p>
          <p className="text-xs text-slate-600 mt-1">{data.health.message}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-[11px] text-slate-500 mt-2">
            <p>Credenciales: {data.health.tokenConfigured ? 'guardadas ✓' : 'faltan'}</p>
            <p>WABA: {data.health.wabaId ?? '—'}</p>
            <p>Phone Number ID: {data.health.phoneNumberId ?? '—'}</p>
            <p>
              Webhooks:{' '}
              {data.health.webhookSubscribedAt
                ? new Date(data.health.webhookSubscribedAt).toLocaleDateString('es')
                : 'sin suscribir'}
            </p>
            <p>
              Agente:{' '}
              {data.health.assignedAgent
                ? `${data.health.assignedAgent.name}${data.health.assignedAgent.active ? '' : ' (inactivo)'}`
                : 'sin asignar'}
            </p>
            <p>
              Último entrante:{' '}
              {data.health.lastInboundAt
                ? new Date(data.health.lastInboundAt).toLocaleDateString('es')
                : '—'}
            </p>
            <p>
              Último saliente:{' '}
              {data.health.lastOutboundAt
                ? new Date(data.health.lastOutboundAt).toLocaleDateString('es')
                : '—'}
            </p>
          </div>
          {data.health.lastError && (
            <p className="text-[11px] text-red-600 mt-1.5">Último error: {data.health.lastError}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2.5">
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'revalidate'}
              onClick={() =>
                run(
                  'revalidate',
                  () => api.post(`/api/admin/tenants/${tenantId}/whatsapp/mark-connected`, {
                    phoneNumberId: integration?.phoneNumberId ?? '',
                  }),
                  'Validación reintentada'
                )
              }
              disabled={!integration?.phoneNumberId}
            >
              Reintentar validación
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'retry-webhook'}
              onClick={() =>
                run(
                  'retry-webhook',
                  () => api.post(`/api/admin/tenants/${tenantId}/whatsapp/retry-webhook`),
                  'Suscripción de webhooks reintentada'
                )
              }
            >
              Reintentar webhooks
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'requires-action'}
              onClick={() =>
                run(
                  'requires-action',
                  () => api.patch(`/api/admin/tenants/${tenantId}/whatsapp`, { status: 'REQUIRES_ACTION' }),
                  'Marcado como requiere acción'
                )
              }
            >
              Marcar requiere acción
            </Button>
          </div>
        </div>
      )}

      {!integration && (
        <p className="text-sm text-slate-500">
          Este cliente todavía no inició ninguna conexión de WhatsApp.
        </p>
      )}

      {integration && (
        <>
          {/* Preparación del número: lo que declaró el cliente en el wizard */}
          {integration.declaredNumberType && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 mb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-primary-600" />
                  Preparación del número
                </p>
                <div className="flex items-center gap-1.5">
                  <Badge variant="info">
                    {readinessLabels[integration.numberReadiness as NumberReadiness] ??
                      integration.numberReadiness}
                  </Badge>
                  {integration.readinessStage && (
                    <Badge
                      variant={
                        integration.readinessStage === 'CONNECTED'
                          ? 'success'
                          : integration.readinessStage === 'REQUIRES_CUSTOMER_ACTION'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {readinessStageLabels[integration.readinessStage as ReadinessStage] ??
                        integration.readinessStage}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                <p>
                  Tipo declarado:{' '}
                  <strong>
                    {numberTypeLabels[
                      integration.declaredNumberType as keyof typeof numberTypeLabels
                    ] ?? integration.declaredNumberType}
                  </strong>
                </p>
                <p>Número: <strong>{integration.declaredPhoneNumber || '—'}</strong></p>
                {integration.currentProvider && <p>Proveedor actual: {integration.currentProvider}</p>}
                {integration.readinessUpdatedAt && (
                  <p>
                    Declarado el {new Date(integration.readinessUpdatedAt).toLocaleDateString('es')}
                  </p>
                )}
              </div>
              {integration.readinessRecommendation && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Recomendación mostrada: “{integration.readinessRecommendation}”
                </p>
              )}
              {integration.readinessNotes && (
                <p className="text-xs text-slate-500 mt-1">
                  Notas del cliente: {integration.readinessNotes}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === 'review'}
                  onClick={() => patchReadiness({ readinessStage: 'IN_REVIEW' }, 'review')}
                >
                  En revisión
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === 'ready'}
                  onClick={() => patchReadiness({ readinessStage: 'READY_TO_CONNECT' }, 'ready')}
                >
                  Listo para conectar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === 'newnum'}
                  onClick={() =>
                    patchReadiness(
                      { numberReadiness: 'NEW_NUMBER_RECOMMENDED', readinessStage: 'REQUIRES_CUSTOMER_ACTION' },
                      'newnum'
                    )
                  }
                >
                  Requiere número nuevo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === 'migrate'}
                  onClick={() =>
                    patchReadiness(
                      { numberReadiness: 'NEEDS_MIGRATION', readinessStage: 'IN_REVIEW' },
                      'migrate'
                    )
                  }
                >
                  Requiere migración
                </Button>
              </div>
            </div>
          )}

          {/* Solicitud de conexión asistida */}
          {integration.assistedSetupRequest && (
            <div className="rounded-lg border border-primary-100 bg-primary-50/60 p-3 mb-4 text-xs space-y-1">
              <p className="font-semibold text-primary-800">Solicitud de conexión guiada</p>
              <p className="text-slate-600">
                Solicitada por {integration.assistedSetupRequest.requestedBy?.name ?? '—'} (
                {integration.assistedSetupRequest.requestedBy?.email ?? '—'})
                {integration.assistedSetupRequestedAt
                  ? ` el ${new Date(integration.assistedSetupRequestedAt).toLocaleDateString('es')}`
                  : ''}
              </p>
              <p className="text-slate-600">
                Contacto: {integration.assistedSetupRequest.contactPhone || '—'} · Número deseado:{' '}
                {integration.assistedSetupRequest.desiredNumber || 'por definir'}
              </p>
              <p className="text-slate-600">
                Cuenta Meta: {integration.assistedSetupRequest.checklist?.hasMetaBusinessAccount ? 'sí' : 'no'} ·
                Admin: {integration.assistedSetupRequest.checklist?.hasAdminAccess ? 'sí' : 'no'} ·
                Número: {integration.assistedSetupRequest.checklist?.hasAvailableNumber ? 'sí' : 'no'}
              </p>
              {integration.assistedSetupRequest.notes && (
                <p className="text-slate-600">Notas del cliente: {integration.assistedSetupRequest.notes}</p>
              )}
              {integration.assistedSetupStartedAt && (
                <p className="text-emerald-700">
                  Trabajo iniciado el{' '}
                  {new Date(integration.assistedSetupStartedAt).toLocaleDateString('es')}
                </p>
              )}
            </div>
          )}

          {/* Estado y notas internas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Estado</label>
              <select className="input w-full" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => (
                  <option key={s} value={s}>
                    {whatsappStatusMeta[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Modo de conexión</label>
              <select className="input w-full" value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => (
                  <option key={m} value={m}>
                    {whatsappModeMeta[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">
                Notas internas (el cliente nunca las ve)
              </label>
              <textarea
                className="input w-full"
                rows={2}
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="Avance de la configuración, pendientes con Meta, contacto…"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              icon={<Save className="h-3.5 w-3.5" />}
              loading={busy === 'patch'}
              onClick={() =>
                run(
                  'patch',
                  () =>
                    api.patch(`/api/admin/tenants/${tenantId}/whatsapp`, {
                      status,
                      mode,
                      adminNotes: adminNotes.trim() || null,
                    }),
                  'Conexión actualizada'
                )
              }
            >
              Guardar
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<PlayCircle className="h-3.5 w-3.5" />}
              loading={busy === 'start'}
              onClick={() =>
                run(
                  'start',
                  () => api.post(`/api/admin/tenants/${tenantId}/whatsapp/mark-assisted-setup-started`),
                  'Setup asistido iniciado'
                )
              }
            >
              Marcar setup iniciado
            </Button>
          </div>

          {/* Completar la conexión por el cliente (modo asistido) */}
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
              <PlugZap className="h-3.5 w-3.5 text-primary-600" />
              Completar conexión (el equipo configuró el número en Meta)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                className="input w-full"
                value={connectForm.phoneNumberId}
                onChange={e => setConnectForm(f => ({ ...f, phoneNumberId: e.target.value }))}
                placeholder="Phone Number ID"
              />
              <input
                className="input w-full"
                type="password"
                autoComplete="off"
                value={connectForm.accessToken}
                onChange={e => setConnectForm(f => ({ ...f, accessToken: e.target.value }))}
                placeholder={
                  integration.hasToken
                    ? `Token guardado (····${integration.tokenLastFour ?? ''})`
                    : 'Access token (se cifra)'
                }
              />
              <input
                className="input w-full"
                value={connectForm.displayPhoneNumber}
                onChange={e => setConnectForm(f => ({ ...f, displayPhoneNumber: e.target.value }))}
                placeholder="Número mostrado"
              />
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                Se valida contra el proveedor antes de marcar como conectado.
              </p>
              <Button
                size="sm"
                loading={busy === 'connect'}
                disabled={!connectForm.phoneNumberId.trim()}
                onClick={() =>
                  run(
                    'connect',
                    () =>
                      api.post(`/api/admin/tenants/${tenantId}/whatsapp/mark-connected`, {
                        phoneNumberId: connectForm.phoneNumberId.trim(),
                        ...(connectForm.accessToken.trim()
                          ? { accessToken: connectForm.accessToken.trim() }
                          : {}),
                        displayPhoneNumber: connectForm.displayPhoneNumber.trim() || null,
                      }),
                    'Conexión completada'
                  )
                }
              >
                Validar y marcar conectado
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
