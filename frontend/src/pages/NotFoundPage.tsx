import { useNavigate } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import Button from '../components/ui/Button'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-200">
        <SearchX className="h-8 w-8 text-slate-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">No encontramos esta página</h1>
      <p className="text-slate-500 text-sm max-w-sm mb-6">
        La dirección que buscas no existe o fue movida. Revisa el enlace o vuelve al inicio.
      </p>
      <Button variant="secondary" onClick={() => navigate('/')}>
        Volver al inicio
      </Button>
      {import.meta.env.DEV && (
        <p className="mt-6 text-[11px] text-slate-400">detalle técnico (solo dev): 404 · {window.location.pathname}</p>
      )}
    </div>
  )
}
