import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileSpreadsheet, Upload, CheckCircle2, RotateCcw } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import Badge from '../ui/Badge'
import { customersApi, type CustomerImportResult } from '../../services/customersApi'

const MAX_FILE_MB = 5

type Step = 'select' | 'preview' | 'done'

/** Tarjeta compacta de una métrica del resultado. */
function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const tones = {
    default: 'bg-slate-50 text-slate-900 border-slate-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
    </div>
  )
}

export default function CustomerImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('select')
  const [result, setResult] = useState<CustomerImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setFile(null)
    setResult(null)
    setStep('select')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = (selected: File | null) => {
    setError('')
    setResult(null)
    setStep('select')
    if (!selected) {
      setFile(null)
      return
    }
    const name = selected.name.toLowerCase()
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setError('Solo aceptamos archivos .csv o .xlsx')
      setFile(null)
      return
    }
    if (selected.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`El archivo supera los ${MAX_FILE_MB} MB permitidos`)
      setFile(null)
      return
    }
    setFile(selected)
  }

  const runPreview = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      setResult(await customersApi.importPreview(file))
      setStep('preview')
    } catch (err) {
      setError((err as { message?: string })?.message || 'No pudimos leer el archivo')
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const imported = await customersApi.import(file)
      setResult(imported)
      setStep('done')
      onImported()
    } catch (err) {
      setError((err as { message?: string })?.message || 'No pudimos importar el archivo')
    } finally {
      setBusy(false)
    }
  }

  const problemRows = result?.rows.filter(r => r.errors.length > 0 || r.duplicate) ?? []

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar clientes"
      description="Sube un archivo .csv o .xlsx. Te mostramos un resumen antes de confirmar."
      size="xl"
    >
      <div className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {/* Paso 1: archivo */}
        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-primary-50 text-primary-600 flex-shrink-0">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {file ? file.name : 'Ningún archivo seleccionado'}
                </p>
                <p className="text-xs text-slate-500">
                  Columnas: Nombre, Apellido, Teléfono (obligatorias) · Email, Fecha de nacimiento,
                  Cédula, Dirección, Notas, Etiquetas
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<Download className="h-4 w-4" />}
                onClick={() => customersApi.downloadTemplate().catch(() => setError('No pudimos descargar la plantilla'))}
              >
                Plantilla
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
              >
                Elegir archivo
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Paso 2: resumen */}
        {result && (
          <div className="space-y-3">
            {step === 'done' && (
              <Alert variant="success" title="Importación completada">
                Se agregaron {result.created} cliente(s) a tu maestro.
              </Alert>
            )}
            {result.truncated && (
              <Alert variant="warning">
                El archivo tenía más filas de las permitidas. Procesamos las primeras{' '}
                {result.processed}. Divide el archivo para importar el resto.
              </Alert>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Metric label="Procesados" value={result.processed} />
              <Metric
                label={step === 'done' ? 'Creados' : 'Se crearán'}
                value={step === 'done' ? result.created : result.valid - result.existing}
                tone="success"
              />
              <Metric label="Ya existían" value={result.existing} tone="warning" />
              <Metric label="Repetidos" value={result.duplicatesInFile} tone="warning" />
              <Metric label="Con errores" value={result.invalid} tone="danger" />
            </div>

            {problemRows.length > 0 && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Filas que necesitan tu atención ({problemRows.length})
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {problemRows.slice(0, 100).map(row => (
                    <div key={row.row} className="px-3 py-2 flex flex-wrap items-start gap-2 text-sm">
                      <Badge variant="default">Fila {row.row}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700 truncate">
                          {row.name} · {row.phone || 'sin teléfono'}
                        </p>
                        {row.duplicateReason === 'EXISTING' ? (
                          <p className="text-xs text-amber-600">
                            Ya existe en tu maestro.{' '}
                            {row.existingCustomerId && (
                              <Link
                                to={`/clientes/${row.existingCustomerId}`}
                                className="underline hover:text-amber-700"
                                onClick={handleClose}
                              >
                                Ver ficha
                              </Link>
                            )}
                          </p>
                        ) : null}
                        {row.errors.map((message, index) => (
                          <p key={index} className="text-xs text-red-600">
                            {message}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                  {problemRows.length > 100 && (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      …y {problemRows.length - 100} fila(s) más. Corrige el archivo y vuelve a
                      subirlo.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={handleClose}>
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </Button>
          {step === 'done' ? (
            <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
              Importar otro archivo
            </Button>
          ) : step === 'preview' ? (
            <Button
              loading={busy}
              icon={<CheckCircle2 className="h-4 w-4" />}
              disabled={result ? result.valid - result.existing === 0 : true}
              onClick={runImport}
            >
              Importar {result ? Math.max(0, result.valid - result.existing) : 0} cliente(s)
            </Button>
          ) : (
            <Button loading={busy} disabled={!file} icon={<Upload className="h-4 w-4" />} onClick={runPreview}>
              Revisar archivo
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
