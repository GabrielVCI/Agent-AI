/**
 * Captura real del dashboard de Sendwary, enmarcada en un contenedor premium
 * (borde sutil, sombra y glow morado) coherente con el fondo oscuro del hero.
 */
export function HeroMockup() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900 to-neutral-950 p-2 shadow-2xl shadow-brand-950/40 sm:p-3">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-brand-500/10 via-transparent to-fuchsia-500/10" />
      <div className="relative overflow-hidden rounded-xl border border-white/10">
        <img
          src="/hero.png"
          alt="Dashboard de Sendwary mostrando conversaciones, agentes IA, cotizaciones y métricas"
          width={1737}
          height={972}
          className="h-auto w-full object-contain"
          loading="eager"
          {...{ fetchpriority: 'high' }}
        />
      </div>
    </div>
  )
}
