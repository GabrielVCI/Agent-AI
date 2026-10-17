/**
 * Plantillas de automatización de Sendwary.
 *
 * Decisión (§25 del módulo): las plantillas viven en CÓDIGO, no en base de
 * datos. Una "regla global" en BD obligaría a filas sin tenantId y abriría la
 * puerta a ediciones cruzadas; aquí cada tenant instancia su propia
 * AutomationRule a partir de la plantilla y puede modificarla libremente sin
 * afectar a nadie más. `templateKey` (único por tenant) evita duplicados.
 */
import type { RuleInput } from "./automation-rules.service.js";
import { createRule } from "./automation-rules.service.js";
import { prisma } from "../../config/prisma.js";
import { serializeRule } from "./automation-rules.service.js";

export interface AutomationRuleTemplate {
  key: string;
  title: string;
  summary: string;
  rule: RuleInput;
}

export const AUTOMATION_RULE_TEMPLATES: AutomationRuleTemplate[] = [
  {
    key: "appointment-reminder-24h",
    title: "Recordatorio de cita (24 h antes)",
    summary:
      "Envía un WhatsApp 24 horas antes de la cita. Si la cita cambia de fecha el mensaje se reprograma solo; si se cancela, se cancela.",
    rule: {
      name: "Recordatorio de cita 24 h antes",
      description: "Recuerda la cita al cliente un día antes por WhatsApp.",
      eventType: "APPOINTMENT_CREATED",
      status: "DRAFT",
      actionType: "SEND_WHATSAPP_MESSAGE",
      actionConfig: {
        template:
          "Hola {{nombre}} 👋 Te recordamos tu cita de {{servicio}} el {{fecha}} a las {{hora}}. Si necesitas reprogramar, respóndenos por aquí.",
      },
      scheduleStrategy: "RELATIVE_TO_FIELD",
      scheduleConfig: { field: "scheduledAt", offsetMinutes: -24 * 60 },
      cancelOnEventTypes: ["APPOINTMENT_CANCELLED"],
      priority: 10,
    },
  },
  {
    key: "post-service-followup-2d",
    title: "Seguimiento postservicio (2 días)",
    summary:
      "Dos días después de completar la cita pregunta al cliente cómo le fue, en horario comercial.",
    rule: {
      name: "Seguimiento postservicio",
      description: "Mensaje de cortesía dos días después del servicio.",
      eventType: "APPOINTMENT_COMPLETED",
      status: "DRAFT",
      actionType: "SEND_WHATSAPP_MESSAGE",
      actionConfig: {
        template:
          "Hola {{nombre}} 😊 ¿Cómo te fue con tu {{servicio}}? Cuéntanos para seguir mejorando. ¡Gracias por preferir a {{negocio}}!",
      },
      scheduleStrategy: "DAILY_AT_LOCAL_TIME",
      delayMinutes: 2 * 24 * 60,
      scheduleConfig: { localTime: "10:00", dedupeTag: "postservice" },
      cancelOnEventTypes: ["CUSTOMER_VISITED"],
      priority: 5,
    },
  },
  {
    key: "customer-followup-30d",
    title: "Reactivación a los 30 días",
    summary:
      "Si el cliente no vuelve en 30 días le escribe una invitación. Se cancela y se reprograma automáticamente cuando el cliente regresa.",
    rule: {
      name: "Reactivación 30 días",
      description: "Invitación a volver 30 días después de la última visita.",
      eventType: "CUSTOMER_VISITED",
      status: "DRAFT",
      actionType: "SEND_WHATSAPP_MESSAGE",
      actionConfig: {
        template:
          "Hola {{nombre}} 👋 Ya pasó un mes de tu última visita a {{negocio}}. ¿Te agendamos de nuevo? Responde por aquí y coordinamos.",
      },
      scheduleStrategy: "DAILY_AT_LOCAL_TIME",
      delayMinutes: 30 * 24 * 60,
      scheduleConfig: { localTime: "11:00", dedupeTag: "followup-30" },
      cancelOnEventTypes: ["CUSTOMER_VISITED", "APPOINTMENT_CREATED"],
      priority: 1,
    },
  },
  {
    key: "new-customer-welcome",
    title: "Bienvenida a contacto nuevo",
    summary: "Etiqueta como «Nuevo cliente» la conversación en cuanto entra un contacto nuevo.",
    rule: {
      name: "Etiquetar contacto nuevo",
      description: "Aplica la etiqueta «Nuevo cliente» a la conversación.",
      eventType: "CUSTOMER_CREATED",
      status: "DRAFT",
      actionType: "UPDATE_CUSTOMER_TAG",
      actionConfig: { label: "Nuevo cliente", color: "green" },
      scheduleStrategy: "IMMEDIATE",
      priority: 20,
    },
  },
  {
    key: "service-maintenance-reminder",
    title: "Recordatorio de mantenimiento del servicio",
    summary:
      "Cuando se completa un servicio que tiene recurrencia configurada en el catálogo, avisa al cliente el día recomendado. Si vuelve antes a hacerse ESE mismo servicio, el aviso se recalcula solo.",
    rule: {
      name: "Recordatorio de mantenimiento",
      description:
        "Usa la recurrencia configurada en cada servicio del catálogo. Los servicios sin recurrencia no programan nada.",
      eventType: "SERVICE_USED",
      status: "DRAFT",
      actionType: "SEND_WHATSAPP_MESSAGE",
      actionConfig: {
        template:
          "Hola {{nombre}} 👋 Ya toca tu {{servicio}} en {{negocio}}. ¿Te agendamos? Responde por aquí y coordinamos.",
      },
      // La fecha la calcula el Módulo 3 con la política del servicio y la zona
      // horaria del negocio; aquí solo se lee del payload. Si el servicio no
      // tiene recurrencia el campo no viaja y el job NO se crea: no se inventa
      // ningún plazo.
      scheduleStrategy: "RELATIVE_TO_FIELD",
      scheduleConfig: {
        field: "nextRecommendedAt",
        offsetMinutes: 0,
        // Una recurrencia por OCURRENCIA: cada visita programa su propio aviso.
        // Sin esto, el aviso de la visita anterior (ya COMPLETED) bloquearía
        // para siempre el de la siguiente.
        dedupeWindow: "occurrence",
        dedupeTag: "service-maintenance",
      },
      // El propio SERVICE_USED cancela el aviso pendiente del MISMO servicio y
      // cliente antes de programar el nuevo: si la clienta se vuelve a hacer la
      // coloración el 1 de agosto, el retoque del 10 de agosto desaparece y se
      // recalcula desde la nueva fecha. El grano fino lo da el entityId
      // "<clienteId>:<servicioId>" del Módulo 3.
      cancelOnEventTypes: ["SERVICE_USED"],
      priority: 5,
    },
  },
];

export interface AutomationRuleTemplateSummary {
  key: string;
  title: string;
  summary: string;
  eventType: string;
  actionType: string;
}

export function listRuleTemplates(): AutomationRuleTemplateSummary[] {
  return AUTOMATION_RULE_TEMPLATES.map((t) => ({
    key: t.key,
    title: t.title,
    summary: t.summary,
    eventType: t.rule.eventType,
    actionType: t.rule.actionType,
  }));
}

/**
 * Instancia una plantilla como regla del tenant. Idempotente: si el tenant ya
 * tiene esa plantilla, devuelve la regla existente en vez de duplicarla.
 */
export async function instantiateTemplate(
  tenantId: string,
  templateKey: string,
  createdBy?: string
): Promise<{ rule: ReturnType<typeof serializeRule>; created: boolean } | null> {
  const template = AUTOMATION_RULE_TEMPLATES.find((t) => t.key === templateKey);
  if (!template) return null;

  const existing = await prisma.automationRule.findFirst({
    where: { tenantId, templateKey },
  });
  if (existing) return { rule: serializeRule(existing), created: false };

  const created = await createRule(tenantId, template.rule, createdBy);
  const withTemplate = await prisma.automationRule.update({
    where: { id: created.id },
    data: { templateKey },
  });

  return { rule: serializeRule(withTemplate), created: true };
}
