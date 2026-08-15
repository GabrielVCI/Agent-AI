import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge, IconBadge, CtaButtons } from '@/components/ui/page-sections'
import { industryCategories } from '@/data/industries'
import { SEOHead } from '@/components/seo/SEOHead'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { buildBreadcrumbJsonLd } from '@/lib/seo'

/* ========================================================================== */
/*  Hero                                                                       */
/* ========================================================================== */

function PageHero() {
  return (
    <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />

      <div className="relative mx-auto max-w-screen-xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <SectionBadge>Industrias</SectionBadge>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl dark:text-white">
            Agentes IA para negocios que{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              atienden por WhatsApp
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Sendwary puede adaptarse a distintos tipos de negocios que reciben mensajes, citas,
            cotizaciones o solicitudes por WhatsApp.
          </p>
          <div className="mt-9 flex justify-center">
            <CtaButtons primaryLabel="Solicitar demo" primaryHref="/contacto?motivo=demo" />
          </div>
          <p className="mx-auto mt-6 max-w-lg text-xs leading-relaxed text-neutral-500">
            Las páginas individuales de cada industria estarán disponibles próximamente.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */
/*  Grid de industrias                                                         */
/* ========================================================================== */

function IndustriesGrid() {
  return (
    <section className="relative border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Casos por industria</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Un agente IA que se adapta a{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              tu tipo de negocio
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
            Explora las industrias donde Sendwary ayuda a automatizar atención, ventas y seguimiento.
            Las páginas individuales están en camino.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {industryCategories.map((cat) => {
            const Icon = cat.icon
            return (
              <div
                key={cat.id}
                className="group flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40"
              >
                <div className="mb-5">
                  <IconBadge icon={Icon} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                  {cat.title}
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {cat.blurb}
                </p>
                <ul className="mt-auto space-y-1.5 border-t border-neutral-200/70 pt-4 dark:border-white/10">
                  {cat.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        className="group/link flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:text-neutral-300 dark:hover:text-brand-200"
                      >
                        {item.label}
                        <ArrowRight
                          className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-brand-400 opacity-0 transition-all group-hover/link:translate-x-0 group-hover/link:opacity-100"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Bloque destacado: ¿No ves tu industria? */}
          <div className="flex flex-col justify-center rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-6 text-left dark:border-brand-400/25 dark:bg-brand-400/[0.05]">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
              <Sparkles className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
              ¿No ves tu industria?
            </h3>
            <p className="mb-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Sendwary puede adaptarse a negocios que atienden clientes por WhatsApp, toman
              solicitudes, manejan citas o generan cotizaciones.
            </p>
            <Link
              to="/contacto?motivo=demo"
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Consultar mi caso
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */
/*  CTA final                                                                  */
/* ========================================================================== */

function PageCTA() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-brand-500/20 bg-neutral-950 px-6 py-16 text-center shadow-2xl shadow-brand-900/30 sm:px-12 sm:py-20 dark:border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.28),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-600/15 blur-[130px]" />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl">
              ¿Quieres validar si aplica para{' '}
              <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                tu negocio?
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Cuéntanos cómo atiendes a tus clientes por WhatsApp y te mostramos cómo Sendwary puede
              ayudarte a automatizar respuestas, citas, cotizaciones y seguimiento.
            </p>
            <div className="mt-9 flex justify-center">
              <CtaButtons primaryLabel="Solicitar demo" primaryHref="/contacto?motivo=demo" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ========================================================================== */
/*  Página                                                                     */
/* ========================================================================== */

const breadcrumbItems = [
  { name: 'Inicio', path: '/' },
  { name: 'Industrias', path: '/industrias' },
]

export default function IndustriasPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Industrias | Sendwary para distintos tipos de negocios"
        description="Sendwary puede adaptarse a salones, clínicas, ferreterías, talleres, restaurantes, tiendas, servicios profesionales y más negocios."
        path="/industrias"
        jsonLd={buildBreadcrumbJsonLd(breadcrumbItems)}
      />
      <Navbar />
      <main>
        <Breadcrumbs items={breadcrumbItems} />
        <PageHero />
        <IndustriesGrid />
        <PageCTA />
      </main>
      <Footer />
    </div>
  )
}
