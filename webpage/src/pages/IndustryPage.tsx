import { Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, CircleAlert, Info, Quote } from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge, IconBadge, CtaButtons } from '@/components/ui/page-sections'
import { IndustryIllustration } from '@/components/industries/industry-illustration'
import { SEOHead } from '@/components/seo/SEOHead'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { buildBreadcrumbJsonLd } from '@/lib/seo'
import {
  getIndustryBySlug,
  FEATURE_CATALOG,
  INDUSTRIES_INDEX_HREF,
  type IndustryPage as IndustryPageData,
} from '@/data/industries'

/* -------------------------------------------------------------------------- */
/*  Secciones                                                                  */
/* -------------------------------------------------------------------------- */

function Hero({ data }: { data: IndustryPageData }) {
  const demoHref = `/contacto?motivo=demo&industria=${data.slug}`
  return (
    <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />

      <div className="relative mx-auto max-w-screen-xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <div className="flex justify-center lg:justify-start">
              <SectionBadge>{data.category}</SectionBadge>
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl dark:text-white">
              {data.title}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg font-medium text-neutral-800 lg:mx-0 dark:text-neutral-100">
              {data.headline}
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 lg:mx-0 dark:text-neutral-300">
              {data.description}
            </p>
            <div className="mt-9 flex justify-center lg:justify-start">
              <CtaButtons primaryLabel="Solicitar demo" primaryHref={demoHref} />
            </div>
          </div>

          <div className="mt-4 lg:mt-0">
            <IndustryIllustration visual={data.visual} chat={data.examples[0]} tags={data.tags} />
          </div>
        </div>

        {data.disclaimer && (
          <div className="mx-auto mt-14 flex max-w-3xl items-start gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-4 text-left dark:border-brand-400/20 dark:bg-brand-400/[0.05]">
            <Info
              className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {data.disclaimer}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function PainPoints({ data }: { data: IndustryPageData }) {
  return (
    <section className="relative border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Problemas comunes</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Problemas que Sendwary{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              ayuda a resolver
            </span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.painPoints.map((pain) => (
            <div
              key={pain.title}
              className="flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/10 text-red-500 dark:border-red-400/15 dark:bg-red-400/10 dark:text-red-300">
                <CircleAlert className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
                {pain.title}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {pain.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Capabilities({ data }: { data: IndustryPageData }) {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Capacidades del agente</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Qué puede hacer{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              el agente IA
            </span>
          </h2>
        </div>

        <ul className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          {data.capabilities.map((cap) => (
            <li
              key={cap}
              className="flex items-start gap-3 rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:bg-brand-400/15 dark:text-brand-300">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
                {cap}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Examples({ data }: { data: IndustryPageData }) {
  return (
    <section className="relative overflow-hidden bg-neutral-950 py-20 text-neutral-100 sm:py-28">
      <div className="pointer-events-none absolute -left-20 top-0 h-[26rem] w-[26rem] rounded-full bg-brand-600/20 blur-[140px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/10 blur-[150px]" />

      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/25 bg-brand-400/10 px-4 py-1.5 text-xs font-medium text-brand-200 backdrop-blur-sm">
            <Quote className="h-3.5 w-3.5" />
            Ejemplos reales
          </span>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ejemplos de{' '}
            <span className="bg-gradient-to-r from-brand-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
              conversaciones
            </span>
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
          {data.examples.map((ex, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
            >
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-sm text-neutral-200">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Cliente
                  </span>
                  {ex.client}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-sm text-white">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-100/80">
                    Agente IA
                  </span>
                  {ex.agent}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-neutral-500">
          Ejemplos ilustrativos. Las respuestas se adaptan a la información y las reglas que
          configures para tu negocio, con intervención humana cuando sea necesario.
        </p>
      </div>
    </section>
  )
}

function WhyItWorks({ data }: { data: IndustryPageData }) {
  return (
    <section className="relative bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Valor para tu negocio</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Por qué funciona para{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              este tipo de negocio
            </span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.whyItWorks.map((reason, i) => (
            <div
              key={reason}
              className="relative flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="mb-4 text-3xl font-extrabold text-neutral-200 dark:text-white/10">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-sm font-medium leading-relaxed text-neutral-800 dark:text-neutral-200">
                {reason}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RecommendedFeatures({ data }: { data: IndustryPageData }) {
  return (
    <section className="relative border-t border-neutral-200/70 bg-neutral-50/60 py-20 sm:py-28 dark:border-white/5 dark:bg-neutral-950">
      <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <SectionBadge>Funciones recomendadas</SectionBadge>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
            Las funciones que más{' '}
            <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              aportan aquí
            </span>
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.recommendedFeatures.map((key) => {
            const feature = FEATURE_CATALOG[key]
            return (
              <div
                key={key}
                className="flex items-center gap-4 rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm transition-colors hover:border-brand-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-brand-400/40"
              >
                <IconBadge icon={feature.icon} />
                <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {feature.label}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-10 text-center">
          <a
            href="/integraciones"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:text-brand-600 dark:text-brand-300 dark:hover:text-brand-200"
          >
            Ver integraciones bajo requerimiento
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}

function FinalCTA({ data }: { data: IndustryPageData }) {
  const demoHref = `/contacto?motivo=demo&industria=${data.slug}`
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28 dark:bg-neutral-950">
      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-brand-500/20 bg-neutral-950 px-6 py-16 text-center shadow-2xl shadow-brand-900/30 sm:px-12 sm:py-20 dark:border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.28),transparent_60%)]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-600/15 blur-[130px]" />

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-extrabold leading-[1.15] tracking-tight text-white sm:text-4xl">
              {data.ctaTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Podemos mostrarte cómo un agente IA puede responder clientes, organizar solicitudes y
              permitir intervención humana según la operación de tu negocio.
            </p>
            <div className="mt-9 flex justify-center">
              <CtaButtons primaryLabel="Solicitar demo" primaryHref={demoHref} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Página dinámica                                                            */
/* -------------------------------------------------------------------------- */

export default function IndustryPage() {
  const { slug } = useParams<{ slug: string }>()
  const data = slug ? getIndustryBySlug(slug) : undefined

  // Slug inexistente (o slug de categoría) → volver a la página general.
  if (!data) {
    return <Navigate to={INDUSTRIES_INDEX_HREF} replace />
  }

  const breadcrumbItems = [
    { name: 'Inicio', path: '/' },
    { name: 'Industrias', path: INDUSTRIES_INDEX_HREF },
    { name: data.title, path: `/industrias/${data.slug}` },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title={data.seoTitle}
        description={data.seoDescription}
        path={`/industrias/${data.slug}`}
        jsonLd={buildBreadcrumbJsonLd(breadcrumbItems)}
      />
      <Navbar />
      <main>
        <Breadcrumbs items={breadcrumbItems} />
        <Hero data={data} />
        <PainPoints data={data} />
        <Capabilities data={data} />
        <Examples data={data} />
        <WhyItWorks data={data} />
        <RecommendedFeatures data={data} />
        <FinalCTA data={data} />
      </main>
      <Footer />
    </div>
  )
}
