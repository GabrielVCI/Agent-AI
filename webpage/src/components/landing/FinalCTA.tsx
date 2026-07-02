import * as React from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*  FinalCTA: cierre de conversión del homepage.                               */
/* -------------------------------------------------------------------------- */

export const FinalCTA = React.forwardRef<HTMLElement>((_, ref) => {
  return (
    <section
      ref={ref}
      id="demo"
      className="relative overflow-hidden bg-white py-20 sm:py-28 dark:bg-neutral-950"
    >
      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        {/* Tarjeta premium centrada */}
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-brand-500/20 bg-neutral-950 px-6 py-16 text-center shadow-2xl shadow-brand-900/30 sm:px-12 sm:py-20 dark:border-white/10">
          {/* Gradiente radial morado sutil */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.28),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-600/15 blur-[130px]" />
          {/* Malla sutil de puntos */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,rgba(167,139,250,0.5)_1px,transparent_1px)] [background-size:30px_30px]" />

          <div className="relative mx-auto max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Listo para vender mejor por WhatsApp
            </span>

            <h2 className="mt-6 text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl md:text-[2.75rem]">
              Convierte WhatsApp en un canal organizado de{' '}
              <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                atención, ventas y seguimiento
              </span>
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Automatiza respuestas, procesa solicitudes, prepara cotizaciones, maneja citas y
              permite intervención humana cuando el cliente necesita atención personalizada.
            </p>

            {/* Botones */}
            <div className="mx-auto mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              <a
                href="/contacto?motivo=demo"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
              >
                Solicitar demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="/precios"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-neutral-100 backdrop-blur-sm transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
              >
                Ver costos y precios
              </a>
            </div>

            <p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-neutral-500">
              Los planes varían según agentes, usuarios, mensajes, catálogo, citas e integraciones
              necesarias.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
})

FinalCTA.displayName = 'FinalCTA'
