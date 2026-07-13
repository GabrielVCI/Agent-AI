import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { getOpenAIClient } from "../../config/openai.js";
import { searchPlaybooks, getPlaybook } from "./support-playbook.service.js";

/**
 * Triage del asistente de soporte: clasifica un problema en Tier 1/2/3 con
 * severidad, categoría y pasos recomendados.
 *
 * Diseño de seguridad:
 * - El núcleo es DETERMINÍSTICO (reglas + búsqueda en playbooks): funciona
 *   sin OpenAI y nunca "alucina" acciones.
 * - OpenAI (si está configurado) solo ENRIQUECE con un resumen; jamás decide
 *   acciones ni baja un Tier 3 detectado por reglas.
 */

export type SupportTierValue = "TIER_1" | "TIER_2" | "TIER_3";
export type SupportSeverityValue = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface TriageResult {
  tier: SupportTierValue;
  severity: SupportSeverityValue;
  category: string;
  playbookSlug: string | null;
  playbookTitle: string | null;
  detectedIssue: string;
  recommendedSteps: string[];
  requiresHuman: boolean;
  incident: boolean;
  confidence: number;
  aiSummary: string | null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ─── Tier 3: señales de incidente (siempre mandan) ──────────────────────────

const TIER3_PATTERNS: { pattern: RegExp; issue: string }[] = [
  { pattern: /caid[ao]|se cayo|down|no carga nada|inaccesible|fuera de servicio/, issue: "Posible caída de servicio" },
  { pattern: /todos los (clientes|tenants|usuarios)|varios (clientes|tenants)|masiv[oa]/, issue: "Impacto multi-tenant" },
  { pattern: /base de datos (no|caida|lenta)|database down|db no responde/, issue: "Base de datos degradada" },
  { pattern: /error(es)? 500 (en todo|masiv|constante)|500 en toda/, issue: "Errores 500 generalizados" },
  { pattern: /fuga|leak|datos de otro (tenant|cliente)|veo datos que no son mios/, issue: "Posible fuga de datos" },
  { pattern: /cobro(s)? (mal|incorrect|duplicad)[a-z]* (a )?(varios|todos|masiv)/, issue: "Cobros incorrectos masivos" },
  { pattern: /consumo anormal|gasto disparado|tokens? disparad|minutos disparad/, issue: "Consumo anómalo de recursos" },
  { pattern: /rate limit.*(todos|legitimo|bloquea todo)/, issue: "Rate limiting bloqueando tráfico legítimo" },
];

// ─── Tier 1: problemas conocidos con guía automatizable ─────────────────────

interface KnownIssue {
  id: string;
  patterns: RegExp[];
  playbookSlug: string;
  category: string;
  detectedIssue: string;
  steps: string[];
  severity: SupportSeverityValue;
}

const KNOWN_ISSUES: KnownIssue[] = [
  {
    id: "password-forgotten",
    patterns: [/no recuerd[oa].*(contrasena|clave|password)/, /olvide? (mi )?(contrasena|clave|password)/, /recuperar (mi )?(contrasena|clave)/],
    playbookSlug: "password-recovery",
    category: "Autenticación",
    detectedIssue: "Usuario no recuerda su contraseña",
    steps: [
      "Ir a /login y pulsar «Olvidé mi contraseña».",
      "Ingresar el correo de la cuenta; llegará un enlace válido por 60 minutos.",
      "Definir la nueva contraseña (8+, mayúscula, minúscula, número y símbolo).",
      "Si no llega el correo en producción: escalar (proveedor de email pendiente).",
    ],
    severity: "LOW",
  },
  {
    id: "google-oauth-config",
    patterns: [/google (oauth|login|no funciona|no esta disponible)/, /entrar con google/, /redirect_uri_mismatch/],
    playbookSlug: "google-oauth",
    category: "Autenticación",
    detectedIssue: "Google OAuth no disponible o mal configurado",
    steps: [
      "Verificar en /api/support/health si googleOAuth.configured es true.",
      "Si es false: faltan GOOGLE_CLIENT_ID/SECRET (ver backend/docs/google-oauth.md).",
      "Si hay redirect_uri_mismatch: registrar la URI del backend exacta en Google Cloud.",
      "Mientras tanto el usuario puede entrar con email/contraseña.",
    ],
    severity: "MEDIUM",
  },
  {
    id: "agent-not-replying",
    patterns: [/agente no responde/, /bot no (responde|contesta)/, /no responde (el )?whatsapp/, /whatsapp no (responde|contesta)/],
    playbookSlug: "whatsapp",
    category: "WhatsApp",
    detectedIssue: "El agente IA no responde mensajes de WhatsApp",
    steps: [
      "Verificar que el agente esté ACTIVO (Agentes → estado).",
      "Verificar que el agente tenga whatsappPhoneNumberId asignado.",
      "Revisar el uso del plan: si la cuota mensual se agotó, la IA se pausa ([BILLING LIMIT]).",
      "Revisar si la conversación específica está en HUMAN_ACTIVE (el bot calla por diseño).",
      "Si todo lo anterior está bien: escalar a Tier 2 con el conversationId.",
    ],
    severity: "MEDIUM",
  },
  {
    id: "agent-inactive",
    patterns: [/agente (inactivo|desactivado|disabled)/, /activar (mi )?agente/],
    playbookSlug: "agents",
    category: "Agentes IA",
    detectedIssue: "Agente desactivado",
    steps: ["Ir a Agentes y activar el agente con el botón de encendido.", "Confirmar que tenga número de WhatsApp asignado."],
    severity: "LOW",
  },
  {
    id: "phone-number-missing",
    patterns: [/phone.?number.?id/, /numero (de whatsapp )?no asignado/, /sin numero de whatsapp/],
    playbookSlug: "whatsapp",
    category: "WhatsApp",
    detectedIssue: "Agente sin whatsappPhoneNumberId",
    steps: [
      "Asignar el phone_number_id de Meta al agente (Agentes → WhatsApp).",
      "El número debe existir en la WABA y estar verificado (ver docs/whatsapp-onboarding-analysis.md).",
    ],
    severity: "MEDIUM",
  },
  {
    id: "message-limit-reached",
    patterns: [/limite (de mensajes|mensual|alcanzad|agotad)/, /cuota (agotada|llena)/, /se acabaron los mensajes/],
    playbookSlug: "billing",
    category: "Billing",
    detectedIssue: "Límite mensual de mensajes alcanzado",
    steps: [
      "Confirmar uso vs límite en el contexto del tenant.",
      "Explicar que el contador se reinicia con el ciclo mensual.",
      "Ofrecer upgrade de plan (el cambio lo aplica un humano/checkout).",
    ],
    severity: "MEDIUM",
  },
  {
    id: "plan-no-calls",
    patterns: [/plan no (permite|incluye) llamadas/, /no puedo (usar|hacer) llamadas/, /llamadas (bloqueadas|no disponibles)/],
    playbookSlug: "voice-minutes",
    category: "Voz",
    detectedIssue: "Plan sin derecho a llamadas IA",
    steps: [
      "Las llamadas IA son exclusivas del plan Enterprise con voz habilitada.",
      "Verificar entitlement en el contexto del tenant.",
      "El upgrade/habilitación lo gestiona un humano (SUPER_ADMIN).",
    ],
    severity: "LOW",
  },
  {
    id: "audio-unavailable",
    patterns: [/audio(s)? no (funciona|disponible|se transcribe)/, /notas? de voz no/, /transcripcion no/],
    playbookSlug: "elevenlabs",
    category: "Audio",
    detectedIssue: "Transcripción de audio no disponible",
    steps: [
      "Verificar elevenLabs.configured en /api/support/health.",
      "Verificar que el plan permita transcripción (allowAudioTranscription).",
      "Verificar que el agente tenga «mensajes de audio» activados.",
    ],
    severity: "LOW",
  },
  {
    id: "webhook-verify-failed",
    patterns: [/webhook no (verifica|valida)/, /verify.?token/, /verificacion del webhook/],
    playbookSlug: "whatsapp",
    category: "WhatsApp",
    detectedIssue: "Webhook de Meta no verificado (verify token)",
    steps: [
      "El META_VERIFY_TOKEN del backend debe coincidir EXACTO con el configurado en la app de Meta.",
      "La URL del webhook es {BACKEND_PUBLIC_URL}/api/whatsapp/meta.",
      "Corregir el token en Meta o en env y reintentar la verificación.",
    ],
    severity: "MEDIUM",
  },
  {
    id: "appointment-filters",
    patterns: [/cita (no aparece|desaparecio|no se ve)/, /no (veo|encuentro) (la |una )?cita/],
    playbookSlug: "appointments",
    category: "Citas",
    detectedIssue: "Cita no visible por filtros",
    steps: [
      "Limpiar los filtros de la vista Citas (estado, prioridad, desde/hasta).",
      "Buscar por nombre o teléfono del cliente.",
      "Si de verdad no existe: revisar si la IA la dejó pendiente por falta de datos.",
    ],
    severity: "LOW",
  },
  {
    id: "catalog-empty",
    patterns: [/catalogo (vacio|sin productos)/, /no (encuentra|tiene) productos/, /agente no conoce (mis )?(productos|precios)/],
    playbookSlug: "catalog",
    category: "Catálogo",
    detectedIssue: "Catálogo vacío o sin el producto consultado",
    steps: [
      "Cargar productos/servicios con precio en Catálogo.",
      "Agregar alias para los nombres coloquiales que usan los clientes.",
      "Probar el agente desde el panel con el texto real del cliente.",
    ],
    severity: "LOW",
  },
];

// ─── Clasificación principal ─────────────────────────────────────────────────

export function classifyIssue(description: string): TriageResult {
  const text = normalize(description);

  // 1) Incidentes primero: un Tier 3 nunca se degrada.
  for (const t3 of TIER3_PATTERNS) {
    if (t3.pattern.test(text)) {
      const playbook = getPlaybook("incidents");
      return {
        tier: "TIER_3",
        severity: "CRITICAL",
        category: "Incidente",
        playbookSlug: "incidents",
        playbookTitle: playbook?.title ?? "Incidentes",
        detectedIssue: t3.issue,
        recommendedSteps: [
          "Crear incidente y notificar a SUPER_ADMIN de inmediato.",
          "Adjuntar snapshot de /api/support/health y hora de inicio.",
          "Bloquear toda acción automática: solo diagnóstico de lectura.",
          "Seguir el protocolo de docs/support-playbooks/incidents.md.",
        ],
        requiresHuman: true,
        incident: true,
        confidence: 0.9,
        aiSummary: null,
      };
    }
  }

  // 2) Problemas conocidos (Tier 1)
  for (const issue of KNOWN_ISSUES) {
    if (issue.patterns.some((p) => p.test(text))) {
      const playbook = getPlaybook(issue.playbookSlug);
      return {
        tier: "TIER_1",
        severity: issue.severity,
        category: issue.category,
        playbookSlug: issue.playbookSlug,
        playbookTitle: playbook?.title ?? issue.playbookSlug,
        detectedIssue: issue.detectedIssue,
        recommendedSteps: issue.steps,
        requiresHuman: false,
        incident: false,
        confidence: 0.8,
        aiSummary: null,
      };
    }
  }

  // 3) Desconocido/ambiguo → Tier 2 con el playbook más afín como pista
  const matches = searchPlaybooks(description, 1);
  const best = matches[0]?.playbook ?? null;
  return {
    tier: "TIER_2",
    severity: "MEDIUM",
    category: best?.category?.slice(0, 60) ?? "General",
    playbookSlug: best?.slug ?? null,
    playbookTitle: best?.title ?? null,
    detectedIssue: "Problema no catalogado: requiere triage asistido",
    recommendedSteps: [
      "Recopilar: tenant afectado, pasos exactos para reproducir, hora del evento y mensaje de error.",
      best ? `Revisar el playbook relacionado: ${best.title}.` : "Buscar patrones similares en los playbooks.",
      "Revisar el contexto seguro del tenant (agentes, plan, últimos errores de IA).",
      "Crear ticket con el resumen y escalar a SUPER_ADMIN si no hay avance.",
    ],
    requiresHuman: true,
    incident: false,
    confidence: best ? 0.5 : 0.3,
    aiSummary: null,
  };
}

/**
 * Enriquecimiento opcional con OpenAI: SOLO redacta un resumen ejecutivo del
 * caso. Nunca cambia tier/severidad/pasos y cualquier fallo se ignora.
 */
export async function enrichTriageWithAi(
  description: string,
  triage: TriageResult
): Promise<TriageResult> {
  const client = getOpenAIClient();
  if (!client) return triage;

  try {
    const response = await client.chat.completions.create({
      model: env.OPENAI_DEFAULT_MODEL || env.OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            "Eres el asistente de soporte interno de Sendwary. Resume el caso reportado en 2-3 frases en español: qué pasa, a quién afecta y qué se recomendó. Sin inventar datos ni mencionar credenciales.",
        },
        {
          role: "user",
          content: JSON.stringify({
            reporte: description.slice(0, 1500),
            clasificacion: {
              tier: triage.tier,
              problema: triage.detectedIssue,
              pasos: triage.recommendedSteps,
            },
          }),
        },
      ],
    });
    const summary = response.choices[0]?.message?.content?.trim();
    return summary ? { ...triage, aiSummary: summary.slice(0, 600) } : triage;
  } catch (err) {
    logger.warn(`[SUPPORT TRIAGE] enriquecimiento IA falló (se ignora): ${String(err)}`);
    return triage;
  }
}
