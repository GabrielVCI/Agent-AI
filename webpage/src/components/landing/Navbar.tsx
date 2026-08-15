import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Menu, X } from 'lucide-react'
import { IndustryMegaMenu } from '@/components/layout/industry-mega-menu'
import { industryCategories, INDUSTRIES_INDEX_HREF } from '@/data/industries'
import { cn } from '@/lib/utils'

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
            src="/logo-name.png"
            alt="Sendwary"
            className="h-12 w-auto object-contain sm:h-26 lg:h-30"
          />
        </Link>

        {/* Enlaces desktop */}
        <ul className="hidden items-center gap-8 md:flex">
          <li>
            <Link
              to="/como-funciona"
              className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            >
              Cómo funciona
            </Link>
          </li>
          <li>
            <IndustryMegaMenu />
          </li>
          {NAV_LINKS.filter((l) => l.to !== '/' && l.to !== '/como-funciona').map((link) => (
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
            {NAV_LINKS.slice(0, 2).map((link) => (
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

            {/* Industrias (acordeón anidado) */}
            <li>
              <MobileIndustries onNavigate={() => setOpen(false)} />
            </li>

            {NAV_LINKS.slice(2).map((link) => (
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

/* -------------------------------------------------------------------------- */
/*  Industrias en móvil: acordeón anidado (categoría → industrias).            */
/* -------------------------------------------------------------------------- */

function MobileIndustries({ onNavigate }: { onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [openCat, setOpenCat] = useState<string | null>(null)

  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:text-neutral-200 dark:hover:text-brand-200"
      >
        Industrias
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="mt-1 space-y-0.5 border-l border-neutral-200 pl-3 dark:border-white/10">
          {industryCategories.map((cat) => {
            const Icon = cat.icon
            const isOpen = openCat === cat.id
            return (
              <div key={cat.id}>
                <button
                  type="button"
                  onClick={() => setOpenCat((v) => (v === cat.id ? null : cat.id))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:text-neutral-300 dark:hover:text-brand-200"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" strokeWidth={1.75} />
                    {cat.title}
                  </span>
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <ul className="mb-1 ml-6 space-y-0.5 border-l border-neutral-200 pl-3 dark:border-white/10">
                    {cat.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          to={item.href}
                          onClick={onNavigate}
                          className="block rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:text-neutral-400 dark:hover:text-brand-200"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          <Link
            to={INDUSTRIES_INDEX_HREF}
            onClick={onNavigate}
            className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-500/10 dark:text-brand-300"
          >
            Ver todas las industrias →
          </Link>
        </div>
      )}
    </div>
  )
}
