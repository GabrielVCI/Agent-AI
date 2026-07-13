/**
 * Biblioteca de respuestas fallback de Sendwary: cortas, naturales y sin
 * sonar robóticas. Únicas fuentes de texto predefinido del runtime, para que
 * el tono sea consistente en WhatsApp, audio y llamadas.
 */

export const AGENT_RESPONSES = {
  productNotFound:
    "No encontré ese producto. ¿Me das un poco más de detalle (marca, medida o presentación)?",
  priceNotConfigured:
    "Ese precio no lo tengo a mano ahora mismo. Déjame confirmarlo con un asesor y te digo.",
  missingName: "¡Con gusto! ¿A nombre de quién agendo la cita?",
  missingDateTime: "Perfecto. ¿Qué día y a qué hora te viene bien?",
  outOfHours:
    "Ahora mismo estamos fuera de horario, pero dejo tu mensaje registrado y te respondemos apenas abramos.",
  wrongNumber:
    "Entendido, disculpa la molestia. No te escribiremos más por esta conversación.",
  offTopic: (businessName: string) =>
    `Puedo ayudarte con información de ${businessName}, servicios, productos o citas. ¿Te ayudo con algo de eso?`,
  offTopicClose:
    "Parece que esto no es algo en lo que pueda ayudarte por aquí. Si más adelante necesitas algo del negocio, escríbenos con gusto. ¡Saludos!",
  humanRequested:
    "Claro, te paso con una persona del equipo para que te ayude directamente. Un momento.",
  limitReached:
    "En este momento el servicio automático no está disponible. Un asesor dará seguimiento a tu mensaje.",
  audioNotUnderstood:
    "No pude entender bien el audio. ¿Puedes enviarlo nuevamente o escribir tu solicitud por aquí?",
  callNotRelated:
    "Parece que esta llamada no es sobre el negocio. Gracias por tu tiempo, que tengas buen día.",
  stuckEscalation:
    "Para no hacerte dar más vueltas, voy a pasar tu caso a un asesor que te ayude directamente. Un momento, por favor.",
  emergency:
    "Dame un momento, voy a pasar tu solicitud a un asesor para ayudarte mejor.",
} as const;
