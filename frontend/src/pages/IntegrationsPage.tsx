import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plug, FileSpreadsheet, Table2, MessageSquare, Phone, CreditCard,
  Download, FileUp, FileDown, CheckCircle2, AlertTriangle, Copy,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import { Card } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import WhatsAppWizard from '../components/integrations/WhatsAppWizard'
import type { WhatsAppHealth } from '../components/integrations/whatsapp.types'

// ─── Contratos con el backend ────────────────────────────────────────────────

type IntegrationStatus = 'AVAILABLE' | 'CONFIGURED' | 'REQUIRES_CONFIG' | 'COMING_SOON'

interface IntegrationCard {
  id: string
  name: string
  description: string
  status: IntegrationStatus
  actions: string[]
}

interface ImportRow {
  row: number
  data: Record<string, string>
  errors: string[]
  duplicate: boolean
  imported: boolean
}

interface ImportResult {
  preview: boolean
  total: number
  valid: number
  invalid: number
  duplicates: number
  imported: number
  rows: ImportRow[]
}

const statusMeta: Record<IntegrationStatus, { label: string; variant: 'success' | 'info' | 'warning' | 'default' }> = {
  AVAILABLE: { label: 'Disponible', variant: 'info' },
  CONFIGURED: { label: 'Configurado', variant: 'success' },
  REQUIRES_CONFIG: { label: 'Requiere configuración', variant: 'warning' },
  COMING_SOON: { label: 'Próximamente', variant: 'default' },
}

const integrationIcons: Record<string, React.ReactNode> = {
  excel: <FileSpreadsheet className="h-5 w-5" />,
  'google-sheets': <Table2 className="h-5 w-5" />,
  whatsapp: <MessageSquare className="h-5 w-5" />,
  elevenlabs: <Phone className="h-5 w-5" />,
  lemonsqueezy: <CreditCard className="h-5 w-5" />,
}

// ─── Modal de importación Excel (preview → confirmar) ────────────────────────

function ExcelImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (imported: number) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setResult(null)
      setError('')
    }
  }, [open])

  const run = async (preview: boolean) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await api.upload<ImportResult>('/api/appointments/import/excel', formData, {
        preview,
      })
      setResult(data)
      if (!preview) onImported(data.imported)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo procesar el archivo')
    } finally {
      setBusy(false)
    }
  }

  const importable = result ? result.valid - result.duplicates : 0

  return (
    <Modal open={open} onClose={onClose} title="Importar citas desde Excel" size="lg">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-4">
        <div
          className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          {file ? (
            <p className="text-sm font-medium text-slate-800">{file.name}</p>
          ) : (
            <p className="text-sm text-slate-500">
              Haz clic para seleccionar tu archivo <strong>.xlsx</strong> (usa la plantilla oficial)
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={e => {
              setFile(e.target.files?.[0] ?? null)
              setResult(null)
            }}
          />
        </div>

        {result && (
          <>
            {/* Resumen del preview/import */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-lg font-bold text-slate-900">{result.total}</p>
                <p className="text-xs text-slate-500">Filas leídas</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2.5">
                <p className="text-lg font-bold text-green-700">
                  {result.preview ? importable : result.imported}
                </p>
                <p className="text-xs text-green-700">
                  {result.preview ? 'Listas para importar' : 'Importadas'}
                </p>
              </div>
              <div className="bg-amber-50 rounded-lg p-2.5">
                <p className="text-lg font-bold text-amber-700">{result.duplicates}</p>
                <p className="text-xs text-amber-700">Duplicadas (se omiten)</p>
              </div>
              <div className="bg-red-50 rounded-lg p-2.5">
                <p className="text-lg font-bold text-red-700">{result.invalid}</p>
                <p className="text-xs text-red-700">Con errores</p>
              </div>
            </div>

            {/* Detalle por fila (solo problemas, para no saturar) */}
            {result.rows.some(r => r.errors.length > 0 || r.duplicate) && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {result.rows
                  .filter(r => r.errors.length > 0 || r.duplicate)
                  .map(r => (
                    <div key={r.row} className="p-2.5 text-xs">
                      <p className="font-medium text-slate-700">
                        Fila {r.row}
                        {r.data.customerName ? ` — ${r.data.customerName}` : ''}
                        {r.duplicate && (
                          <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                            <Copy className="h-3 w-3" />
                            duplicada
                          </span>
                        )}
                      </p>
                      {r.errors.map((e, i) => (
                        <p key={i} className="text-red-600 mt-0.5 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {e}
                        </p>
                      ))}
                    </div>
                  ))}
              </div>
            )}

            {!result.preview && result.imported > 0 && (
              <Alert variant="success">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.imported} cita(s) importada(s) correctamente.
                </span>
              </Alert>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result && !result.preview ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            variant="outline"
            onClick={() => run(true)}
            disabled={!file}
            loading={busy && !result}
          >
            Vista previa
          </Button>
          <Button
            onClick={() => run(false)}
            disabled={!file || !result || !result.preview || importable === 0}
            loading={busy && Boolean(result)}
            icon={<FileUp className="h-4 w-4" />}
          >
            Importar {result?.preview && importable > 0 ? `(${importable})` : ''}
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Primero ejecuta la vista previa: nada se guarda hasta que confirmes la importación. Las
          filas con errores o duplicadas nunca se insertan.
        </p>
      </div>
    </Modal>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { user } = useAuth()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [cards, setCards] = useState<IntegrationCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [waHealth, setWaHealth] = useState<WhatsAppHealth | null>(null)

  const load = useCallback(() => {
    api
      .get<IntegrationCard[]>('/api/integrations')
      .then(data => setCards(Array.isArray(data) ? data : []))
      .catch((err: { message?: string }) =>
        setError(err?.message || 'No se pudieron cargar las integraciones')
      )
      .finally(() => setLoading(false))

    // Estado de WhatsApp en lenguaje de negocio (qué falta para que funcione).
    // Fallo transitorio: la card se muestra igual, solo sin el detalle.
    api
      .get<WhatsAppHealth>('/api/integrations/whatsapp/health')
      .then(setWaHealth)
      .catch(() => setWaHealth(null))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const handleDownload = async (kind: 'export' | 'template') => {
    setDownloading(kind)
    setError('')
    try {
      await api.download(
        kind === 'export' ? '/api/appointments/export/excel' : '/api/appointments/template/excel',
        undefined,
        kind === 'export' ? 'citas-sendwary.xlsx' : 'plantilla-citas-sendwary.xlsx'
      )
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo descargar el archivo')
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Herramientas externas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Conecta Sendwary con las herramientas que ya usa tu negocio
          </p>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(card => {
          const meta = statusMeta[card.status] ?? statusMeta.COMING_SOON
          const isExcel = card.id === 'excel'
          const isWhatsapp = card.id === 'whatsapp'
          return (
            <Card key={card.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                    {integrationIcons[card.id] ?? <Plug className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{card.name}</p>
                    <Badge variant={meta.variant} className="mt-1">
                      {meta.label}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-3 flex-1">{card.description}</p>

              {isExcel && canManage && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download className="h-3.5 w-3.5" />}
                    loading={downloading === 'export'}
                    onClick={() => handleDownload('export')}
                  >
                    Exportar agenda
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<FileDown className="h-3.5 w-3.5" />}
                    loading={downloading === 'template'}
                    onClick={() => handleDownload('template')}
                  >
                    Plantilla
                  </Button>
                  <Button
                    size="sm"
                    icon={<FileUp className="h-3.5 w-3.5" />}
                    onClick={() => setImportOpen(true)}
                  >
                    Importar
                  </Button>
                </div>
              )}
              {isExcel && (
                <p className="text-xs text-slate-400 mt-2">
                  La sincronización automática con Excel Online (Microsoft 365) llegará más
                  adelante.
                </p>
              )}

              {isWhatsapp && waHealth && (
                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p
                    className={`text-xs font-medium ${
                      waHealth.healthy ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {waHealth.healthy ? '✓ Todo listo' : 'Falta completar'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{waHealth.message}</p>
                  {!waHealth.healthy && waHealth.checklist.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {waHealth.checklist.map(item => (
                        <li
                          key={item.label}
                          className={`text-[11px] flex items-center gap-1.5 ${
                            item.done ? 'text-slate-400' : 'text-slate-600'
                          }`}
                        >
                          {item.done ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          )}
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {isWhatsapp && canManage && (
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
                  <Button size="sm" onClick={() => setWhatsappOpen(true)}>
                    {card.status === 'CONFIGURED' ? 'Gestionar conexión' : 'Conectar WhatsApp'}
                  </Button>
                </div>
              )}
              {isWhatsapp && !canManage && (
                <p className="text-xs text-slate-400 mt-2">
                  Solo el propietario o un administrador pueden configurar WhatsApp.
                </p>
              )}
            </Card>
          )
        })}
      </div>

      <ExcelImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={imported => flash(`${imported} cita(s) importada(s). Revísalas en Citas.`)}
      />

      <WhatsAppWizard
        open={whatsappOpen}
        onClose={() => setWhatsappOpen(false)}
        onChanged={load}
      />
    </div>
  )
}
