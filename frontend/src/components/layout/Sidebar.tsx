import { useEffect, useState, ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Bot, Settings, Building2, CreditCard,
  ShieldCheck, X, Package, CalendarDays, GraduationCap, LogOut,
  ChevronsLeft, ChevronsRight, Users, ClipboardX, Phone, Plug, LifeBuoy, Zap, Repeat,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { listConversations } from '../../services/conversationsApi'
import { SendwaryLogo, SendwaryMark } from '../BrandLogo'
import LogoutConfirmModal from '../auth/LogoutConfirmModal'
import api from '../../lib/api'

const COLLAPSE_KEY = 'sendwary.sidebar.collapsed' // preferencia de UI, no tokens

interface NavItem {
  label: string
  path: string
  icon: ReactNode
  /** Coincidencia exacta de query (para /settings vs /settings?tab=training) */
  tabParam?: string
  badge?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: Props) {
  const { user } = useAuth()
  const location = useLocation()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1'
  )
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const toggleCollapsed = () => {
    setCollapsed(v => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1')
      return !v
    })
  }

  // Nombre del workspace, plan y conversaciones esperando humano.
  // Todo es decorativo: cualquier fallo se ignora y el sidebar sigue funcionando.
  useEffect(() => {
    if (!user?.tenantId) return
    api
      .get<{ name?: string }>('/api/company/me')
      .then(c => setWorkspaceName(typeof c?.name === 'string' ? c.name : null))
      .catch(() => setWorkspaceName(null))
    api
      .get<Record<string, any>>('/api/account/plan')
      .then(p => {
        const name = p?.plan?.name ?? p?.name
        setPlanName(typeof name === 'string' ? name : null)
      })
      .catch(() => setPlanName(null))
    listConversations({ pendingHuman: true })
      .then(list => setPendingCount(list.length))
      .catch(() => setPendingCount(0))
  }, [user?.tenantId])

  const tenantGroups: NavGroup[] = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
        {
          label: 'Conversaciones',
          path: '/conversations',
          icon: <MessageSquare className="h-5 w-5" />,
          badge: pendingCount,
        },
        { label: 'Clientes', path: '/clientes', icon: <Users className="h-5 w-5" /> },
        { label: 'Citas', path: '/appointments', icon: <CalendarDays className="h-5 w-5" /> },
        { label: 'Mantenimiento', path: '/mantenimiento', icon: <Repeat className="h-5 w-5" /> },
        { label: 'Llamadas', path: '/calls', icon: <Phone className="h-5 w-5" /> },
      ],
    },
    {
      title: 'Gestión',
      items: [
        { label: 'Agentes', path: '/agents', icon: <Bot className="h-5 w-5" /> },
        { label: 'Catálogo', path: '/catalog', icon: <Package className="h-5 w-5" /> },
        {
          label: 'Automatizaciones',
          path: '/automatizaciones',
          icon: <Zap className="h-5 w-5" />,
        },
        {
          label: 'Entrenamiento',
          path: '/settings?tab=training',
          icon: <GraduationCap className="h-5 w-5" />,
          tabParam: 'training',
        },
        { label: 'Configuración', path: '/settings', icon: <Settings className="h-5 w-5" /> },
      ],
    },
    {
      title: 'Organización',
      items: [
        { label: 'Empresa', path: '/company', icon: <Building2 className="h-5 w-5" /> },
        { label: 'Herramientas externas', path: '/integrations', icon: <Plug className="h-5 w-5" /> },
        { label: 'Cuenta y plan', path: '/account', icon: <CreditCard className="h-5 w-5" /> },
      ],
    },
  ]

  const adminGroups: NavGroup[] = [
    {
      title: 'Administración',
      items: [
        { label: 'Resumen', path: '/admin', icon: <ShieldCheck className="h-5 w-5" /> },
        { label: 'Clientes', path: '/admin/clientes', icon: <Users className="h-5 w-5" /> },
        {
          label: 'Cancelaciones',
          path: '/admin/solicitudes-cancelacion',
          icon: <ClipboardX className="h-5 w-5" />,
        },
        { label: 'Soporte', path: '/admin/soporte', icon: <LifeBuoy className="h-5 w-5" /> },
      ],
    },
  ]

  // SUPER_ADMIN solo ve navegación admin (las pantallas tenant lo redirigen);
  // los roles tenant nunca ven la sección admin.
  const groups = isSuperAdmin ? adminGroups : tenantGroups

  const isItemActive = (item: NavItem): boolean => {
    const [basePath] = item.path.split('?')
    const params = new URLSearchParams(location.search)
    const currentTab = params.get('tab')

    if (basePath === '/settings') {
      if (!location.pathname.startsWith('/settings')) return false
      return item.tabParam ? currentTab === item.tabParam : currentTab !== 'training'
    }
    if (basePath === '/admin') {
      return location.pathname === '/admin'
    }
    if (basePath === '/dashboard') {
      return location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(basePath)
  }

  const renderItem = (item: NavItem) => {
    const active = isItemActive(item)
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onClose}
        title={collapsed ? item.label : undefined}
        className={`relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
        } ${
          active
            ? 'bg-primary-600/20 text-primary-200'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
        }`}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
        {(item.badge ?? 0) > 0 && (
          <span
            className={`${
              collapsed
                ? 'absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400'
                : 'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/90 px-1.5 text-xs font-semibold text-white'
            }`}
          >
            {!collapsed && (item.badge! > 9 ? '9+' : item.badge)}
          </span>
        )}
      </NavLink>
    )
  }

  const sidebarContent = (isCollapsed: boolean) => (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300">
      {/* Logo */}
      <div
        className={`flex items-center border-b border-white/10 ${
          isCollapsed ? 'justify-center px-2 py-4' : 'justify-between px-4 py-4'
        }`}
      >
        {isCollapsed ? (
          <SendwaryMark className="h-9 w-9" />
        ) : (
          <SendwaryLogo className="h-8" />
        )}
        {!isCollapsed && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded text-slate-500 hover:text-slate-300"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Workspace + plan */}
      {!isSuperAdmin && !isCollapsed && (
        <div className="mx-3 mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
          <p className="text-xs text-slate-500">Espacio de trabajo</p>
          <p className="text-sm font-medium text-slate-100 truncate">
            {workspaceName ?? user?.name ?? '—'}
          </p>
          {planName && (
            <span className="mt-1.5 inline-flex items-center rounded-full bg-primary-600/25 px-2 py-0.5 text-xs font-medium text-primary-300">
              Plan {planName}
            </span>
          )}
        </div>
      )}

      {/* Navegación */}
      <nav className={`flex-1 overflow-y-auto py-4 space-y-5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {groups.map(group => (
          <div key={group.title}>
            {!isCollapsed && (
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">{group.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>

      {/* Usuario + cerrar sesión */}
      <div className={`border-t border-white/10 py-3 ${isCollapsed ? 'px-2' : 'px-3'}`}>
        <div className={`flex items-center gap-3 ${isCollapsed ? 'flex-col' : 'px-2'}`}>
          <div className="h-8 w-8 rounded-full bg-primary-600/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary-200">
              {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </span>
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.role}</p>
            </div>
          )}
          <button
            onClick={() => setLogoutConfirmOpen(true)}
            title="Cerrar sesión"
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        {/* Toggle de colapso (solo desktop) */}
        <button
          onClick={toggleCollapsed}
          className={`hidden lg:flex items-center gap-2 mt-2 w-full rounded-lg py-1.5 text-xs text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors ${
            isCollapsed ? 'justify-center' : 'px-3'
          }`}
        >
          {isCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              Colapsar
            </>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Overlay mobile */}
      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />}

      {/* Sidebar desktop (colapsable) */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 h-full transition-all duration-200 ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
        {sidebarContent(collapsed)}
      </aside>

      {/* Drawer mobile (siempre expandido) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-72 max-w-[85vw] shadow-2xl transition-transform duration-200 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent(false)}
      </aside>

      <LogoutConfirmModal open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </>
  )
}
