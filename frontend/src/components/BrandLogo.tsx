/**
 * Marca Sendwary en sus tres variantes:
 * - SendwaryMark: ícono "S" cuadrado (funciona en claro y oscuro).
 * - SendwaryWordmark: ícono + nombre tipográfico, para superficies CLARAS
 *   (el logo.png tiene "Send" en blanco y no se lee sobre fondo claro).
 * - SendwaryLogo: imagen real /logo.png, solo para superficies OSCURAS.
 */

export function SendwaryMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <div
      className={`${className} rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-sm`}
    >
      <span className="text-white font-extrabold leading-none" style={{ fontSize: '60%' }}>
        S
      </span>
    </div>
  )
}

export function SendwaryWordmark({
  markClassName = 'h-9 w-9',
  textClassName = 'text-xl',
  light = false,
}: {
  markClassName?: string
  textClassName?: string
  /** true cuando el fondo es oscuro (texto claro) */
  light?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <SendwaryMark className={markClassName} />
      <span className={`font-bold tracking-tight leading-none ${textClassName}`}>
        <span className={light ? 'text-white' : 'text-slate-900'}>Send</span>
        <span className={light ? 'text-primary-300' : 'text-primary-600'}>wary</span>
      </span>
    </div>
  )
}

export function SendwaryLogo({ className = 'h-14' }: { className?: string }) {
  return <img src="/logo.png" alt="Sendwary" className={`${className} w-auto`} />
}
