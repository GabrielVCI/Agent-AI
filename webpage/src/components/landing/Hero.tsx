import { HeroSection } from '@/components/ui/hero-section-dark'
import { HeroMockup } from './HeroMockup'
import { ParticleTextEffect } from '@/components/ui/particle-text-effect'

/** Palabras del efecto de partículas, alineadas con la propuesta de Sendwary. */
const heroParticleWords = [
  'SENDWARY',
  'AGENTES IA',
  'VENTAS',
  'CITAS',
  'AUDIOS',
  'COTIZACIONES',
  'REPORTES',
  'TU NEGOCIO'
]

export function Hero() {
  return (
    <HeroSection
      badge="IA para WhatsApp Business"
      title={{
        regular: 'Automatiza WhatsApp con agentes IA, cotizaciones y control humano',
        gradient: 'sin perder el seguimiento de tus clientes',
      }}
      description="Responde mensajes, escucha audios, captura solicitudes, genera cotizaciones, organiza conversaciones y permite que tu equipo intervenga cuando haga falta desde un panel diseñado para negocios reales."
      cta={{ text: 'Solicitar demo', href: '/contacto?motivo=demo' }}
      secondaryCta={{ text: 'Ver costos y precios', href: '/precios' }}
      mockup={
        <div className="relative">
          {/* Banda decorativa de partículas; el dashboard se superpone a su base. */}
          <ParticleTextEffect
            words={heroParticleWords}
            className="mx-auto -mb-8 h-28 w-full max-w-4xl opacity-90 sm:-mb-12 sm:h-40 md:-mb-16 md:h-52"
          />
          <div className="relative z-10">
            <HeroMockup />
          </div>
        </div>
      }
    />
  )
}
