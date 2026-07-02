import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  RetroGrid: malla retro en perspectiva con animación vertical infinita.     */
/* -------------------------------------------------------------------------- */

interface RetroGridProps {
  angle?: number
  cellSize?: number
  opacity?: number
  /** Colores del grid en modo claro / oscuro. */
  lightLineColor?: string
  darkLineColor?: string
}

const RetroGrid: React.FC<RetroGridProps> = ({
  angle = 65,
  cellSize = 60,
  opacity = 0.5,
  lightLineColor = 'rgba(120, 70, 230, 0.35)',
  darkLineColor = 'rgba(150, 110, 255, 0.30)',
}) => {
  const gridStyles = {
    '--grid-angle': `${angle}deg`,
    '--cell-size': `${cellSize}px`,
    '--opacity': opacity,
    '--light-line': lightLineColor,
    '--dark-line': darkLineColor,
  } as React.CSSProperties

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden [perspective:200px]',
        'opacity-[var(--opacity)]',
      )}
      style={gridStyles}
    >
      <div className="absolute inset-0 [transform:rotateX(var(--grid-angle))]">
        <div
          className={cn(
            'animate-grid',
            '[background-repeat:repeat] [background-size:var(--cell-size)_var(--cell-size)]',
            '[height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw]',
            '[background-image:linear-gradient(to_right,var(--light-line)_1px,transparent_0),linear-gradient(to_bottom,var(--light-line)_1px,transparent_0)]',
            'dark:[background-image:linear-gradient(to_right,var(--dark-line)_1px,transparent_0),linear-gradient(to_bottom,var(--dark-line)_1px,transparent_0)]',
          )}
        />
      </div>
      {/* Desvanecido inferior para fundir la malla con el fondo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent to-90% dark:from-neutral-950" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  HeroSection: bloque de héroe reutilizable.                                 */
/* -------------------------------------------------------------------------- */

interface HeroSectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Texto del badge superior. */
  badge?: string
  /** Título principal en dos partes: la base y el fragmento con gradiente. */
  title: {
    regular: string
    gradient: string
  }
  description: string
  cta?: {
    text: string
    href?: string
    onClick?: () => void
  }
  secondaryCta?: {
    text: string
    href?: string
    onClick?: () => void
  }
  /** Slot para el mockup/imagen inferior (dashboard, conversación, etc.). */
  mockup?: React.ReactNode
  gridOptions?: RetroGridProps
}

const HeroSection = React.forwardRef<HTMLElement, HeroSectionProps>(
  (
    { className, badge, title, description, cta, secondaryCta, mockup, gridOptions, ...props },
    ref,
  ) => {
    return (
      <section
        ref={ref}
        className={cn('relative overflow-hidden bg-white dark:bg-neutral-950', className)}
        {...props}
      >
        {/* Halo morado superior */}
        <div className="absolute left-1/2 top-0 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/20 blur-[140px] dark:bg-brand-600/25" />

        <RetroGrid {...gridOptions} />

        <div className="relative z-10 mx-auto max-w-screen-xl px-5 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center pb-10 pt-24 text-center sm:pt-28 md:pt-32">
            {badge && (
              <span className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-700 backdrop-blur-sm dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-200">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
                </span>
                {badge}
                <ChevronRight className="h-3.5 w-3.5 opacity-70" />
              </span>
            )}

            <h1 className="animate-fade-up text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 [animation-delay:80ms] sm:text-5xl md:text-6xl dark:text-white">
              {title.regular}{' '}
              <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
                {title.gradient}
              </span>
            </h1>

            <p className="animate-fade-up mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 [animation-delay:160ms] sm:text-lg dark:text-neutral-300">
              {description}
            </p>

            {(cta || secondaryCta) && (
              <div className="animate-fade-up mt-9 flex w-full flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
                {cta && (
                  <a
                    href={cta.href ?? '#'}
                    onClick={cta.onClick}
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto dark:focus-visible:ring-offset-neutral-950"
                  >
                    {cta.text}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                )}
                {secondaryCta && (
                  <a
                    href={secondaryCta.href ?? '#'}
                    onClick={secondaryCta.onClick}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white/60 px-6 py-3 text-sm font-semibold text-neutral-800 backdrop-blur-sm transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:hover:bg-white/10 dark:focus-visible:ring-offset-neutral-950"
                  >
                    {secondaryCta.text}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Mockup / imagen inferior */}
          {mockup && (
            <div className="animate-fade-up relative mx-auto max-w-5xl pb-24 [animation-delay:320ms]">
              <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-gradient-to-b from-brand-500/10 to-transparent blur-2xl" />
              {mockup}
            </div>
          )}
        </div>
      </section>
    )
  },
)
HeroSection.displayName = 'HeroSection'

export { HeroSection }
