import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MailCheck, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import { SendwaryWordmark } from '../components/BrandLogo'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

/**
 * Pantalla "Verifica tu cuenta": aterrizan aquí los usuarios autenticados con
 * el correo aún sin verificar. Permite reenviar el correo y cerrar sesión.
 */
export default function VerifyEmailPendingPage() {
  const { user, logout, refreshUser } = useAuth()
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Ya verificado (p. ej. verificó en otra pestaña): volver al flujo normal
  if (user?.emailVerified) {
    return <Navigate to="/" replace />
  }

  const resend = async () => {
    setSending(true)
    setFeedback(null)
    try {
      const res = await api.post<{ message?: string }>('/api/auth/resend-verification', {})
      setFeedback({
        type: 'success',
        text:
          (res as { message?: string })?.message ??
          'Si tu cuenta está pendiente de verificación, recibirás un nuevo correo en unos minutos.',
      })
    } catch (err) {
      setFeedback({ type: 'error', text: getUserFriendlyErrorMessage(err) })
    } finally {
      setSending(false)
    }
  }

  const checkAgain = async () => {
    await refreshUser()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-primary-600/5 border border-slate-100 p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
            <MailCheck className="h-8 w-8 text-primary-600" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Verifica tu cuenta</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-1">
            Te enviamos un correo con un botón para verificar tu cuenta y continuar con la
            activación de Sendwary.
          </p>
          {user?.email && (
            <p className="text-sm font-medium text-slate-700 mb-5">{user.email}</p>
          )}

          {feedback && (
            <div className="mb-4 text-left">
              <Alert variant={feedback.type === 'success' ? 'success' : 'danger'}>
                {feedback.text}
              </Alert>
            </div>
          )}

          <div className="space-y-3">
            <Button className="w-full" loading={sending} onClick={resend}>
              Reenviar correo de verificación
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={checkAgain}
            >
              Ya verifiqué mi cuenta
            </Button>
            <button
              onClick={logout}
              className="w-full inline-flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 py-2"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿No encuentras el correo? Revisa la carpeta de spam o promociones.
        </p>
      </div>
    </div>
  )
}
