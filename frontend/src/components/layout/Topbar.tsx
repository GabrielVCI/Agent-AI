import { Menu, LogOut, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { SendwaryWordmark } from '../BrandLogo'
import LogoutConfirmModal from '../auth/LogoutConfirmModal'

interface Props {
  onMenuClick: () => void
  sectionTitle: string
}

export default function Topbar({ onMenuClick, sectionTitle }: Props) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* En mobile el sidebar está oculto: la marca vive en el topbar */}
      <div className="lg:hidden">
        <SendwaryWordmark markClassName="h-7 w-7" textClassName="text-base" />
      </div>
      <h1 className="text-base font-semibold text-slate-900 hidden lg:block">{sectionTitle}</h1>

      <div className="ml-auto flex items-center gap-2" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary-700">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-slate-900 leading-tight">{user?.name}</p>
              <p className="text-xs text-slate-500 leading-tight">{user?.role}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-lg z-50 py-1">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); setLogoutConfirmOpen(true) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      <LogoutConfirmModal open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </header>
  )
}
