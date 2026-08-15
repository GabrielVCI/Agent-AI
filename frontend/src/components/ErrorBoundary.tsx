import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Fallback de UI para errores de render no controlados (el "500 del frontend").
 * El usuario ve un mensaje amigable con botón de recarga; el detalle técnico
 * solo aparece pequeño en desarrollo y siempre queda en la consola.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log técnico (consola del navegador); nunca se muestra en la UI.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Ocurrió un error inesperado</h1>
        <p className="text-slate-500 text-sm max-w-sm mb-6">
          Algo salió mal al mostrar esta pantalla. Recarga la página; si el problema continúa,
          contacta soporte.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition"
        >
          Recargar página
        </button>
        {import.meta.env.DEV && this.state.error && (
          <pre className="mt-6 max-w-lg overflow-x-auto text-left text-[11px] text-slate-400 bg-slate-100 rounded-lg p-3">
            solo dev: {this.state.error.message}
          </pre>
        )}
      </div>
    )
  }
}
