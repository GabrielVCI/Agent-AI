import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  industryCategories,
  INDUSTRIES_INDEX_HREF,
  type IndustryCategory,
} from '@/data/industries'

/**
 * Mega menú "Industrias" para el navbar de escritorio.
 *
 * - Trigger accesible (aria-haspopup / aria-expanded).
 * - Se abre por hover o click; se cierra al salir del menú, con clic fuera
 *   o con la tecla Escape (no depende solo del hover para teclado).
 * - El panel se ancla al header (posición absoluta) y se centra dentro del
 *   ancho del navbar para no provocar overflow horizontal.
 *
 * El trigger y el panel viven dentro del mismo contenedor en el DOM, por lo
 * que el hover se mantiene aunque el panel se dibuje más abajo visualmente.
 */
export function IndustryMegaMenu() {
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string>(industryCategories[0].id)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active: IndustryCategory =
    industryCategories.find((c) => c.id === activeId) ?? industryCategories[0]

  const clearTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const openMenu = () => {
    clearTimer()
    setOpen(true)
  }

  // Cierre diferido para permitir mover el cursor del trigger al panel.
  const scheduleClose = () => {
    clearTimer()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  const closeNow = () => {
    clearTimer()
    setOpen(false)
  }

  // Cerrar con clic fuera y con Escape.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeNow()
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => clearTimer(), [])

  return (
    <div
      ref={wrapperRef}
      className="static"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? closeNow() : openMenu())}
        className={cn(
          'inline-flex items-center gap-1 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded dark:focus-visible:ring-offset-neutral-950',
          open
            ? 'text-neutral-900 dark:text-white'
            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white',
        )}
      >
        Industrias
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {/* Panel: anclado al header (sticky) y centrado dentro del navbar. */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 px-5 sm:px-6">
          <div className="mx-auto max-w-screen-xl">
            <div className="mx-auto mt-2 w-full max-w-4xl animate-fade-up overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl shadow-black/40 ring-1 ring-black/5">
              <div className="grid grid-cols-1 gap-0 md:grid-cols-[15rem_1fr]">
                {/* Columna izquierda: categorías */}
                <ul className="border-white/10 bg-white/[0.02] p-2 md:border-r">
                  {industryCategories.map((cat) => {
                    const Icon = cat.icon
                    const isActive = cat.id === active.id
                    return (
                      <li key={cat.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveId(cat.id)}
                          onFocus={() => setActiveId(cat.id)}
                          aria-current={isActive}
                          className={cn(
                            'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                            isActive
                              ? 'bg-brand-500/15 text-white'
                              : 'text-neutral-300 hover:bg-white/5 hover:text-white',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                              isActive
                                ? 'border-brand-400/30 bg-brand-400/15 text-brand-200'
                                : 'border-white/10 bg-white/5 text-neutral-400 group-hover:text-brand-200',
                            )}
                          >
                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <span className="flex-1">{cat.title}</span>
                          <ArrowRight
                            className={cn(
                              'h-4 w-4 shrink-0 transition-all',
                              isActive
                                ? 'translate-x-0 text-brand-300 opacity-100'
                                : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60',
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {/* Panel derecho: subcategorías + descripción + CTA */}
                <div className="flex flex-col p-6">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-white">{active.title}</h3>
                    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-neutral-400">
                      {active.blurb}
                    </p>

                    <ul className="mt-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {active.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            to={item.href}
                            onClick={closeNow}
                            className="group flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-neutral-200 transition-colors hover:border-brand-400/40 hover:bg-brand-500/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                          >
                            <span>{item.label}</span>
                            <ArrowRight
                              className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-brand-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Bloque destacado: ¿No ves tu industria? */}
                  <div className="mt-6 rounded-xl border border-brand-400/20 bg-brand-500/[0.07] p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-400/25 bg-brand-400/10 text-brand-200">
                        <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                          ¿No ves tu industria?
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                          Sendwary puede adaptarse a negocios que atienden clientes por WhatsApp,
                          toman solicitudes, manejan citas o generan cotizaciones.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <Link
                        to="/contacto?motivo=demo"
                        onClick={closeNow}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        Consultar mi caso
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                      <Link
                        to={INDUSTRIES_INDEX_HREF}
                        onClick={closeNow}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-200 transition-colors hover:text-white"
                      >
                        Ver todas las industrias
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
