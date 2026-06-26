import { useNavigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import Button from '../components/ui/Button'

export default function ForbiddenPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <ShieldOff className="h-8 w-8 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Acceso denegado</h1>
      <p className="text-slate-500 text-sm max-w-sm mb-6">
        No tienes permiso para ver esta sección. Si crees que es un error, contacta al administrador.
      </p>
      <Button variant="secondary" onClick={() => navigate('/')}>
        Volver al inicio
      </Button>
    </div>
  )
}
