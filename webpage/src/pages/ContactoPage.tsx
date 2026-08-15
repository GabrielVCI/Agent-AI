import { Link } from 'react-router-dom'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge } from '@/components/ui/page-sections'
import { ContactForm } from '@/components/contact/ContactForm'
import { ContactInfoPanel } from '@/components/contact/ContactInfoPanel'
import { SEOHead } from '@/components/seo/SEOHead'

export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Contacto Sendwary | Solicita una demo"
        description="Solicita una demo de Sendwary y descubre cómo automatizar la atención, solicitudes, cotizaciones, citas e integraciones de tu negocio con agentes IA."
        path="/contacto"
      />
      <Navbar />
      <main>
        {/* Hero interno */}
        <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />

          <div className="relative mx-auto max-w-screen-xl px-5 py-14 text-center sm:px-6 sm:py-16">
            <div className="mx-auto max-w-3xl">
              <SectionBadge>Solicita una demo</SectionBadge>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl dark:text-white">
                Hablemos de cómo automatizar la atención por{' '}
                <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
                  WhatsApp de tu negocio
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
                Completa el formulario y te ayudaremos a identificar el plan, flujo o integración más
                conveniente según tu operación.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
                <Link to="/precios" className="text-brand-600 hover:underline dark:text-brand-300">
                  Ver costos y precios
                </Link>
                <Link
                  to="/como-funciona"
                  className="text-brand-600 hover:underline dark:text-brand-300"
                >
                  Ver cómo funciona
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Layout de 2 columnas */}
        <section className="relative bg-white pb-24 dark:bg-neutral-950">
          <div className="mx-auto max-w-screen-xl px-5 sm:px-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div className="order-2 lg:order-1">
                <ContactForm />
              </div>
              <div className="order-1 lg:order-2">
                {/* CTA pequeño: viene desde precios */}
                <div className="mb-6 rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-5 dark:border-brand-400/20 dark:bg-brand-400/[0.05]">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                    ¿Vienes desde precios?
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                    Selecciona el plan de interés y te ayudamos a validar si es el más adecuado.
                  </p>
                </div>
                <ContactInfoPanel />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
