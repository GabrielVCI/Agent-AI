import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { ProblemSolution } from '@/components/landing/ProblemSolution'
import { CoreFeatures } from '@/components/landing/CoreFeatures'
import { Integrations } from '@/components/landing/Integrations'
import { FinalCTA } from '@/components/landing/FinalCTA'
import { Footer } from '@/components/layout/Footer'
import { SEOHead } from '@/components/seo/SEOHead'
import { SOFTWARE_APPLICATION_JSON_LD } from '@/lib/seo'

/**
 * Landing page de la plataforma.
 *
 * Estructura prevista (se irá completando por fases):
 *   <Navbar />
 *   <Hero />             ✅ implementado
 *   <ProblemSolution />  ✅ implementado
 *   <CoreFeatures />     ✅ implementado
 *   <Integrations />     ✅ implementado
 *   <FinalCTA />         ✅ implementado
 *   <Footer />           ✅ implementado
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Sendwary | Automatización inteligente para negocios"
        description="Automatiza atención, solicitudes, cotizaciones, citas y seguimiento con agentes IA. Sendwary ayuda a negocios a responder más rápido sin perder control humano."
        path="/"
        jsonLd={SOFTWARE_APPLICATION_JSON_LD}
      />
      <Navbar />
      <main>
        <Hero />
        <ProblemSolution />
        <CoreFeatures />
        <Integrations />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
