import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge } from '@/components/ui/page-sections'
import { SEOHead } from '@/components/seo/SEOHead'

/* -------------------------------------------------------------------------- */
/*  Constantes editables                                                       */
/* -------------------------------------------------------------------------- */

const COMPANY_LEGAL_NAME = '[Nombre legal de la empresa]'
const PLATFORM_NAME = 'Sendwary'
const COMPANY_COUNTRY = 'República Dominicana'
const SUPPORT_EMAIL = 'info@sendwary.com'
const LAST_UPDATED = '2026-07-02'

/* -------------------------------------------------------------------------- */
/*  Contenido                                                                  */
/* -------------------------------------------------------------------------- */

type Block = { p: string } | { list: string[] }

interface Section {
  id: string
  title: string
  blocks: Block[]
}

const SECTIONS: Section[] = [
  {
    id: 'responsable',
    title: 'Responsable del tratamiento',
    blocks: [
      {
        p: `${PLATFORM_NAME}, operada por ${COMPANY_LEGAL_NAME}, es responsable del tratamiento de los datos personales recopilados a través de este sitio y de la plataforma. Para cualquier consulta puedes escribir a ${SUPPORT_EMAIL}.`,
      },
    ],
  },
  {
    id: 'datos',
    title: 'Datos que recopilamos',
    blocks: [
      { p: 'Según el uso del sitio y de la plataforma, podemos recopilar:' },
      {
        list: [
          'Datos de contacto que envías por el formulario: nombre, correo, teléfono/WhatsApp y nombre del negocio.',
          'Información sobre tu negocio: tipo, volumen de mensajes, sistema actual y necesidades.',
          'Datos de las conversaciones gestionadas en la plataforma: mensajes, audios, solicitudes, citas y cotizaciones.',
          'Datos técnicos básicos de navegación necesarios para el funcionamiento y la seguridad del servicio.',
        ],
      },
    ],
  },
  {
    id: 'finalidades',
    title: 'Para qué usamos los datos',
    blocks: [
      {
        list: [
          'Responder solicitudes de demo, precios, integraciones o soporte comercial.',
          'Prestar el servicio: operar el panel, los agentes IA y las funciones contratadas.',
          'Mejorar la plataforma, la seguridad y la calidad de la atención.',
          'Enviar comunicaciones relacionadas con el servicio solicitado.',
        ],
      },
      { p: 'No vendemos datos personales a terceros.' },
    ],
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp, IA y proveedores externos',
    blocks: [
      {
        list: [
          `${PLATFORM_NAME} se apoya en proveedores como WhatsApp Business, Meta, proveedores de inteligencia artificial, envío de formularios (por ejemplo Web3Forms), verificación anti-bots (por ejemplo Google reCAPTCHA) y hosting para operar el servicio.`,
          'Estos proveedores pueden procesar datos únicamente para prestar sus funciones.',
          'El cliente es responsable de contar con el consentimiento de sus clientes finales cuando corresponda.',
          'El procesamiento de audios y mensajes se realiza para la atención, transcripción o interpretación, según el plan y la función disponible.',
        ],
      },
    ],
  },
  {
    id: 'conservacion',
    title: 'Conservación de los datos',
    blocks: [
      { p: 'Conservamos los datos durante el tiempo necesario para prestar el servicio y cumplir obligaciones legales. La eliminación puede estar sujeta a respaldos técnicos o requisitos legales aplicables.' },
    ],
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    blocks: [
      { p: 'Aplicamos medidas técnicas y organizativas razonables para proteger los datos. Ningún sistema es completamente infalible, por lo que no garantizamos una seguridad absoluta, pero trabajamos para reducir riesgos.' },
    ],
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    blocks: [
      {
        p: 'De acuerdo con la normativa aplicable, puedes solicitar acceso, rectificación, actualización o eliminación de tus datos personales, así como oponerte a ciertos tratamientos. Para ejercer estos derechos, escríbenos a ' + SUPPORT_EMAIL + '.',
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies y tecnologías similares',
    blocks: [
      { p: 'El sitio puede utilizar cookies o tecnologías similares necesarias para su funcionamiento y, en su caso, para medir el uso de forma agregada. Puedes gestionar las cookies desde la configuración de tu navegador.' },
    ],
  },
  {
    id: 'cambios',
    title: 'Cambios en esta política',
    blocks: [
      { p: 'Podemos actualizar esta política. La fecha de última actualización cambiará en consecuencia y el uso continuado del sitio implica la aceptación de los cambios.' },
    ],
  },
  {
    id: 'contacto',
    title: 'Contacto',
    blocks: [
      { p: `Para consultas sobre esta política o el tratamiento de tus datos, escribe a ${SUPPORT_EMAIL}. Estos términos se rigen por las leyes de ${COMPANY_COUNTRY}.` },
    ],
  },
]

function renderBlock(block: Block, key: number) {
  if ('p' in block) {
    return (
      <p key={key} className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        {block.p}
      </p>
    )
  }
  return (
    <ul key={key} className="space-y-2">
      {block.list.map((item) => (
        <li
          key={item}
          className="flex gap-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300"
        >
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
          {item}
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Página                                                                     */
/* -------------------------------------------------------------------------- */

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SEOHead
        title="Política de privacidad | Sendwary"
        description="Conoce cómo Sendwary trata datos de contacto, formularios, solicitudes y uso de la plataforma conforme a sus políticas de privacidad."
        path="/privacidad"
      />
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />
          <div className="relative mx-auto max-w-4xl px-5 py-14 text-center sm:px-6 sm:py-16">
            <SectionBadge>Política de privacidad</SectionBadge>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl dark:text-white">
              Cómo tratamos{' '}
              <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
                tus datos
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
              Esta política explica qué datos recopila {PLATFORM_NAME}, con qué fines los usa y qué
              derechos tienes sobre ellos.
            </p>
            <p className="mt-4 text-sm text-neutral-500">Última actualización: {LAST_UPDATED}</p>
          </div>
        </section>

        <section className="relative bg-white pb-24 dark:bg-neutral-950">
          <div className="mx-auto max-w-3xl px-5 sm:px-6">
            {/* Aviso */}
            <div className="flex items-start gap-4 rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-6 dark:border-brand-400/25 dark:bg-brand-400/[0.05]">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                Este documento es una plantilla informativa y debe ser revisado por asesoría legal
                antes de su publicación definitiva, según el país, el modelo comercial y la normativa
                de protección de datos aplicable.
              </p>
            </div>

            {/* Contenido */}
            <div className="mt-12 space-y-12">
              {SECTIONS.map((section, i) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="mb-4 text-xl font-bold text-neutral-900 dark:text-white">
                    <span className="mr-2 text-brand-500">{i + 1}.</span>
                    {section.title}
                  </h2>
                  <div className="space-y-4">
                    {section.blocks.map((block, bi) => renderBlock(block, bi))}
                  </div>
                </section>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-14 rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-7 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                ¿Dudas sobre tus datos?
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                Puedes escribirnos antes de contratar el servicio para aclarar cómo tratamos la
                información de tu negocio y de tus clientes.
              </p>
              <Link
                to="/contacto"
                className="group mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950"
              >
                Contactar
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <p className="mt-8 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
              {PLATFORM_NAME} es operada por {COMPANY_LEGAL_NAME}. Documento sujeto a revisión legal
              antes de su publicación oficial.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
