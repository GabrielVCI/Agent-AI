import { useState } from 'react'
import { useLocation, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const sectionTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/conversations': 'Conversaciones',
  '/agents': 'Agentes',
  '/settings': 'Configuración',
  '/company': 'Empresa',
  '/account': 'Cuenta',
  '/admin': 'Administración',
}

function getSectionTitle(pathname: string): string {
  const match = Object.keys(sectionTitles)
    .sort((a, b) => b.length - a.length)
    .find(k => pathname.startsWith(k))
  return match ? sectionTitles[match] : 'Panel'
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = getSectionTitle(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(v => !v)} sectionTitle={title} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
