import { useEffect, useState, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import api from '../lib/api'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import AuthLayout from '../components/auth/AuthLayout'
import { authInputClass } from '../components/auth/GoogleButton'

/**
 * Nueva contraseña a partir del link /reset-password?token=...
 * Valida el token al cargar; si es inválido/expirado ofrece pedir otro.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [checking, setChecking] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setChecking(false)
      setTokenValid(false)
      return
    }
    api
      .get<{ valid: boolean }>('/api/auth/reset-password/validate', { token })
      .then(r => setTokenValid(Boolean(r?.valid)))
      .catch(() => setTokenValid(false))
      .finally(() => setChecking(false))
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { token, password, confirmPassword })
      setDone(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo actualizar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-slate-900">Nueva contraseña</h1>
      <p className="text-sm text-slate-500 mt-1.5 mb-6">
        Elige una contraseña segura para tu cuenta de Sendwary.
      </p>

      {checking ? (
        <div className="py-10 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : done ? (
        <Alert variant="success">
          <span className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Contraseña actualizada. Te llevamos a iniciar sesión…
          </span>
        </Alert>
      ) : !tokenValid ? (
        <div className="space-y-5">
          <Alert variant="danger">
            El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.
          </Alert>
          <Link
            to="/forgot-password"
            className="inline-block text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Solicitar un nuevo enlace
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="••••••••"
                className={`${authInputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Mostrar contraseña"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Confirmar contraseña
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className={authInputClass}
            />
          </div>

          <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
