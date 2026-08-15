import {
  Sparkles,
  Stethoscope,
  Hammer,
  Wrench,
  Utensils,
  ShoppingBag,
  BriefcaseBusiness,
  Bot,
  MessagesSquare,
  FileText,
  CalendarCheck,
  PackageSearch,
  AudioLines,
  LayoutDashboard,
  UserCog,
  PlugZap,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'

/**
 * Catálogo de industrias a las que Sendwary puede ayudar.
 *
 * Fuente única de datos usada por:
 *  - el mega menú de escritorio (IndustryMegaMenu),
 *  - el acordeón del menú móvil (Navbar),
 *  - la página general `/industrias`,
 *  - la plantilla dinámica `/industrias/:slug` (IndustryPage).
 *
 * Para añadir una industria nueva basta con:
 *  1. Agregar su `{ label, href }` dentro de la categoría correspondiente en
 *     `industryCategories` (esto la muestra en el mega menú y el móvil).
 *  2. Agregar una entrada en `industryPages` con el mismo `slug` (esto crea su
 *     página, ilustración, SEO y contenido). No hay que tocar el router.
 */

/* -------------------------------------------------------------------------- */
/*  Navegación: categorías → industrias (mega menú / móvil / grid).            */
/* -------------------------------------------------------------------------- */

export interface IndustryItem {
  label: string
  href: string
}

export interface IndustryCategory {
  /** Identificador estable (slug) para estado de UI. */
  id: string
  title: string
  /** Descripción corta (grids y menú móvil). */
  description: string
  /** Texto ampliado para el panel derecho del mega menú. */
  blurb: string
  /** Ruta de la categoría (página general por ahora). */
  href: string
  icon: LucideIcon
  items: IndustryItem[]
}

export const industryCategories: IndustryCategory[] = [
  {
    id: 'belleza-y-bienestar',
    title: 'Belleza y bienestar',
    description: 'Citas, servicios, precios y seguimiento de clientes.',
    blurb:
      'Automatiza citas, consultas frecuentes, servicios, precios y seguimiento de clientes por WhatsApp.',
    href: '/industrias/belleza-y-bienestar',
    icon: Sparkles,
    items: [
      { label: 'Salones de belleza', href: '/industrias/salones-de-belleza' },
      { label: 'Peluquerías', href: '/industrias/peluquerias' },
      { label: 'Spas y centros estéticos', href: '/industrias/spas' },
    ],
  },
  {
    id: 'salud-y-clinicas',
    title: 'Salud y clínicas',
    description: 'Solicitudes, citas y preguntas frecuentes con apoyo humano.',
    blurb:
      'Recibe solicitudes, coordina citas, responde preguntas frecuentes y permite intervención humana cuando el caso lo requiere.',
    href: '/industrias/salud-y-clinicas',
    icon: Stethoscope,
    items: [
      { label: 'Clínicas', href: '/industrias/clinicas' },
      { label: 'Consultorios médicos', href: '/industrias/consultorios' },
      { label: 'Centros odontológicos', href: '/industrias/odontologia' },
    ],
  },
  {
    id: 'ferreterias-y-construccion',
    title: 'Ferreterías y construcción',
    description: 'Consultas de productos, cotizaciones y ventas.',
    blurb:
      'Responde consultas de productos, toma solicitudes de cotización y organiza conversaciones comerciales.',
    href: '/industrias/ferreterias-y-construccion',
    icon: Hammer,
    items: [
      { label: 'Ferreterías', href: '/industrias/ferreterias' },
      {
        label: 'Materiales de construcción',
        href: '/industrias/materiales-de-construccion',
      },
    ],
  },
  {
    id: 'repuestos-y-talleres',
    title: 'Repuestos y talleres',
    description: 'Datos del vehículo, piezas, citas y seguimiento.',
    blurb:
      'Captura datos del vehículo, solicitudes de piezas, citas de servicio y seguimiento por WhatsApp.',
    href: '/industrias/repuestos-y-talleres',
    icon: Wrench,
    items: [
      { label: 'Repuestos', href: '/industrias/repuestos' },
      { label: 'Talleres automotrices', href: '/industrias/talleres' },
    ],
  },
  {
    id: 'restaurantes-y-comida',
    title: 'Restaurantes y comida',
    description: 'Horarios, menú, pedidos, reservas y preguntas frecuentes.',
    blurb:
      'Responde horarios, menú, pedidos, reservas y preguntas frecuentes de clientes.',
    href: '/industrias/restaurantes-y-comida',
    icon: Utensils,
    items: [
      { label: 'Restaurantes', href: '/industrias/restaurantes' },
      { label: 'Cafeterías', href: '/industrias/cafeterias' },
      { label: 'Comida rápida', href: '/industrias/comida-rapida' },
    ],
  },
  {
    id: 'tiendas-y-retail',
    title: 'Tiendas y retail',
    description: 'Productos, disponibilidad, precios, pedidos y seguimiento.',
    blurb:
      'Organiza preguntas sobre productos, disponibilidad, precios, pedidos y seguimiento.',
    href: '/industrias/tiendas-y-retail',
    icon: ShoppingBag,
    items: [
      { label: 'Tiendas físicas', href: '/industrias/tiendas' },
      { label: 'Ecommerce', href: '/industrias/ecommerce' },
      { label: 'Moda y accesorios', href: '/industrias/moda' },
    ],
  },
  {
    id: 'servicios-profesionales',
    title: 'Servicios profesionales',
    description: 'Solicitudes, clientes potenciales, consultas y seguimiento.',
    blurb:
      'Recibe solicitudes, clasifica clientes potenciales, agenda consultas y mejora el seguimiento.',
    href: '/industrias/servicios-profesionales',
    icon: BriefcaseBusiness,
    items: [
      { label: 'Firmas contables', href: '/industrias/firmas-contables' },
      { label: 'Consultores', href: '/industrias/consultores' },
      { label: 'Servicios técnicos', href: '/industrias/servicios-tecnicos' },
    ],
  },
]

/** Ruta de la página general de industrias. */
export const INDUSTRIES_INDEX_HREF = '/industrias'

/* -------------------------------------------------------------------------- */
/*  Catálogo de funciones de la plataforma (reutilizable por industria).       */
/* -------------------------------------------------------------------------- */

export type FeatureKey =
  | 'agents'
  | 'inbox'
  | 'quotes'
  | 'appointments'
  | 'catalog'
  | 'audio'
  | 'dashboard'
  | 'handoff'
  | 'integrations'
  | 'leads'

export const FEATURE_CATALOG: Record<FeatureKey, { label: string; icon: LucideIcon }> = {
  agents: { label: 'Agentes IA por número de WhatsApp', icon: Bot },
  inbox: { label: 'Panel de conversaciones', icon: MessagesSquare },
  quotes: { label: 'Cotizaciones', icon: FileText },
  appointments: { label: 'Citas y consultas', icon: CalendarCheck },
  catalog: { label: 'Catálogo de productos o servicios', icon: PackageSearch },
  audio: { label: 'Procesamiento de audios', icon: AudioLines },
  dashboard: { label: 'Dashboard y reportes', icon: LayoutDashboard },
  handoff: { label: 'Intervención humana', icon: UserCog },
  integrations: { label: 'Integraciones bajo requerimiento', icon: PlugZap },
  leads: { label: 'Captura de datos y leads', icon: ClipboardList },
}

/* -------------------------------------------------------------------------- */
/*  Contenido por industria (páginas individuales).                            */
/* -------------------------------------------------------------------------- */

/** Estilo de ilustración según el tipo de negocio. */
export type IndustryVisualType =
  | 'beauty'
  | 'health'
  | 'hardware'
  | 'automotive'
  | 'food'
  | 'retail'
  | 'professional'

export interface ChatExample {
  client: string
  agent: string
}

export interface PainPoint {
  title: string
  description: string
}

export interface IndustryPage {
  slug: string
  /** id de la categoría en `industryCategories`. */
  categoryId: string
  /** Nombre visible de la categoría (badge del hero). */
  category: string
  title: string
  headline: string
  description: string
  painPoints: PainPoint[]
  /** Qué puede hacer el agente IA en este negocio. */
  capabilities: string[]
  examples: ChatExample[]
  /** Por qué funciona para este tipo de negocio. */
  whyItWorks: string[]
  recommendedFeatures: FeatureKey[]
  visual: IndustryVisualType
  /** Etiquetas cortas para la ilustración (servicios/productos típicos). */
  tags: string[]
  /** Título del CTA final (personalizado). */
  ctaTitle: string
  seoTitle: string
  seoDescription: string
  /** Aviso responsable (salud, contable, técnico, integraciones). */
  disclaimer?: string
}

export const industryPages: IndustryPage[] = [
  /* ===================== Belleza y bienestar ===================== */
  {
    slug: 'salones-de-belleza',
    categoryId: 'belleza-y-bienestar',
    category: 'Belleza y bienestar',
    title: 'Agentes IA para salones de belleza',
    headline: 'Responde consultas, agenda servicios y organiza clientes por WhatsApp',
    description:
      'Automatiza respuestas por WhatsApp, recibe solicitudes de servicios, organiza citas, responde precios frecuentes y permite que tu equipo intervenga cuando el cliente necesita atención personalizada.',
    painPoints: [
      {
        title: 'Mensajes sin responder',
        description:
          'Mientras atiendes a una clienta en el sillón, los mensajes de WhatsApp se acumulan y algunas citas se pierden.',
      },
      {
        title: 'Siempre las mismas preguntas',
        description:
          'Precios de tinte, horarios y disponibilidad se repiten todo el día y consumen tiempo del equipo.',
      },
      {
        title: 'Agenda desordenada',
        description:
          'Las citas llegan por chat, llamadas y notas sueltas, y es difícil saber quién viene y a qué hora.',
      },
      {
        title: 'Audios sin escuchar',
        description:
          'Las clientas mandan audios describiendo lo que quieren y quedan sin revisar hasta el final del día.',
      },
    ],
    capabilities: [
      'Responde precios y servicios frecuentes al instante.',
      'Toma solicitudes de cita indicando servicio y horario preferido.',
      'Consulta disponibilidad y confirma con tu equipo.',
      'Procesa audios donde la clienta explica lo que desea.',
      'Registra cada conversación en el panel para dar seguimiento.',
      'Escala al equipo cuando la clienta pide atención personalizada.',
    ],
    examples: [
      {
        client: 'Hola, ¿tienen disponibilidad para tinte mañana?',
        agent: 'Claro, puedo ayudarte. ¿Prefieres mañana en la mañana o en la tarde?',
      },
      {
        client: '¿Cuánto cuesta un corte con lavado?',
        agent:
          'Te oriento con la información disponible y, si necesitas algo especial, paso tu solicitud al equipo.',
      },
      {
        client: '(Audio) Quiero algo para las uñas para un evento el sábado…',
        agent:
          'Escuché tu audio. Te propongo opciones de manicure y reviso disponibilidad para el sábado.',
      },
    ],
    whyItWorks: [
      'Respuestas rápidas incluso cuando el equipo está atendiendo.',
      'Menos citas perdidas por mensajes sin contestar.',
      'Agenda y solicitudes organizadas en un solo panel.',
      'El equipo se enfoca en el servicio, no en repetir precios.',
    ],
    recommendedFeatures: ['appointments', 'catalog', 'audio', 'inbox', 'handoff', 'dashboard'],
    visual: 'beauty',
    tags: ['Corte', 'Tinte', 'Uñas', 'Facial'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu salón de belleza?',
    seoTitle: 'Agentes IA para salones de belleza | Sendwary',
    seoDescription:
      'Automatiza WhatsApp en tu salón de belleza con agentes IA: citas, respuestas frecuentes, audios, panel de conversaciones e intervención humana.',
  },
  {
    slug: 'peluquerias',
    categoryId: 'belleza-y-bienestar',
    category: 'Belleza y bienestar',
    title: 'Agentes IA para peluquerías',
    headline: 'Agenda cortes y turnos, responde precios y confirma horarios por WhatsApp',
    description:
      'Recibe solicitudes de turno para corte o barba, responde precios y horarios, confirma disponibilidad y deja que tu equipo intervenga cuando haga falta ajustar una cita.',
    painPoints: [
      {
        title: 'Turnos por teléfono todo el día',
        description:
          'Interrumpes el corte para contestar cada llamada o mensaje pidiendo turno.',
      },
      {
        title: 'Reagendar es un caos',
        description:
          'Los clientes cancelan o mueven turnos por chat y el horario queda desactualizado.',
      },
      {
        title: 'Preguntas de precio repetidas',
        description: 'Corte, barba y combos se preguntan una y otra vez.',
      },
    ],
    capabilities: [
      'Toma solicitudes de turno para corte, barba o ambos.',
      'Responde precios y servicios frecuentes.',
      'Confirma horario o barbero disponible con tu equipo.',
      'Ayuda a reagendar turnos sin perder el hilo de la conversación.',
      'Registra cada turno solicitado en el panel.',
    ],
    examples: [
      {
        client: '¿Tienen turno para corte y barba hoy?',
        agent: 'Puedo tomar tu solicitud. ¿A qué hora te queda mejor pasar?',
      },
      {
        client: 'Necesito mover mi turno de las 4 para más tarde.',
        agent: 'Con gusto reviso disponibilidad más tarde y lo confirmo con el equipo.',
      },
    ],
    whyItWorks: [
      'Menos interrupciones mientras atiendes a un cliente.',
      'Turnos organizados y fáciles de confirmar.',
      'Respuestas inmediatas de precios y horarios.',
      'Seguimiento a clientes que quieren reagendar.',
    ],
    recommendedFeatures: ['appointments', 'inbox', 'catalog', 'handoff', 'dashboard'],
    visual: 'beauty',
    tags: ['Corte', 'Barba', 'Cejas', 'Turnos'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu peluquería?',
    seoTitle: 'Agentes IA para peluquerías | Sendwary',
    seoDescription:
      'Gestiona turnos de corte y barba por WhatsApp con agentes IA: precios, horarios, reagendar y panel de conversaciones con intervención humana.',
  },
  {
    slug: 'spas',
    categoryId: 'belleza-y-bienestar',
    category: 'Belleza y bienestar',
    title: 'Agentes IA para spas y centros estéticos',
    headline: 'Organiza citas, paquetes y tratamientos, y responde consultas por WhatsApp',
    description:
      'Recibe solicitudes de citas para masajes, faciales o paquetes, responde consultas frecuentes, envía recordatorios y deja que tu equipo confirme los detalles de cada tratamiento.',
    painPoints: [
      {
        title: 'Consultas largas antes de reservar',
        description:
          'Los clientes preguntan por tratamientos, duración y paquetes antes de decidir.',
      },
      {
        title: 'Citas de paquetes difíciles de coordinar',
        description:
          'Paquetes para parejas o sesiones múltiples requieren coordinar varios horarios.',
      },
      {
        title: 'Sin recordatorios',
        description: 'Las citas se olvidan y aumentan las ausencias.',
      },
    ],
    capabilities: [
      'Explica tratamientos y paquetes disponibles.',
      'Toma solicitudes de cita indicando servicio y horario.',
      'Coordina paquetes para parejas o sesiones múltiples con tu equipo.',
      'Apoya con recordatorios de cita por WhatsApp.',
      'Registra cada solicitud en el panel de conversaciones.',
    ],
    examples: [
      {
        client: '¿Tienen paquete de masaje para parejas?',
        agent:
          'Sí, puedo darte la información del paquete y tomar tu solicitud de cita. ¿Para qué día lo piensan?',
      },
      {
        client: 'Quisiera un facial esta semana en la tarde.',
        agent: 'Perfecto, reviso disponibilidad de facial por la tarde y lo confirmo con el equipo.',
      },
    ],
    whyItWorks: [
      'Respuestas claras sobre tratamientos y paquetes.',
      'Citas y paquetes mejor coordinados.',
      'Menos ausencias gracias a recordatorios.',
      'Seguimiento ordenado de cada cliente.',
    ],
    recommendedFeatures: ['appointments', 'catalog', 'inbox', 'handoff', 'dashboard'],
    visual: 'beauty',
    tags: ['Masaje', 'Facial', 'Paquetes', 'Parejas'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu spa o centro estético?',
    seoTitle: 'Agentes IA para spas y centros estéticos | Sendwary',
    seoDescription:
      'Automatiza citas, paquetes y consultas de tu spa por WhatsApp con agentes IA, recordatorios, panel de conversaciones e intervención humana.',
  },

  /* ===================== Salud y clínicas ===================== */
  {
    slug: 'clinicas',
    categoryId: 'salud-y-clinicas',
    category: 'Salud y clínicas',
    title: 'Agentes IA para clínicas',
    headline: 'Recibe solicitudes de consulta y organiza información por WhatsApp',
    description:
      'El agente IA ayuda a recibir solicitudes de consulta, captar datos iniciales y coordinar horarios, dejando la valoración clínica en manos de tu personal autorizado.',
    disclaimer:
      'La IA puede ayudar a recibir solicitudes y organizar información, pero la atención médica debe ser validada por personal autorizado. No realiza diagnósticos.',
    painPoints: [
      {
        title: 'Recepción saturada',
        description:
          'El personal de recepción no da abasto entre llamadas, mensajes y pacientes presentes.',
      },
      {
        title: 'Datos incompletos',
        description:
          'Las solicitudes llegan sin nombre, motivo o horario preferido y hay que preguntar todo de nuevo.',
      },
      {
        title: 'Horarios difíciles de coordinar',
        description: 'Coordinar disponibilidad por chat toma varios mensajes de ida y vuelta.',
      },
    ],
    capabilities: [
      'Recibe solicitudes de consulta y capta datos iniciales.',
      'Pregunta nombre, motivo general y horario preferido.',
      'Responde información general de horarios y ubicación.',
      'Deriva cada solicitud al equipo para confirmación.',
      'Escala de inmediato los casos que requieren atención humana.',
    ],
    examples: [
      {
        client: 'Quiero una consulta para esta semana.',
        agent: 'Con gusto. ¿Me indicas tu nombre, motivo de consulta y horario preferido?',
      },
      {
        client: '¿Atienden por la tarde?',
        agent:
          'Te comparto la información general de horarios y dejo tu solicitud para que el equipo confirme la cita.',
      },
    ],
    whyItWorks: [
      'Menos carga para el personal de recepción.',
      'Solicitudes completas y organizadas.',
      'Coordinación de horarios más ágil.',
      'El equipo humano valida y confirma cada caso.',
    ],
    recommendedFeatures: ['leads', 'appointments', 'inbox', 'handoff', 'dashboard'],
    visual: 'health',
    tags: ['Consulta', 'Horarios', 'Datos', 'Derivación'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu clínica?',
    seoTitle: 'Agentes IA para clínicas | Sendwary',
    seoDescription:
      'Recibe solicitudes de consulta, capta datos iniciales y coordina horarios por WhatsApp con agentes IA e intervención humana. Sin diagnósticos automáticos.',
  },
  {
    slug: 'consultorios',
    categoryId: 'salud-y-clinicas',
    category: 'Salud y clínicas',
    title: 'Agentes IA para consultorios',
    headline: 'Organiza citas y datos básicos, y deja la confirmación en tu equipo',
    description:
      'El agente IA toma solicitudes de cita, captura el motivo de consulta y datos básicos, y deriva al equipo para confirmar, sin reemplazar la valoración profesional.',
    disclaimer:
      'La IA organiza solicitudes e información. La confirmación y la atención las realiza el personal autorizado del consultorio.',
    painPoints: [
      {
        title: 'Agenda compartida por chat',
        description: 'Coordinar citas entre paciente y consultorio consume mensajes y tiempo.',
      },
      {
        title: 'Motivo de consulta poco claro',
        description: 'Sin el motivo previo, es difícil preparar la cita.',
      },
      {
        title: 'Mensajes fuera de horario',
        description: 'Los pacientes escriben a cualquier hora y quedan sin respuesta.',
      },
    ],
    capabilities: [
      'Toma solicitudes de cita con horario preferido.',
      'Captura motivo de consulta y datos básicos.',
      'Responde consultas frecuentes de horario y ubicación.',
      'Deriva al equipo para confirmar la cita.',
      'Atiende fuera de horario y deja todo registrado en el panel.',
    ],
    examples: [
      {
        client: 'Necesito una cita, ¿qué días atienden?',
        agent: 'Con gusto. ¿Me compartes tu nombre, el motivo de consulta y el horario que prefieres?',
      },
      {
        client: 'Escribo tarde, ¿alguien me lee?',
        agent: 'Tomo tu solicitud ahora y el equipo la confirma en horario de atención.',
      },
    ],
    whyItWorks: [
      'Citas y datos organizados antes de la consulta.',
      'Atención incluso fuera de horario.',
      'Menos mensajes de ida y vuelta.',
      'El equipo confirma y valida cada cita.',
    ],
    recommendedFeatures: ['appointments', 'leads', 'inbox', 'handoff', 'dashboard'],
    visual: 'health',
    tags: ['Cita', 'Motivo', 'Datos', 'Confirmación'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu consultorio?',
    seoTitle: 'Agentes IA para consultorios | Sendwary',
    seoDescription:
      'Gestiona citas y datos básicos de tu consultorio por WhatsApp con agentes IA, motivo de consulta, panel de conversaciones e intervención humana.',
  },
  {
    slug: 'odontologia',
    categoryId: 'salud-y-clinicas',
    category: 'Salud y clínicas',
    title: 'Agentes IA para centros odontológicos',
    headline: 'Agenda limpiezas y tratamientos, y prioriza casos urgentes por WhatsApp',
    description:
      'El agente IA recibe solicitudes de citas para limpiezas, brackets o tratamientos, orienta con presupuestos iniciales y escala los casos urgentes a tu equipo.',
    disclaimer:
      'La IA orienta y organiza solicitudes. El diagnóstico y el presupuesto definitivo los realiza el personal odontológico autorizado.',
    painPoints: [
      {
        title: 'Urgencias mezcladas con consultas',
        description: 'Un dolor urgente puede quedar perdido entre preguntas generales.',
      },
      {
        title: 'Presupuestos preguntados a cada rato',
        description: 'Limpieza, brackets y blanqueamiento generan las mismas preguntas de precio.',
      },
      {
        title: 'Citas sin confirmar',
        description: 'Sin recordatorios, aumentan las ausencias.',
      },
    ],
    capabilities: [
      'Toma solicitudes de cita para limpiezas, brackets y tratamientos.',
      'Orienta con presupuestos iniciales de referencia.',
      'Identifica y escala casos urgentes al equipo.',
      'Apoya con recordatorios de cita.',
      'Registra cada solicitud en el panel.',
    ],
    examples: [
      {
        client: 'Tengo un dolor fuerte desde anoche.',
        agent:
          'Lo marco como caso prioritario y aviso al equipo para buscarte un espacio lo antes posible.',
      },
      {
        client: '¿Cuánto cuesta una limpieza?',
        agent:
          'Te doy un rango de referencia y, para el presupuesto final, el equipo lo confirma según tu caso.',
      },
    ],
    whyItWorks: [
      'Los casos urgentes se atienden primero.',
      'Respuestas rápidas de presupuestos de referencia.',
      'Menos ausencias con recordatorios.',
      'El equipo valida cada tratamiento.',
    ],
    recommendedFeatures: ['appointments', 'quotes', 'inbox', 'handoff', 'dashboard'],
    visual: 'health',
    tags: ['Limpieza', 'Brackets', 'Urgencias', 'Presupuesto'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu centro odontológico?',
    seoTitle: 'Agentes IA para centros odontológicos | Sendwary',
    seoDescription:
      'Agenda limpiezas, brackets y tratamientos por WhatsApp con agentes IA, presupuestos de referencia, prioridad de urgencias e intervención humana.',
  },

  /* ===================== Ferreterías y construcción ===================== */
  {
    slug: 'ferreterias',
    categoryId: 'ferreterias-y-construccion',
    category: 'Ferreterías y construcción',
    title: 'Agentes IA para ferreterías',
    headline: 'Responde disponibilidad de productos y toma cotizaciones por WhatsApp',
    description:
      'El agente IA responde consultas de productos, ayuda a tomar solicitudes de cotización, procesa audios con listas de materiales y organiza las conversaciones comerciales del día.',
    painPoints: [
      {
        title: 'Consultas de productos sin parar',
        description:
          'Cemento, pintura, tornillos: los clientes preguntan precio y disponibilidad todo el día.',
      },
      {
        title: 'Cotizaciones desordenadas',
        description: 'Las solicitudes llegan por chat y es difícil dar seguimiento a cada una.',
      },
      {
        title: 'Audios con listas de materiales',
        description: 'Los clientes mandan audios largos con varios productos que hay que anotar.',
      },
    ],
    capabilities: [
      'Responde consultas de productos y disponibilidad.',
      'Toma solicitudes de cotización con productos y cantidades.',
      'Procesa audios con listas de materiales.',
      'Se apoya en el catálogo para orientar al cliente.',
      'Organiza cada solicitud comercial en el panel.',
      'Escala al equipo para cerrar la venta.',
    ],
    examples: [
      {
        client: 'Necesito precio de cemento y varillas.',
        agent: 'Puedo ayudarte a tomar la solicitud. ¿Qué cantidad necesitas de cada uno?',
      },
      {
        client: '(Audio) Anótame 5 galones de pintura blanca, brochas y lija…',
        agent: 'Escuché tu audio y armo la lista para preparar tu cotización.',
      },
    ],
    whyItWorks: [
      'Respuestas inmediatas de productos y precios.',
      'Solicitudes de cotización organizadas.',
      'Audios convertidos en listas claras.',
      'El equipo cierra ventas con la info ya lista.',
    ],
    recommendedFeatures: ['quotes', 'catalog', 'audio', 'inbox', 'handoff', 'integrations'],
    visual: 'hardware',
    tags: ['Cemento', 'Pintura', 'Tornillos', 'Cotización'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu ferretería?',
    seoTitle: 'Agentes IA para ferreterías | Sendwary',
    seoDescription:
      'Responde consultas de productos y toma cotizaciones por WhatsApp con agentes IA, catálogo, procesamiento de audios y panel de conversaciones.',
  },
  {
    slug: 'materiales-de-construccion',
    categoryId: 'ferreterias-y-construccion',
    category: 'Ferreterías y construcción',
    title: 'Agentes IA para materiales de construcción',
    headline: 'Toma cotizaciones por volumen y organiza solicitudes de entrega por WhatsApp',
    description:
      'El agente IA recibe solicitudes de cotización por volumen, responde disponibilidad, organiza listas de materiales y prepara la información de entrega para que tu equipo la cierre.',
    disclaimer:
      'Las conexiones con inventario o sistemas de gestión se evalúan bajo requerimiento. No son automáticas.',
    painPoints: [
      {
        title: 'Cotizaciones de gran volumen',
        description: 'Pedidos grandes requieren tomar bien cantidades, medidas y condiciones.',
      },
      {
        title: 'Preguntas de entrega constantes',
        description: 'Los clientes preguntan por disponibilidad y tiempos de entrega.',
      },
      {
        title: 'Listas de materiales largas',
        description: 'Las obras piden decenas de productos difíciles de organizar por chat.',
      },
    ],
    capabilities: [
      'Toma solicitudes de cotización por volumen.',
      'Organiza listas de materiales con cantidades.',
      'Responde disponibilidad y condiciones generales.',
      'Prepara datos de entrega para el equipo.',
      'Deja lista la información para una posible integración con inventario.',
    ],
    examples: [
      {
        client: 'Necesito cotizar 200 bloques y 30 sacos de cemento.',
        agent: 'Perfecto, armo la lista con esas cantidades y la paso a cotización con el equipo.',
      },
      {
        client: '¿Hacen entrega a obra?',
        agent: 'Tomo los datos de tu obra y el equipo confirma disponibilidad y tiempos de entrega.',
      },
    ],
    whyItWorks: [
      'Cotizaciones grandes bien tomadas desde el inicio.',
      'Listas de materiales organizadas.',
      'Información de entrega lista para el equipo.',
      'Base preparada para integrar inventario a futuro.',
    ],
    recommendedFeatures: ['quotes', 'catalog', 'inbox', 'handoff', 'integrations', 'dashboard'],
    visual: 'hardware',
    tags: ['Cemento', 'Varillas', 'Volumen', 'Entrega'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu venta de materiales?',
    seoTitle: 'Agentes IA para materiales de construcción | Sendwary',
    seoDescription:
      'Toma cotizaciones por volumen y organiza entregas por WhatsApp con agentes IA, listas de materiales, panel de conversaciones e integraciones bajo requerimiento.',
  },

  /* ===================== Repuestos y talleres ===================== */
  {
    slug: 'repuestos',
    categoryId: 'repuestos-y-talleres',
    category: 'Repuestos y talleres',
    title: 'Agentes IA para venta de repuestos',
    headline: 'Captura datos del vehículo y la pieza requerida para cotizar por WhatsApp',
    description:
      'El agente IA captura los datos del vehículo y la pieza que busca el cliente, recibe fotos o audios, prepara la cotización y da seguimiento hasta que tu equipo confirme disponibilidad.',
    painPoints: [
      {
        title: 'Piezas equivocadas',
        description: 'Sin datos del vehículo, se cotiza la pieza incorrecta y se pierde la venta.',
      },
      {
        title: 'Fotos y audios sin procesar',
        description: 'Los clientes mandan fotos de la pieza o audios que quedan sin revisar.',
      },
      {
        title: 'Disponibilidad difícil de responder',
        description: 'Confirmar si hay stock toma tiempo y el cliente se va con otro.',
      },
    ],
    capabilities: [
      'Captura marca, modelo, año y motor del vehículo.',
      'Registra la pieza requerida a partir de texto, foto o audio.',
      'Prepara la solicitud de cotización para el equipo.',
      'Da seguimiento mientras se confirma disponibilidad.',
      'Organiza cada solicitud en el panel de conversaciones.',
    ],
    examples: [
      {
        client: 'Busco un alternador para Corolla 2014.',
        agent: 'Perfecto. ¿Me confirmas el motor o la placa para validar la pieza correcta?',
      },
      {
        client: '(Foto) ¿Tienen esta pieza?',
        agent: 'Recibí la foto. Registro la pieza y el vehículo para revisarte la disponibilidad.',
      },
    ],
    whyItWorks: [
      'Menos errores al identificar la pieza.',
      'Fotos y audios convertidos en solicitudes claras.',
      'Cotizaciones más rápidas de preparar.',
      'Seguimiento que evita perder la venta.',
    ],
    recommendedFeatures: ['quotes', 'catalog', 'audio', 'leads', 'inbox', 'handoff'],
    visual: 'automotive',
    tags: ['Vehículo', 'Pieza', 'Cotización', 'Disponibilidad'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu venta de repuestos?',
    seoTitle: 'Agentes IA para venta de repuestos | Sendwary',
    seoDescription:
      'Captura datos del vehículo y la pieza requerida por WhatsApp con agentes IA, fotos, audios, cotizaciones y seguimiento con intervención humana.',
  },
  {
    slug: 'talleres',
    categoryId: 'repuestos-y-talleres',
    category: 'Repuestos y talleres',
    title: 'Agentes IA para talleres automotrices',
    headline: 'Agenda servicios, capta datos del vehículo y da seguimiento por WhatsApp',
    description:
      'El agente IA recibe solicitudes de cita de servicio, capta los datos del vehículo y una descripción preliminar del problema, y deja el diagnóstico definitivo en manos de tu equipo técnico.',
    disclaimer:
      'El agente IA toma solicitudes y datos preliminares. El diagnóstico técnico definitivo lo realiza el personal del taller.',
    painPoints: [
      {
        title: 'Citas de servicio desorganizadas',
        description: 'Las solicitudes llegan por chat y llamadas sin un orden claro.',
      },
      {
        title: 'Descripción del problema incompleta',
        description: 'Sin datos previos, cada ingreso empieza desde cero.',
      },
      {
        title: 'Falta de seguimiento',
        description: 'Los clientes no reciben recordatorios ni avisos de su servicio.',
      },
    ],
    capabilities: [
      'Toma solicitudes de cita de servicio.',
      'Capta marca, modelo, año y una descripción preliminar.',
      'Orienta con información general, sin diagnóstico definitivo.',
      'Apoya con recordatorios y seguimiento del servicio.',
      'Escala al equipo técnico para confirmar y diagnosticar.',
    ],
    examples: [
      {
        client: 'El carro hace un ruido al frenar, ¿pueden revisarlo?',
        agent:
          'Tomo tu solicitud y los datos del vehículo. El diagnóstico exacto lo confirma el equipo en el taller. ¿Qué día te queda bien?',
      },
      {
        client: '¿Cuándo tienen espacio esta semana?',
        agent: 'Reviso disponibilidad de citas y te confirmo con el equipo.',
      },
    ],
    whyItWorks: [
      'Citas de servicio ordenadas.',
      'Datos del vehículo listos antes del ingreso.',
      'Seguimiento y recordatorios al cliente.',
      'El equipo técnico confirma el diagnóstico.',
    ],
    recommendedFeatures: ['appointments', 'leads', 'inbox', 'handoff', 'dashboard'],
    visual: 'automotive',
    tags: ['Cita', 'Vehículo', 'Servicio', 'Seguimiento'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu taller automotriz?',
    seoTitle: 'Agentes IA para talleres automotrices | Sendwary',
    seoDescription:
      'Agenda servicios y capta datos del vehículo por WhatsApp con agentes IA, seguimiento y panel de conversaciones. El diagnóstico lo confirma tu equipo.',
  },

  /* ===================== Restaurantes y comida ===================== */
  {
    slug: 'restaurantes',
    categoryId: 'restaurantes-y-comida',
    category: 'Restaurantes y comida',
    title: 'Agentes IA para restaurantes',
    headline: 'Responde menú, horarios y reservas, y toma pedidos por WhatsApp',
    description:
      'El agente IA responde preguntas de menú, horarios y ubicación, toma solicitudes de reserva y pedidos, y escala al equipo cuando el cliente necesita algo especial.',
    painPoints: [
      {
        title: 'Preguntas repetidas de siempre',
        description: 'Horario, ubicación y menú se preguntan decenas de veces al día.',
      },
      {
        title: 'Reservas por varios canales',
        description: 'Reservas por chat, llamada y en persona que no están en un solo lugar.',
      },
      {
        title: 'Pedidos en horas pico',
        description: 'En el momento de mayor demanda, los mensajes quedan sin responder.',
      },
    ],
    capabilities: [
      'Responde menú, horarios y ubicación al instante.',
      'Toma solicitudes de reserva con fecha y número de personas.',
      'Recibe pedidos y los organiza para el equipo.',
      'Responde preguntas frecuentes de promociones.',
      'Escala al equipo los casos especiales.',
    ],
    examples: [
      {
        client: '¿Tienen menú de hoy?',
        agent: 'Sí, puedo enviarte las opciones disponibles y tomar tu solicitud.',
      },
      {
        client: 'Quiero reservar para 4 personas el viernes.',
        agent: 'Con gusto. Tomo tu reserva para el viernes y el equipo la confirma.',
      },
    ],
    whyItWorks: [
      'Respuestas inmediatas incluso en horas pico.',
      'Reservas y pedidos en un solo panel.',
      'Menos preguntas repetidas para el equipo.',
      'Clientes atendidos aunque el local esté lleno.',
    ],
    recommendedFeatures: ['catalog', 'appointments', 'inbox', 'handoff', 'dashboard'],
    visual: 'food',
    tags: ['Menú', 'Reservas', 'Horarios', 'Ubicación'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu restaurante?',
    seoTitle: 'Agentes IA para restaurantes | Sendwary',
    seoDescription:
      'Responde menú, horarios y reservas por WhatsApp con agentes IA, pedidos, preguntas frecuentes y panel de conversaciones con intervención humana.',
  },
  {
    slug: 'cafeterias',
    categoryId: 'restaurantes-y-comida',
    category: 'Restaurantes y comida',
    title: 'Agentes IA para cafeterías',
    headline: 'Comparte el menú del día, toma pedidos y anuncia promociones por WhatsApp',
    description:
      'El agente IA comparte el menú del día, responde horarios, toma pedidos pequeños y difunde promociones, dejando que tu equipo confirme lo que haga falta.',
    painPoints: [
      {
        title: 'Menú del día que cambia',
        description: 'Cada día hay que repetir el menú y las opciones disponibles.',
      },
      {
        title: 'Pedidos pequeños que se pierden',
        description: 'Mensajes de pedidos rápidos quedan sin responder en la mañana.',
      },
      {
        title: 'Promociones sin difundir',
        description: 'Las promos no llegan a los clientes de forma ordenada.',
      },
    ],
    capabilities: [
      'Comparte el menú del día y opciones disponibles.',
      'Toma pedidos pequeños para llevar o consumo.',
      'Responde horarios y preguntas frecuentes.',
      'Difunde promociones a quien consulta.',
      'Organiza los pedidos en el panel.',
    ],
    examples: [
      {
        client: '¿Qué tienen hoy?',
        agent: 'Te comparto el menú del día y las opciones disponibles. ¿Deseas ordenar algo?',
      },
      {
        client: '¿Tienen promo de café?',
        agent: 'Sí, te cuento la promoción de hoy y tomo tu pedido si deseas.',
      },
    ],
    whyItWorks: [
      'Menú del día siempre a la mano del cliente.',
      'Pedidos rápidos sin perder mensajes.',
      'Promociones difundidas de forma ordenada.',
      'Equipo enfocado en atender el mostrador.',
    ],
    recommendedFeatures: ['catalog', 'inbox', 'audio', 'handoff', 'dashboard'],
    visual: 'food',
    tags: ['Menú del día', 'Pedidos', 'Promos', 'Horarios'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu cafetería?',
    seoTitle: 'Agentes IA para cafeterías | Sendwary',
    seoDescription:
      'Comparte el menú del día, toma pedidos y difunde promociones por WhatsApp con agentes IA, horarios y panel de conversaciones.',
  },
  {
    slug: 'comida-rapida',
    categoryId: 'restaurantes-y-comida',
    category: 'Restaurantes y comida',
    title: 'Agentes IA para comida rápida',
    headline: 'Toma pedidos de combos y coordina delivery o pickup por WhatsApp',
    description:
      'El agente IA responde el menú y los combos, toma pedidos, coordina si es delivery o pickup y da respuestas rápidas en los momentos de mayor demanda.',
    painPoints: [
      {
        title: 'Pedidos en avalancha',
        description: 'En horas pico llegan más pedidos por chat de los que se pueden leer.',
      },
      {
        title: 'Confusión entre delivery y pickup',
        description: 'No queda claro si el pedido es para recoger o para envío.',
      },
      {
        title: 'Combos preguntados a cada rato',
        description: 'Los clientes piden el detalle de combos una y otra vez.',
      },
    ],
    capabilities: [
      'Responde menú y combos disponibles.',
      'Toma pedidos con detalle de productos.',
      'Confirma si es delivery o pickup y toma la dirección.',
      'Da respuestas rápidas en horas pico.',
      'Organiza cada pedido en el panel.',
    ],
    examples: [
      {
        client: 'Quiero el combo 2 para llevar.',
        agent: '¡Listo! Tomo tu combo 2 para pickup. ¿A nombre de quién lo preparo?',
      },
      {
        client: '¿Hacen delivery a mi zona?',
        agent: 'Tomo tu dirección y el equipo confirma si llegamos a tu zona y el tiempo estimado.',
      },
    ],
    whyItWorks: [
      'Pedidos atendidos incluso en horas pico.',
      'Menos errores entre delivery y pickup.',
      'Combos respondidos al instante.',
      'Equipo enfocado en cocinar y despachar.',
    ],
    recommendedFeatures: ['catalog', 'inbox', 'handoff', 'dashboard'],
    visual: 'food',
    tags: ['Combos', 'Pedidos', 'Delivery', 'Pickup'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu negocio de comida rápida?',
    seoTitle: 'Agentes IA para comida rápida | Sendwary',
    seoDescription:
      'Toma pedidos de combos y coordina delivery o pickup por WhatsApp con agentes IA, respuestas rápidas y panel de conversaciones.',
  },

  /* ===================== Tiendas y retail ===================== */
  {
    slug: 'tiendas',
    categoryId: 'tiendas-y-retail',
    category: 'Tiendas y retail',
    title: 'Agentes IA para tiendas',
    headline: 'Responde productos, precios y disponibilidad, y da seguimiento por WhatsApp',
    description:
      'El agente IA responde preguntas sobre productos, precios y disponibilidad, se apoya en tu catálogo y da seguimiento a cada cliente hasta cerrar con tu equipo.',
    painPoints: [
      {
        title: 'Preguntas de productos constantes',
        description: 'Precio, disponibilidad y características se preguntan sin parar.',
      },
      {
        title: 'Clientes sin seguimiento',
        description: 'Muchos preguntan y no vuelven porque nadie les dio seguimiento.',
      },
      {
        title: 'Catálogo disperso',
        description: 'La información de productos está en varios lugares y no siempre a la mano.',
      },
    ],
    capabilities: [
      'Responde precios, disponibilidad y características.',
      'Se apoya en el catálogo de productos.',
      'Toma solicitudes y prepara cotizaciones simples.',
      'Da seguimiento a clientes interesados.',
      'Organiza cada conversación en el panel.',
    ],
    examples: [
      {
        client: '¿Tienen este producto disponible?',
        agent: 'Puedo ayudarte. Envíame el nombre o una foto del producto que buscas.',
      },
      {
        client: '¿Cuánto cuesta y me lo apartan?',
        agent: 'Te doy el precio y tomo tu solicitud para que el equipo te lo aparte.',
      },
    ],
    whyItWorks: [
      'Respuestas inmediatas de productos y precios.',
      'Seguimiento que recupera clientes interesados.',
      'Catálogo organizado y a la mano.',
      'Equipo enfocado en cerrar ventas.',
    ],
    recommendedFeatures: ['catalog', 'quotes', 'inbox', 'handoff', 'dashboard'],
    visual: 'retail',
    tags: ['Productos', 'Precios', 'Stock', 'Seguimiento'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu tienda?',
    seoTitle: 'Agentes IA para tiendas | Sendwary',
    seoDescription:
      'Responde productos, precios y disponibilidad por WhatsApp con agentes IA, catálogo, seguimiento y panel de conversaciones con intervención humana.',
  },
  {
    slug: 'ecommerce',
    categoryId: 'tiendas-y-retail',
    category: 'Tiendas y retail',
    title: 'Agentes IA para ecommerce',
    headline: 'Resuelve consultas de producto y da seguimiento comercial por WhatsApp',
    description:
      'El agente IA responde consultas de producto y preguntas frecuentes, capta clientes potenciales y da seguimiento comercial. La conexión con tu tienda online se evalúa bajo requerimiento.',
    disclaimer:
      'La integración con tu tienda online o el estado de pedidos se evalúa bajo requerimiento. No es automática ni inmediata.',
    painPoints: [
      {
        title: 'Consultas antes de comprar',
        description: 'Los clientes preguntan por productos y condiciones antes de decidir.',
      },
      {
        title: 'Carritos que no se cierran',
        description: 'Sin seguimiento, muchas consultas no terminan en compra.',
      },
      {
        title: 'Preguntas frecuentes repetidas',
        description: 'Envíos, pagos y devoluciones se preguntan constantemente.',
      },
    ],
    capabilities: [
      'Responde consultas de producto y preguntas frecuentes.',
      'Capta clientes potenciales y sus datos.',
      'Da seguimiento comercial a interesados.',
      'Responde dudas de envíos, pagos y devoluciones.',
      'Deja preparada una posible integración bajo requerimiento.',
    ],
    examples: [
      {
        client: '¿Este producto viene en otro color?',
        agent: 'Reviso las opciones disponibles y te comparto colores y precio.',
      },
      {
        client: '¿Puedo saber el estado de mi pedido?',
        agent:
          'Tomo tu número de pedido y lo dejo para seguimiento; la consulta automática depende de la integración con tu tienda.',
      },
    ],
    whyItWorks: [
      'Consultas resueltas al instante.',
      'Más ventas gracias al seguimiento comercial.',
      'Preguntas frecuentes automatizadas.',
      'Base lista para integrar tu tienda a futuro.',
    ],
    recommendedFeatures: ['catalog', 'leads', 'inbox', 'integrations', 'handoff', 'dashboard'],
    visual: 'retail',
    tags: ['Producto', 'Pedido', 'FAQ', 'Seguimiento'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu ecommerce?',
    seoTitle: 'Agentes IA para ecommerce | Sendwary',
    seoDescription:
      'Resuelve consultas de producto y da seguimiento comercial por WhatsApp con agentes IA, preguntas frecuentes e integraciones bajo requerimiento.',
  },
  {
    slug: 'moda',
    categoryId: 'tiendas-y-retail',
    category: 'Tiendas y retail',
    title: 'Agentes IA para moda y accesorios',
    headline: 'Responde tallas, colores y disponibilidad, y comparte catálogo por WhatsApp',
    description:
      'El agente IA responde preguntas de tallas, colores y disponibilidad, comparte fotos del catálogo y da seguimiento a cada cliente interesado.',
    painPoints: [
      {
        title: 'Tallas y colores sin parar',
        description: 'Cada prenda genera preguntas de talla, color y disponibilidad.',
      },
      {
        title: 'Fotos pedidas una y otra vez',
        description: 'Los clientes piden ver más fotos o combinaciones del producto.',
      },
      {
        title: 'Clientes que no vuelven',
        description: 'Sin seguimiento, muchas consultas quedan sin cerrar.',
      },
    ],
    capabilities: [
      'Responde tallas, colores y disponibilidad.',
      'Comparte fotos del catálogo.',
      'Toma solicitudes de apartado o compra.',
      'Da seguimiento a clientes interesados.',
      'Organiza las conversaciones en el panel.',
    ],
    examples: [
      {
        client: '¿Tienen este vestido en talla M?',
        agent: 'Reviso disponibilidad en talla M y te confirmo colores y precio.',
      },
      {
        client: '¿Me mandas más fotos?',
        agent: 'Con gusto, te comparto más fotos del catálogo y tomo tu solicitud si te decides.',
      },
    ],
    whyItWorks: [
      'Respuestas rápidas de tallas y colores.',
      'Catálogo y fotos siempre a la mano.',
      'Seguimiento que recupera clientes.',
      'Conversaciones ordenadas por cliente.',
    ],
    recommendedFeatures: ['catalog', 'inbox', 'audio', 'handoff', 'dashboard'],
    visual: 'retail',
    tags: ['Tallas', 'Colores', 'Stock', 'Catálogo'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu tienda de moda?',
    seoTitle: 'Agentes IA para moda y accesorios | Sendwary',
    seoDescription:
      'Responde tallas, colores y disponibilidad por WhatsApp con agentes IA, catálogo con fotos, seguimiento y panel de conversaciones.',
  },

  /* ===================== Servicios profesionales ===================== */
  {
    slug: 'firmas-contables',
    categoryId: 'servicios-profesionales',
    category: 'Servicios profesionales',
    title: 'Agentes IA para firmas contables',
    headline: 'Capta solicitudes, agenda consultas y organiza documentos por WhatsApp',
    description:
      'El agente IA capta solicitudes, informa sobre tus servicios, agenda consultas y ayuda a organizar la documentación, dejando la asesoría profesional en manos de tu equipo.',
    disclaimer:
      'La IA orienta y recopila información. La asesoría contable o fiscal debe ser validada por el equipo profesional autorizado.',
    painPoints: [
      {
        title: 'Solicitudes sin clasificar',
        description: 'Llegan consultas de todo tipo sin saber qué servicio necesita cada quien.',
      },
      {
        title: 'Agenda de consultas dispersa',
        description: 'Coordinar reuniones por chat consume tiempo del equipo.',
      },
      {
        title: 'Documentos que faltan',
        description: 'Los clientes no saben qué documentación enviar para empezar.',
      },
    ],
    capabilities: [
      'Capta solicitudes y clasifica el tipo de servicio.',
      'Informa sobre servicios de forma general.',
      'Agenda consultas con el equipo profesional.',
      'Orienta sobre qué documentación se necesita.',
      'Da seguimiento y registra todo en el panel.',
    ],
    examples: [
      {
        client: 'Necesito información sobre sus servicios.',
        agent: 'Con gusto. ¿Qué tipo de servicio necesitas y para cuándo? Así preparo tu solicitud.',
      },
      {
        client: '¿Me pueden ayudar con la declaración?',
        agent:
          'Tomo tu solicitud y agendo una consulta; la asesoría final la brinda nuestro equipo profesional.',
      },
    ],
    whyItWorks: [
      'Solicitudes clasificadas desde el primer mensaje.',
      'Consultas agendadas sin fricción.',
      'Documentación orientada de antemano.',
      'El equipo profesional valida cada caso.',
    ],
    recommendedFeatures: ['leads', 'appointments', 'inbox', 'handoff', 'dashboard'],
    visual: 'professional',
    tags: ['Servicios', 'Consulta', 'Documentos', 'Seguimiento'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu firma contable?',
    seoTitle: 'Agentes IA para firmas contables | Sendwary',
    seoDescription:
      'Capta solicitudes, agenda consultas y organiza documentos por WhatsApp con agentes IA e intervención humana. La asesoría la valida tu equipo.',
  },
  {
    slug: 'consultores',
    categoryId: 'servicios-profesionales',
    category: 'Servicios profesionales',
    title: 'Agentes IA para consultores',
    headline: 'Capta leads, califica solicitudes y agenda consultas por WhatsApp',
    description:
      'El agente IA capta clientes potenciales, realiza una calificación inicial, agenda consultas y da seguimiento, para que dediques tu tiempo a los casos con mayor potencial.',
    painPoints: [
      {
        title: 'Leads sin calificar',
        description: 'Llegan muchos contactos y es difícil saber cuáles tienen potencial real.',
      },
      {
        title: 'Agenda que consume tiempo',
        description: 'Coordinar llamadas y consultas quita horas productivas.',
      },
      {
        title: 'Seguimiento que se enfría',
        description: 'Sin seguimiento constante, los prospectos se pierden.',
      },
    ],
    capabilities: [
      'Capta clientes potenciales y sus datos.',
      'Realiza una calificación inicial del prospecto.',
      'Agenda consultas según disponibilidad.',
      'Da seguimiento a los interesados.',
      'Registra cada lead en el panel.',
    ],
    examples: [
      {
        client: 'Quiero asesoría para mi negocio.',
        agent:
          'Perfecto. ¿Me cuentas brevemente tu situación y objetivo? Así preparo la consulta y agendamos.',
      },
      {
        client: '¿Cómo trabajan y cuánto cobran?',
        agent:
          'Te explico cómo trabajamos de forma general y agendo una consulta para ver tu caso a detalle.',
      },
    ],
    whyItWorks: [
      'Enfoque en los leads con mayor potencial.',
      'Consultas agendadas automáticamente.',
      'Seguimiento constante a prospectos.',
      'Más tiempo para el trabajo de valor.',
    ],
    recommendedFeatures: ['leads', 'appointments', 'inbox', 'handoff', 'dashboard'],
    visual: 'professional',
    tags: ['Lead', 'Agenda', 'Calificación', 'Seguimiento'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu consultoría?',
    seoTitle: 'Agentes IA para consultores | Sendwary',
    seoDescription:
      'Capta leads, califica solicitudes y agenda consultas por WhatsApp con agentes IA, seguimiento y panel de conversaciones.',
  },
  {
    slug: 'servicios-tecnicos',
    categoryId: 'servicios-profesionales',
    category: 'Servicios profesionales',
    title: 'Agentes IA para servicios técnicos',
    headline: 'Recibe solicitudes de reparación, capta datos del equipo y cotiza por WhatsApp',
    description:
      'El agente IA recibe solicitudes de reparación, capta los datos del equipo y el problema reportado, agenda visitas y prepara cotizaciones, dejando el diagnóstico final a tu equipo técnico.',
    disclaimer:
      'El agente IA toma solicitudes y datos preliminares. El diagnóstico definitivo lo confirma el equipo técnico.',
    painPoints: [
      {
        title: 'Solicitudes incompletas',
        description: 'Sin datos del equipo y del problema, cada visita empieza a ciegas.',
      },
      {
        title: 'Citas descoordinadas',
        description: 'Agendar visitas por chat toma varios mensajes.',
      },
      {
        title: 'Cotizaciones lentas',
        description: 'Preparar cotizaciones sin la info completa retrasa la respuesta.',
      },
    ],
    capabilities: [
      'Recibe solicitudes de reparación.',
      'Capta tipo de equipo, marca y problema reportado.',
      'Agenda visitas o citas de servicio.',
      'Prepara cotizaciones preliminares para el equipo.',
      'Da seguimiento y registra todo en el panel.',
    ],
    examples: [
      {
        client: 'Se me dañó la lavadora, ¿pueden repararla?',
        agent:
          'Claro. ¿Me indicas marca y qué falla presenta? Con eso agendo la visita; el diagnóstico exacto lo confirma el técnico.',
      },
      {
        client: '¿Cuánto costaría la reparación?',
        agent:
          'Te doy un estimado preliminar y el equipo confirma la cotización final tras revisar el equipo.',
      },
    ],
    whyItWorks: [
      'Solicitudes completas antes de la visita.',
      'Citas de servicio coordinadas.',
      'Cotizaciones preliminares más rápidas.',
      'El equipo técnico confirma el diagnóstico.',
    ],
    recommendedFeatures: ['leads', 'quotes', 'appointments', 'inbox', 'handoff'],
    visual: 'professional',
    tags: ['Reparación', 'Equipo', 'Cita', 'Cotización'],
    ctaTitle: '¿Quieres ver Sendwary aplicado a tu servicio técnico?',
    seoTitle: 'Agentes IA para servicios técnicos | Sendwary',
    seoDescription:
      'Recibe solicitudes de reparación, capta datos del equipo y cotiza por WhatsApp con agentes IA, citas y seguimiento. El diagnóstico lo confirma tu equipo.',
  },
]

/** Devuelve el contenido de una industria por su slug. */
export function getIndustryBySlug(slug: string): IndustryPage | undefined {
  return industryPages.find((p) => p.slug === slug)
}
