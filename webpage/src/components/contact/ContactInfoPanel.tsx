import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react'

const HELP_ITEMS = [
  'Qué plan se ajusta mejor a tu negocio.',
  'Cuántos agentes o números de WhatsApp necesitas.',
  'Si necesitas catálogo, citas, cotizaciones o audios.',
  'Si conviene evaluar integraciones con Odoo, SAP, QuickBooks, CRM o inventario.',
  'Cómo implementar la plataforma por fases.',
]

const AFTER_STEPS = [
  'Revisamos tu caso.',
  'Identificamos el plan o alcance recomendado.',
  'Te mostramos una demo o flujo sugerido.',
  'Evaluamos integraciones si tu negocio las necesita.',
]

export function ContactInfoPanel() {
  return (
    <div className="space-y-6">
      {/* Podemos ayudarte a definir */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
          <Sparkles className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Podemos ayudarte a definir
        </h2>
        <ul className="mt-4 space-y-3">
          {HELP_ITEMS.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500 dark:text-brand-300" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Después de enviar */}
      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-7 dark:border-white/10 dark:bg-white/[0.02]">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          Después de enviar tu solicitud
        </h2>
        <ol className="mt-5 space-y-4">
          {AFTER_STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Confianza */}
      <div className="flex items-start gap-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-5 dark:border-brand-400/20 dark:bg-brand-400/[0.05]">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Sin compromiso. La implementación puede realizarse por fases según el tipo de negocio,
          mensajes mensuales e integraciones requeridas.
        </p>
      </div>
    </div>
  )
}
