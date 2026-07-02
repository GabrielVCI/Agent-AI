import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/layout/Footer'
import { SectionBadge } from '@/components/ui/page-sections'

/* -------------------------------------------------------------------------- */
/*  Constantes editables                                                       */
/*  → Cambia estos valores cuando existan los datos legales reales.            */
/* -------------------------------------------------------------------------- */

const COMPANY_LEGAL_NAME = '[Nombre legal de la empresa]'
const PLATFORM_NAME = 'Sendwary'
const COMPANY_COUNTRY = 'República Dominicana'
const SUPPORT_EMAIL = 'contacto@tudominio.com'
const LAST_UPDATED = '2026-07-02'

/* -------------------------------------------------------------------------- */
/*  Contenido                                                                  */
/* -------------------------------------------------------------------------- */

type Block =
  | { p: string }
  | { list: string[] }
  | { defs: { term: string; desc: string }[] }

interface Section {
  id: string
  title: string
  blocks: Block[]
}

const SECTIONS: Section[] = [
  {
    id: 'aceptacion',
    title: 'Aceptación de los términos',
    blocks: [
      {
        p: `Al acceder, registrarte o utilizar ${PLATFORM_NAME} (en adelante, "la Plataforma"), aceptas quedar vinculado por estos Términos y Condiciones. Si utilizas la Plataforma en nombre de un negocio, declaras contar con autorización para aceptarlos en su representación.`,
      },
      {
        p: 'Si no estás de acuerdo con estos términos, no debes acceder ni utilizar el servicio.',
      },
    ],
  },
  {
    id: 'definiciones',
    title: 'Definiciones',
    blocks: [
      {
        defs: [
          { term: 'Plataforma', desc: 'el servicio SaaS de agentes IA para atención por WhatsApp, incluyendo panel, agentes, funciones comerciales e integraciones.' },
          { term: 'Cliente', desc: 'la persona o negocio que contrata o utiliza la Plataforma.' },
          { term: 'Usuario', desc: 'cada persona autorizada por el Cliente para acceder al panel.' },
          { term: 'Negocio', desc: 'la operación comercial del Cliente que atiende por WhatsApp.' },
          { term: 'Agente IA', desc: 'el asistente de inteligencia artificial configurado para responder según la información del Negocio.' },
          { term: 'Conversación', desc: 'el intercambio de mensajes entre un cliente final y el Negocio a través de la Plataforma.' },
          { term: 'WhatsApp', desc: 'el servicio de mensajería operado por Meta y sus APIs asociadas.' },
          { term: 'Panel', desc: 'la interfaz web de gestión de conversaciones, configuración y reportes.' },
          { term: 'Integración', desc: 'la conexión con sistemas externos (CRM, ERP, inventario, etc.) bajo requerimiento.' },
          { term: 'Contenido del Cliente', desc: 'información, catálogos, documentos y datos cargados por el Cliente.' },
          { term: 'Datos de clientes finales', desc: 'datos personales de las personas que escriben al Negocio.' },
          { term: 'Plan', desc: 'el nivel de servicio contratado (Básico, Pro o Enterprise).' },
          { term: 'Tokens / consumo de IA', desc: 'la unidad de procesamiento que determina el uso estimado de mensajes.' },
        ],
      },
    ],
  },
  {
    id: 'servicio',
    title: 'Descripción del servicio',
    blocks: [
      { p: 'La Plataforma ofrece, según el Plan contratado, funciones que pueden incluir:' },
      {
        list: [
          'Agentes IA asociados a números reales de WhatsApp.',
          'Panel de conversaciones y gestión de mensajes.',
          'Intervención humana en las conversaciones.',
          'Configuración de agentes y registro de información del Negocio.',
          'Cotizaciones, citas o consultas.',
          'Catálogo de productos o servicios.',
          'Procesamiento de audios, cuando la función esté disponible.',
          'Dashboard y reportes.',
          'Integraciones bajo requerimiento.',
        ],
      },
      { p: 'Las funciones disponibles pueden variar según el Plan contratado y pueden ofrecerse por fases.' },
    ],
  },
  {
    id: 'cuentas',
    title: 'Registro y cuentas de usuario',
    blocks: [
      {
        list: [
          'El Cliente debe suministrar información real, completa y actualizada.',
          'El Cliente es responsable de sus credenciales y de los Usuarios internos que autorice.',
          'El Cliente debe controlar quién accede al Panel.',
          'El Cliente debe notificar cualquier uso no autorizado de su cuenta.',
          'La Plataforma puede suspender cuentas por uso indebido o incumplimiento.',
        ],
      },
    ],
  },
  {
    id: 'whatsapp',
    title: 'Uso de WhatsApp y proveedores externos',
    blocks: [
      {
        list: [
          'La Plataforma puede depender de WhatsApp Business, Meta u otros proveedores externos.',
          'El Cliente debe cumplir las políticas de WhatsApp y de Meta.',
          'Cambios, bloqueos, limitaciones o fallos de terceros pueden afectar el servicio.',
          'La Plataforma no controla decisiones de Meta, WhatsApp, proveedores de IA, correo, hosting o pasarelas de pago.',
          'El Cliente es responsable de contar con autorización para usar el número de WhatsApp conectado.',
        ],
      },
    ],
  },
  {
    id: 'ia',
    title: 'Uso de inteligencia artificial',
    blocks: [
      {
        list: [
          'Las respuestas de la IA pueden no ser perfectas ni completas.',
          'El Cliente debe revisar, configurar y supervisar el comportamiento del Agente IA.',
          'La IA puede generar respuestas inexactas si la información configurada es incorrecta o insuficiente.',
          'La Plataforma no sustituye asesoría profesional, médica, legal, financiera o técnica especializada.',
          'En sectores sensibles, el Cliente debe utilizar intervención humana.',
          'El Cliente debe definir reglas, límites, tono y criterios de escalamiento.',
        ],
      },
    ],
  },
  {
    id: 'responsabilidades',
    title: 'Responsabilidades del cliente',
    blocks: [
      {
        list: [
          'Configurar información verdadera del Negocio.',
          'Obtener el consentimiento necesario de sus clientes finales cuando aplique.',
          'No usar la Plataforma para spam, fraude, engaño o actividades ilegales.',
          'Responder por productos, servicios, precios, ofertas, cotizaciones y promesas realizadas a sus clientes.',
          'Revisar conversaciones sensibles.',
          'Mantener actualizada la información del Negocio.',
          'Asegurar que su equipo use correctamente la Plataforma.',
        ],
      },
    ],
  },
  {
    id: 'datos',
    title: 'Datos, privacidad y confidencialidad',
    blocks: [
      { p: 'La Plataforma puede procesar datos personales como nombres, teléfonos, mensajes, audios, solicitudes, citas, cotizaciones y datos comerciales, con el fin de prestar el servicio, operar el Panel, generar respuestas, dar soporte, garantizar seguridad e introducir mejoras.' },
      {
        list: [
          'El Cliente es responsable de informar a sus clientes finales sobre el tratamiento de datos cuando corresponda.',
          'La Plataforma no vende datos personales a terceros.',
          'Pueden intervenir proveedores tecnológicos necesarios para operar el servicio.',
          'Se mantiene confidencialidad sobre información comercial, catálogos, documentos e integraciones.',
          'Se aplican medidas razonables de protección, sin que ello implique una garantía de seguridad absoluta.',
        ],
      },
      { p: 'Una Política de Privacidad separada puede detallar información adicional sobre el tratamiento de datos.' },
    ],
  },
  {
    id: 'contenido',
    title: 'Catálogos, documentos y contenido cargado',
    blocks: [
      {
        list: [
          'El Cliente puede cargar información de productos, servicios, horarios, reglas, documentos o catálogos.',
          'El Cliente conserva los derechos sobre su contenido.',
          'El Cliente garantiza que tiene derecho a cargar y usar ese contenido.',
          'En planes básicos, los documentos o catálogos sirven como fuente de información para la IA, pero no necesariamente como inventario formal.',
          'El catálogo avanzado o la carga masiva pueden depender del Plan.',
          'La Plataforma puede rechazar contenido ilegal, ofensivo o no permitido.',
        ],
      },
    ],
  },
  {
    id: 'audios',
    title: 'Audios, mensajes y conversaciones',
    blocks: [
      {
        list: [
          'Si la función está disponible, la Plataforma puede procesar audios para transcripción, interpretación o atención.',
          'Los audios y mensajes pueden requerir un mayor consumo de IA/tokens.',
          'El Cliente debe cumplir las normas aplicables al procesar audios o datos personales.',
          'Las conversaciones se guardan para operación, seguimiento y reportes.',
          'El Cliente debe cuidar el uso de información sensible.',
        ],
      },
    ],
  },
  {
    id: 'cotizaciones',
    title: 'Cotizaciones, citas y solicitudes',
    blocks: [
      {
        list: [
          'La Plataforma puede ayudar a capturar información para cotizaciones, citas, consultas o solicitudes.',
          'Salvo configuración específica, las cotizaciones pueden ser preliminares.',
          'El Negocio es responsable de validar precios, disponibilidad, condiciones, fechas, servicios y compromisos.',
          'La Plataforma no garantiza el cierre de ventas ni la disponibilidad real sin una integración formal con inventario o agenda.',
          'En el caso de citas, el Negocio debe validar confirmaciones, horarios y políticas internas.',
        ],
      },
    ],
  },
  {
    id: 'integraciones',
    title: 'Integraciones con sistemas externos',
    blocks: [
      {
        list: [
          'Las integraciones con CRM, Odoo, SAP, QuickBooks, inventarios, ecommerce, calendarios, APIs, bases de datos o sistemas internos se realizan bajo evaluación técnica.',
          'No todas las integraciones están incluidas en todos los Planes.',
          'Las integraciones pueden requerir costos adicionales.',
          'Dependen de la disponibilidad de API, permisos, documentación, estabilidad del sistema externo y alcance.',
          'El Cliente debe contar con autorización para conectar sistemas externos.',
          'La Plataforma no es responsable por fallos de sistemas externos.',
        ],
      },
    ],
  },
  {
    id: 'planes',
    title: 'Planes, pagos y facturación',
    blocks: [
      {
        list: [
          'Los planes disponibles pueden ser Básico, Pro y Enterprise.',
          'Los precios pueden cambiar.',
          'Las funcionalidades dependen del Plan contratado.',
          'El pago puede ser mensual o anual, según aplique.',
          'La falta de pago puede causar la suspensión del servicio.',
          'Impuestos, cargos bancarios o comisiones pueden no estar incluidos.',
          'Las condiciones comerciales finales pueden establecerse en la propuesta o factura correspondiente.',
        ],
      },
    ],
  },
  {
    id: 'tokens',
    title: 'Mensajes, tokens y límites de uso',
    blocks: [
      {
        list: [
          'Los rangos de mensajes son estimados.',
          'El consumo depende de la longitud de las conversaciones, audios, instrucciones, contexto, documentos y uso real de IA.',
          'Cada Plan contempla una capacidad mensual estimada.',
          'Si el Cliente supera el uso previsto, puede requerirse un ajuste, ampliación o cambio de Plan.',
          'No se ofrecen mensajes ilimitados, salvo que exista un Plan específico que así lo indique.',
          'La Plataforma puede aplicar límites razonables por estabilidad, seguridad y control de costos.',
        ],
      },
    ],
  },
  {
    id: 'cancelaciones',
    title: 'Cancelaciones, suspensión y terminación',
    blocks: [
      {
        list: [
          'El Cliente puede solicitar la cancelación según las condiciones de su Plan.',
          'La Plataforma puede suspender el servicio por falta de pago, uso indebido, abuso, incumplimiento legal o riesgo de seguridad.',
          'Al terminar el servicio, el acceso puede ser desactivado.',
          'Puede establecerse un periodo para exportar información si está técnicamente disponible.',
          'La eliminación de datos puede estar sujeta a obligaciones legales, respaldos o políticas internas.',
        ],
      },
    ],
  },
  {
    id: 'uso-aceptable',
    title: 'Uso aceptable de la plataforma',
    blocks: [
      { p: 'Queda prohibido utilizar la Plataforma para:' },
      {
        list: [
          'Spam, fraude, phishing o suplantación de identidad.',
          'Actividades ilegales o no autorizadas.',
          'Envío de contenido ofensivo, discriminatorio o abusivo.',
          'Recolección de datos sin autorización.',
          'Acosar, engañar o manipular personas.',
          'Intentar vulnerar la seguridad de la Plataforma.',
          'Usar la IA para generar contenido peligroso, ilegal o no autorizado.',
          'Cargar datos sensibles innecesarios sin base legal o consentimiento.',
        ],
      },
    ],
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    blocks: [
      {
        list: [
          'La Plataforma, su diseño, código, marca, componentes, flujos y tecnología pertenecen al proveedor.',
          'El Cliente conserva sus datos, catálogos, documentos y contenido propio.',
          'El Cliente no puede copiar, revender, modificar, hacer ingeniería inversa o explotar la Plataforma sin autorización.',
          'El feedback o las sugerencias pueden ser usados para mejorar el producto.',
        ],
      },
    ],
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad del servicio',
    blocks: [
      {
        list: [
          'Se procurará mantener el servicio disponible de forma razonable.',
          'Puede haber mantenimiento, actualizaciones, fallos de proveedores, caídas de hosting, cambios de APIs o incidentes.',
          'No se garantiza una disponibilidad absoluta.',
          'Algunas funciones pueden estar en desarrollo, en beta o disponibles por fases.',
        ],
      },
    ],
  },
  {
    id: 'responsabilidad',
    title: 'Limitación de responsabilidad',
    blocks: [
      {
        list: [
          'La Plataforma no garantiza ventas, conversiones, citas, ingresos ni resultados específicos.',
          'El Cliente es responsable de sus decisiones comerciales.',
          'La Plataforma no se hace responsable por información incorrecta cargada por el Cliente.',
          'No se responde por fallos de WhatsApp, Meta, proveedores de IA, hosting, correo, pasarelas de pago o sistemas externos.',
          'La responsabilidad se limita en la medida permitida por la ley aplicable.',
        ],
      },
    ],
  },
  {
    id: 'indemnidad',
    title: 'Indemnidad',
    blocks: [
      { p: 'El Cliente acepta mantener indemne al proveedor frente a reclamos derivados de:' },
      {
        list: [
          'Uso indebido de la Plataforma.',
          'Incumplimiento de leyes.',
          'Contenido cargado por el Cliente.',
          'Mensajes enviados a clientes finales.',
          'Falta de consentimiento.',
          'Productos o servicios ofrecidos por el Negocio.',
          'Incumplimiento de políticas de terceros.',
        ],
      },
    ],
  },
  {
    id: 'modificaciones',
    title: 'Modificaciones de los términos',
    blocks: [
      {
        list: [
          'Estos términos pueden actualizarse.',
          'La fecha de última actualización cambiará en consecuencia.',
          'El uso continuado de la Plataforma implica la aceptación de los cambios.',
          'Los cambios relevantes pueden notificarse por medios razonables.',
        ],
      },
    ],
  },
  {
    id: 'ley',
    title: 'Ley aplicable y jurisdicción',
    blocks: [
      {
        p: `Estos términos se regirán por las leyes de ${COMPANY_COUNTRY}. Salvo que se acuerde lo contrario, cualquier controversia será sometida a los tribunales competentes de ${COMPANY_COUNTRY}. (Sujeto a revisión legal.)`,
      },
    ],
  },
  {
    id: 'contacto',
    title: 'Contacto',
    blocks: [
      { p: `Para consultas sobre estos términos puedes escribir a ${SUPPORT_EMAIL} o utilizar nuestra página de contacto.` },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/*  Render de bloques                                                          */
/* -------------------------------------------------------------------------- */

function renderBlock(block: Block, key: number) {
  if ('p' in block) {
    return (
      <p key={key} className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        {block.p}
      </p>
    )
  }
  if ('list' in block) {
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
  return (
    <dl key={key} className="space-y-2">
      {block.defs.map((def) => (
        <div key={def.term} className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <dt className="inline font-semibold text-neutral-900 dark:text-white">{def.term}: </dt>
          <dd className="inline">{def.desc}</dd>
        </div>
      ))}
    </dl>
  )
}

/* -------------------------------------------------------------------------- */
/*  Página                                                                     */
/* -------------------------------------------------------------------------- */

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Navbar />
      <main>
        {/* Hero legal */}
        <section className="relative overflow-hidden bg-white pt-16 dark:bg-neutral-950">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-600/15 blur-[140px] dark:bg-brand-600/20" />
          <div className="relative mx-auto max-w-4xl px-5 py-14 text-center sm:px-6 sm:py-16">
            <SectionBadge>Términos y condiciones</SectionBadge>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl dark:text-white">
              Condiciones de uso de{' '}
              <span className="bg-gradient-to-r from-brand-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
                la plataforma
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-neutral-300">
              Estos términos regulan el acceso y uso de la Plataforma, sus agentes IA para WhatsApp,
              panel de conversaciones, funciones comerciales, planes, integraciones y servicios
              relacionados.
            </p>
            <p className="mt-4 text-sm text-neutral-500">Última actualización: {LAST_UPDATED}</p>
          </div>
        </section>

        <section className="relative bg-white pb-24 dark:bg-neutral-950">
          <div className="mx-auto max-w-6xl px-5 sm:px-6">
            {/* Aviso importante */}
            <div className="mx-auto flex max-w-4xl items-start gap-4 rounded-2xl border border-brand-500/25 bg-brand-500/[0.04] p-6 dark:border-brand-400/25 dark:bg-brand-400/[0.05]">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">Importante</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  Este documento es una plantilla informativa para la Plataforma y debe ser revisado
                  por asesoría legal antes de su publicación definitiva. Las condiciones pueden
                  ajustarse según el país, el modelo comercial, el proveedor de pagos, las políticas
                  de WhatsApp/Meta, el proveedor de IA y la operación real del servicio.
                </p>
              </div>
            </div>

            {/* Layout: índice sticky + contenido */}
            <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[260px_1fr]">
              {/* Índice */}
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Contenido
                </p>
                <nav>
                  <ol className="space-y-1.5">
                    {SECTIONS.map((section, i) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="block rounded-lg px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-brand-500/10 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-neutral-400 dark:hover:text-brand-200"
                        >
                          <span className="mr-2 text-xs font-semibold text-brand-500">{i + 1}.</span>
                          {section.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </aside>

              {/* Contenido */}
              <div className="min-w-0 max-w-3xl">
                <div className="space-y-12">
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

                {/* CTA suave */}
                <div className="mt-14 rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-7 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                    ¿Tienes dudas sobre el uso de la plataforma?
                  </h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                    Si necesitas aclarar condiciones, planes, integraciones o uso de datos, puedes
                    contactarnos antes de contratar el servicio.
                  </p>
                  <Link
                    to="/contacto"
                    className="group mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-brand-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950"
                  >
                    Contactar
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>

                {/* Nota legal / empresa */}
                <p className="mt-8 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">
                  {PLATFORM_NAME} es operada por {COMPANY_LEGAL_NAME}. Documento sujeto a revisión
                  legal antes de su publicación oficial.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
