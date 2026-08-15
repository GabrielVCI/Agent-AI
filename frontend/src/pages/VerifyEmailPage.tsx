import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import api from '../lib/api'
import { getUserFriendlyErrorMessage } from '../lib/errors'
import { SendwaryWordmark } from '../components/BrandLogo'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'

/**
 * Destino del botón "Verificar Cuenta" del correo de bienvenida
 * (/verify-email?token=...). Página pública: funciona con o sin sesión.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('')
  const requested = useRef(false)

  useEffect(() => {
    // Guard contra doble ejecución (StrictMode): el token es de un solo uso
    if (requested.current) return
    requested.current = true

    if (!token) {
      setState('error')
      setMessage('El enlace de verificación no es válido o ya expiró.')
      return
    }

    api
      .post<{ message?: string }>('/api/auth/verify-email', { token })
      .then(() => {
        setState('success')
        setMessage('Tu cuenta fue verificada. Te enviamos un correo con los siguientes pasos de tu implementación.')
      })
      .catch(err => {
        setState('error')
        setMessage(getUserFriendlyErrorMessage(err))
      })
  }, [token])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="mb-8">
        <SendwaryWordmark markClassName="h-11 w-11" textClassName="text-2xl" />
      </div>

      {state === 'verifying' && (
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-slate-500 text-sm">Verificando tu cuenta…</p>
        </div>
      )}

      {state === 'success' && (
        <>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">¡Cuenta verificada!</h1>
          <p className="text-slate-500 text-sm max-w-md mb-6">{message}</p>
          <Link to="/">
            <Button>Ir a Sendwary</Button>
          </Link>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">No pudimos verificar tu cuenta</h1>
          <p className="text-slate-500 text-sm max-w-md mb-6">
            {message || 'El enlace de verificación no es válido o ya expiró.'}
          </p>
          <div className="flex gap-3">
            <Link to="/verificar-correo">
              <Button variant="secondary">Reenviar correo</Button>
            </Link>
            <Link to="/login">
              <Button>Iniciar sesión</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
