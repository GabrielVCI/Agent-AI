const API_BASE = import.meta.env.VITE_API_URL || ''

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

/**
 * Redirección top-level al flujo OAuth del backend (el backend intercambia el
 * código y crea la sesión httpOnly; el frontend nunca ve tokens).
 */
export default function GoogleButton({ label = 'Continuar con Google' }: { label?: string }) {
  return (
    <a
      href={`${API_BASE}/api/auth/google`}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
    >
      <GoogleIcon />
      {label}
    </a>
  )
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="h-px bg-slate-200 flex-1" />
      <span className="text-xs text-slate-400">o con tu correo</span>
      <div className="h-px bg-slate-200 flex-1" />
    </div>
  )
}

export const authInputClass =
  'w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-slate-400 transition'
