import { HeroSection } from '@/components/ui/hero-section-dark'
import { HeroMockup } from './HeroMockup'

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
      mockup={<HeroMockup />}
    />
  )
}
