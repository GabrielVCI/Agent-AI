/**
 * Backgrounds decorativos reutilizables de Sendwary.
 *
 * AuthHeroBackground: fondo oscuro con degradado violeta de marca, grid sutil
 * y brillo suave. Pensado para la mitad hero de login/registro: el contenedor
 * padre debe ser `relative overflow-hidden isolate` y el contenido ir con
 * `relative z-10` para quedar por encima. El texto sobre este fondo debe ser
 * blanco (text-white / text-white/70).
 */
export function AuthHeroBackground() {
  return (
    <div className="absolute inset-0 -z-10 h-full w-full overflow-hidden [background:radial-gradient(125%_125%_at_50%_10%,#0b0217_40%,#6d28d9_100%)]">
      {/* Grid sutil sobre el degradado */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:6rem_4rem]" />
      {/* Brillo violeta claro (primary-300) hacia la esquina superior derecha */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_100%_200px,rgba(196,181,253,0.28),transparent)]" />
    </div>
  )
}
