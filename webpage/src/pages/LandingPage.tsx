import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { ProblemSolution } from '@/components/landing/ProblemSolution'
import { CoreFeatures } from '@/components/landing/CoreFeatures'
import { Integrations } from '@/components/landing/Integrations'
import { FinalCTA } from '@/components/landing/FinalCTA'
import { Footer } from '@/components/layout/Footer'

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
