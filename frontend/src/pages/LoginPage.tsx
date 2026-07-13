import { useState, FormEvent, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import AuthLayout from '../components/auth/AuthLayout'
import GoogleButton, { AuthDivider, authInputClass } from '../components/auth/GoogleButton'

export default function LoginPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  // Los errores de Google OAuth llegan como ?error= desde el backend
  const [error, setError] = useState(searchParams.get('error') || '')
  const [info] = useState(searchParams.get('info') || '')

  useEffect(() => {
    // "/" enruta según rol y tenant (admin, onboarding o dashboard)
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')
    try {
      await api.post('/api/auth/login', { email, password })
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-slate-900">Bienvenido a Sendwary</h1>
      <p className="text-sm text-slate-500 mt-1.5 mb-6">
        Automatiza la atención, ventas y citas de tu negocio con agentes IA para WhatsApp.
      </p>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {info && (
        <Alert variant="info" className="mb-4">
          {info}
        </Alert>
      )}
      <GoogleButton />
      <AuthDivider />

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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-slate-700">Contraseña</label>
            <Link
              to="/forgot-password"
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Olvidé mi contraseña
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
        </div>

        <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
          Iniciar sesión
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
          Crear cuenta
        </Link>
      </p>
    </AuthLayout>
  )
}
