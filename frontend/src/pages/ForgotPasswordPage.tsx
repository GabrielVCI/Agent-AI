import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import api from '../lib/api'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import AuthLayout from '../components/auth/AuthLayout'
import { authInputClass } from '../components/auth/GoogleButton'

/**
 * Solicitud de recuperación de contraseña. El backend responde SIEMPRE
 * genérico (no revela si el correo existe).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo procesar la solicitud. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-slate-900">Recuperar contraseña</h1>
      <p className="text-sm text-slate-500 mt-1.5 mb-6">
        Ingresa el correo de tu cuenta y te enviaremos instrucciones para restablecerla.
      </p>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {sent ? (
        <div className="space-y-5">
          <Alert variant="success">
            <span className="flex items-start gap-2">
              <MailCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
              Si el correo existe, enviaremos instrucciones para restablecer tu contraseña.
              Revisa tu bandeja de entrada y la carpeta de spam.
            </span>
          </Alert>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a iniciar sesión
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="correo@empresa.com"
              className={authInputClass}
            />
          </div>

          <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
            Enviar instrucciones
          </Button>

          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
