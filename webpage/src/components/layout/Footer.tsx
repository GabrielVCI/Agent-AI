import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Linkedin, Instagram, Mail, ArrowRight } from 'lucide-react'
import { SiWhatsapp } from 'react-icons/si'

/* -------------------------------------------------------------------------- */
/*  Constantes fáciles de editar                                               */
/* -------------------------------------------------------------------------- */

const BRAND_NAME = 'Sendwary'

// Cambia estos valores cuando existan los datos reales del negocio.
const CONTACT_EMAIL = 'contacto@tudominio.com'
const WHATSAPP_URL = '#'
const LINKEDIN_URL = '#'
const INSTAGRAM_URL = '#'

const footerLinks = {
  product: [
    { label: 'Inicio', to: '/' },
    { label: 'Cómo funciona', to: '/como-funciona' },
    { label: 'Integraciones', to: '/integraciones' },
    { label: 'Precios', to: '/precios' },
    { label: 'Contacto', to: '/contacto' },
  ],
  features: [
    { label: 'Agentes IA para WhatsApp', to: '/como-funciona' },
    { label: 'Panel de conversaciones', to: '/como-funciona' },
    { label: 'Cotizaciones', to: '/como-funciona' },
    { label: 'Citas y consultas', to: '/como-funciona' },
    { label: 'Audios y dashboard', to: '/como-funciona' },
    { label: 'Integraciones bajo requerimiento', to: '/integraciones' },
  ],
  commercial: [
    { label: 'Solicita una demo', to: '/contacto?motivo=demo' },
    { label: 'Consultar precios', to: '/precios' },
    { label: 'Evaluar integración', to: '/contacto?tipo=integracion' },
  ],
  legal: [
    { label: 'Términos', to: '/terminos' },
    { label: 'Privacidad', to: '/privacidad' },
  ],
}

interface Social {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const socials: Social[] = [
  { label: 'LinkedIn', href: LINKEDIN_URL, icon: Linkedin },
  { label: 'Instagram', href: INSTAGRAM_URL, icon: Instagram },
  { label: 'WhatsApp', href: WHATSAPP_URL, icon: SiWhatsapp },
  { label: 'Correo', href: `mailto:${CONTACT_EMAIL}`, icon: Mail },
]

/* -------------------------------------------------------------------------- */
/*  Subcomponentes                                                             */
/* -------------------------------------------------------------------------- */

const linkCls =
  'text-sm text-neutral-400 transition-colors hover:text-brand-300 focus:outline-none focus-visible:text-brand-300 focus-visible:underline'

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; to: string }[]
}) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link to={link.to} className={linkCls}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Footer                                                                     */
/* -------------------------------------------------------------------------- */

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-neutral-950 text-neutral-300">
      {/* Glow morado decorativo */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand-600/10 blur-[130px]" />

      <div className="relative mx-auto max-w-screen-xl px-5 sm:px-6">
        {/* CTA compacto */}
        <div className="flex flex-col items-start gap-5 border-b border-white/10 py-10 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-lg font-bold text-white sm:text-xl">
              Convierte WhatsApp en un canal organizado de atención y ventas
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Automatiza respuestas, registra solicitudes, prepara cotizaciones y permite
              intervención humana desde una plataforma diseñada para negocios reales.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
            <Link
              to="/contacto?motivo=demo"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
            >
              Solicitar demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/precios"
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neutral-100 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto"
            >
              Ver precios
            </Link>
          </div>
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-2 gap-8 py-12 md:grid-cols-4 lg:gap-12">
          {/* Marca */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="inline-flex items-center" aria-label="Sendwary — inicio">
              <img src="/logo.png" alt="Sendwary" className="h-9 w-auto object-contain sm:h-10" />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-neutral-400">
              Asistentes IA personalizados para negocios que atienden clientes por WhatsApp. Organiza
              conversaciones, responde más rápido y permite que tu equipo mantenga el control cuando
              hace falta.
            </p>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-neutral-500">
              No es un chatbot genérico. Es una plataforma para atención, ventas y seguimiento por
              WhatsApp.
            </p>

            {/* Redes sociales */}
            <div className="mt-5 flex items-center gap-3">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  target={social.href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-neutral-400 transition-colors hover:border-brand-400/40 hover:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Producto" links={footerLinks.product} />
          <FooterColumn title="Soluciones" links={footerLinks.features} />

          {/* Contacto / Comercial */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">Contacto</h3>
            <ul className="space-y-2.5">
              {footerLinks.commercial.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className={linkCls}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Nota honesta de integraciones */}
        <p className="border-t border-white/10 py-6 text-xs leading-relaxed text-neutral-500">
          Integraciones con sistemas como Odoo, SAP, QuickBooks, CRM o inventarios disponibles bajo
          evaluación técnica, disponibilidad de API y alcance de implementación.
        </p>

        {/* Barra inferior */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 sm:flex-row">
          <p className="text-xs text-neutral-500">
            © {year} {BRAND_NAME}. Todos los derechos reservados.
          </p>
          <ul className="flex items-center gap-6">
            {footerLinks.legal.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="text-xs text-neutral-500 transition-colors hover:text-brand-300">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
