import { useState, FormEvent, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import AuthLayout from '../components/auth/AuthLayout'
import GoogleButton, { AuthDivider, authInputClass } from '../components/auth/GoogleButton'

/** Requisitos de contraseña fuerte (mismos que valida el backend). */
const passwordRules = [
  { label: 'Mínimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Una mayúscula', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Una minúscula', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Un número', test: (v: string) => /[0-9]/.test(v) },
  { label: 'Un símbolo', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
]

export default function RegisterPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // El backend crea sesión al registrarse: "/" manda al onboarding (sin tenant)
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const passwordChecks = useMemo(
    () => passwordRules.map(r => ({ ...r, ok: r.test(password) })),
    [password]
  )
  const passwordStrong = passwordChecks.every(c => c.ok)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!passwordStrong) {
      setError('La contraseña no cumple los requisitos de seguridad')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        name: firstName,
        lastName,
        email,
        password,
        confirmPassword,
      })
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'No se pudo crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-slate-900">Crea tu cuenta</h1>
      <p className="text-sm text-slate-500 mt-1.5 mb-6">
        Empieza gratis en menos de un minuto. Sin tarjeta de crédito.
      </p>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      <GoogleButton label="Registrarme con Google" />
      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              minLength={2}
              autoComplete="given-name"
              placeholder="Ana"
              className={authInputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Apellido</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
              minLength={2}
              autoComplete="family-name"
              placeholder="Pérez"
              className={authInputClass}
            />
          </div>
        </div>

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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
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
          {password.length > 0 && (
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
              {passwordChecks.map(c => (
                <li
                  key={c.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    c.ok ? 'text-green-600' : 'text-slate-400'
                  }`}
                >
                  {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {c.label}
                </li>
              ))}
            </ul>
          )}
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
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <p className="mt-1 text-xs text-red-600">Las contraseñas no coinciden</p>
          )}
        </div>

        <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
          Crear cuenta
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          Iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
