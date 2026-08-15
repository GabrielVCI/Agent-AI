import { renderBrandEmail, renderPlainText, type RenderedEmail } from "./email-layout.js";

/** Correo 2 (post-verificación): siguiente paso — implementación. */
export function buildImplementationNextStepEmail(vars: {
  firstName: string;
  businessName?: string | null;
  appUrl: string;
  planName?: string | null;
  setupFeeText?: string | null;
}): RenderedEmail {
  const business = vars.businessName ? ` para <strong>${vars.businessName}</strong>` : "";
  const setupLine = vars.setupFeeText
    ? `Recuerda que la implementación tiene un costo único${vars.planName ? ` según tu plan <strong>${vars.planName}</strong>` : ""}: <strong>${vars.setupFeeText}</strong>. Nuestro equipo te indicará los pasos para completarlo.`
    : "Nuestro equipo te indicará los pasos para completar el pago de implementación según el plan que elijas.";

  const content = {
    title: "Tu cuenta está verificada ✓",
    greeting: `Hola ${vars.firstName},`,
    paragraphs: [
      `Tu cuenta de Sendwary quedó verificada correctamente. El siguiente paso es la <strong>implementación</strong>${business}.`,
      "El equipo de Sendwary se pondrá en contacto contigo para ajustar los detalles e iniciar la implementación.",
      setupLine,
      "La implementación toma <strong>aproximadamente 2 semanas</strong>. Durante esta etapa preparamos todo para que tu operación arranque sin fricción:",
      `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.9;color:#334155;">
          <li>Conexión de <strong>WhatsApp Business</strong></li>
          <li>Configuración de tu <strong>agente IA</strong></li>
          <li>Carga de <strong>catálogo o servicios</strong></li>
          <li>Sistema de <strong>citas</strong></li>
          <li>Reglas de <strong>intervención humana</strong></li>
          <li><strong>Pruebas iniciales</strong> con tu equipo</li>
        </ul>`,
      "Durante esta etapa, nuestro equipo técnico revisará contigo los detalles de tu negocio para configurar la plataforma correctamente antes de iniciar tu primer mes de servicio.",
    ],
    button: { label: "Ir a Sendwary", url: vars.appUrl },
    footNote:
      "Tu primer mes de servicio comienza cuando activamos tu cuenta al finalizar la implementación — no antes.",
  };

  return {
    subject: "Tu cuenta fue verificada — Próximo paso: implementación Sendwary",
    html: renderBrandEmail({
      previewText: "Cuenta verificada. Comienza la implementación de Sendwary.",
      ...content,
    }),
    text: renderPlainText(content),
  };
}
