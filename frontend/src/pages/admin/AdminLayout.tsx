import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Users, XCircle, LayoutDashboard, LifeBuoy } from 'lucide-react'

const adminNav = [
  { path: '/admin', label: 'Resumen', icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { path: '/admin/clientes', label: 'Clientes', icon: <Users className="h-4 w-4" /> },
  { path: '/admin/solicitudes-cancelacion', label: 'Cancelaciones', icon: <XCircle className="h-4 w-4" /> },
  { path: '/admin/soporte', label: 'Soporte', icon: <LifeBuoy className="h-4 w-4" /> },
]

export default function AdminLayout() {
  const location = useLocation()

  return (
    <div className="flex h-full">
      <div className="w-48 border-r border-slate-200 bg-white flex-shrink-0">
        <div className="px-3 py-4">
          <p className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Admin</p>
          <nav className="space-y-0.5">
            {adminNav.map(item => {
              const active = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
