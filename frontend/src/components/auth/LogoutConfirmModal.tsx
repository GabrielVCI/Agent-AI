import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

/**
 * Confirmación de cierre de sesión (Parte H): evita logouts accidentales
 * desde el sidebar o el topbar. Al confirmar llama al endpoint de logout,
 * AuthContext limpia el estado y ProtectedRoute redirige a /login.
 */
export default function LogoutConfirmModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { logout } = useAuth()
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await logout()
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cerrar sesión" size="sm">
      <p className="text-sm text-slate-600">
        ¿Seguro que quieres cerrar sesión? Tendrás que volver a iniciar sesión para acceder al
        panel.
      </p>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={handleConfirm} loading={busy} icon={<LogOut className="h-4 w-4" />}>
          Cerrar sesión
        </Button>
      </div>
    </Modal>
  )
}
