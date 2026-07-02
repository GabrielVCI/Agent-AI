import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

/**
 * Enlaces de navegación (rutas internas SPA con React Router).
 */
const NAV_LINKS = [
  { label: 'Inicio', to: '/' },
  { label: 'Cómo funciona', to: '/como-funciona' },
  { label: 'Integraciones', to: '/integraciones' },
  { label: 'Precios', to: '/precios' },
  { label: 'Contacto', to: '/contacto' },
]

export function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/60 bg-white/70 backdrop-blur-md dark:border-white/5 dark:bg-neutral-950/70">
      <nav className="mx-auto flex h-20 max-w-screen-xl items-center justify-between px-5 sm:px-6 lg:h-24">
        <Link to="/" className="flex items-center" aria-label="Sendwary — inicio">
          <img
            src="/logo.png"
            alt="Sendwary"
            className="h-14 w-auto object-contain sm:h-16 lg:h-20"
          />
        </Link>

        {/* Enlaces desktop */}
        <ul className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.filter((l) => l.to !== '/').map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          {/* Iniciar sesión (secundario, outline) */}
          <a
            href="/login"
            className="hidden rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-brand-400 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:inline-flex dark:border-white/15 dark:text-neutral-200 dark:hover:border-brand-400/60 dark:hover:text-white"
          >
            Iniciar sesión
          </a>

          {/* Solicitar demo (primario) */}
          <Link
            to="/contacto?motivo=demo"
            className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition-colors hover:bg-brand-500 sm:inline-flex"
          >
            Solicitar demo
          </Link>

          {/* Botón menú móvil */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:hidden dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/5"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Panel móvil */}
      {open && (
        <div
          id="mobile-menu"
          className="border-t border-neutral-200/60 bg-white/95 backdrop-blur-md md:hidden dark:border-white/5 dark:bg-neutral-950/95"
        >
          <ul className="mx-auto max-w-screen-xl space-y-1 px-5 py-4 sm:px-6">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:text-neutral-200 dark:hover:text-brand-200"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <a
                href="/login"
                onClick={() => setOpen(false)}
                className="block rounded-lg border border-neutral-300 px-3 py-2.5 text-center text-sm font-medium text-neutral-700 transition-colors hover:border-brand-400 hover:text-brand-700 dark:border-white/15 dark:text-neutral-200 dark:hover:text-white"
              >
                Iniciar sesión
              </a>
            </li>
            <li>
              <Link
                to="/contacto?motivo=demo"
                onClick={() => setOpen(false)}
                className="block rounded-lg bg-brand-600 px-3 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-500"
              >
                Solicitar demo
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}
