import { renderBrandEmail, renderPlainText, type RenderedEmail } from "./email-layout.js";

/** Recordatorio del pago de implementación (lo dispara el equipo Sendwary). */
export function buildImplementationPaymentReminderEmail(vars: {
  firstName: string;
  businessName?: string | null;
  appUrl: string;
  supportEmail: string;
  setupFeeText?: string | null;
}): RenderedEmail {
  const business = vars.businessName ? ` de <strong>${vars.businessName}</strong>` : "";
  const feeLine = vars.setupFeeText
    ? `El pago de implementación pendiente es de <strong>${vars.setupFeeText}</strong>.`
    : "El pago de implementación aún figura como pendiente en tu cuenta.";

  const content = {
    title: "Recordatorio de implementación",
    greeting: `Hola ${vars.firstName},`,
    paragraphs: [
      `Te escribimos para recordarte el siguiente paso en la puesta en marcha${business}: completar el <strong>pago de implementación</strong> para que nuestro equipo comience la configuración técnica.`,
      feeLine,
      "Una vez registrado el pago, iniciamos la implementación: conexión de WhatsApp Business, configuración de tu agente IA, catálogo o servicios, citas y reglas de atención. El proceso toma <strong>aproximadamente 2 semanas</strong>.",
      `Si ya realizaste el pago o tienes dudas, respóndenos a <a href="mailto:${vars.supportEmail}" style="color:#7c3aed;text-decoration:none;">${vars.supportEmail}</a> y lo revisamos contigo.`,
    ],
    button: { label: "Ir a Sendwary", url: vars.appUrl },
    footNote:
      "Recuerda: tu primer mes de servicio empieza cuando activamos tu cuenta al terminar la implementación, no cuando haces este pago.",
  };

  return {
    subject: "Recordatorio de implementación Sendwary",
    html: renderBrandEmail({
      previewText: "Siguiente paso: completar el pago de implementación",
      ...content,
    }),
    text: renderPlainText(content),
  };
}
