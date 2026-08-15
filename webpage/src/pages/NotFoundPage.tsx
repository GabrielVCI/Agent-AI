import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge } from '@/components/ui/page-sections'
import { SEOHead } from '@/components/seo/SEOHead'

const helpfulLinks = [
  { label: 'Ir a inicio', to: '/', primary: true },
  { label: 'Ver precios', to: '/precios' },
  { label: 'Ver industrias', to: '/industrias' },
  { label: 'Contactar a Sendwary', to: '/contacto' },
]

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Página no encontrada | Sendwary"
        description="La página que buscas no existe o cambió de dirección. Vuelve a inicio o explora precios, industrias y contacto de Sendwary."
        path="/404"
        robots="noindex, follow"
      />
      <Navbar />
      <main>
        <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />

          <div className="relative mx-auto flex max-w-screen-xl flex-col items-center px-5 py-24 text-center sm:px-6 sm:py-32">
            <SectionBadge>
              <Compass className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              Error 404
            </SectionBadge>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl dark:text-white">
              Esta dirección no{' '}
              <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
                existe
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
              La página que buscas no está disponible: puede que la URL esté mal escrita o que el
              contenido se haya movido. Aquí tienes algunos puntos de partida.
            </p>

            <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              {helpfulLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={
                    link.primary
                      ? 'group inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'
                      : 'group inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-brand-400 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-white/15 dark:text-neutral-200 dark:hover:border-brand-400/60 dark:hover:text-white'
                  }
                >
                  {link.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
