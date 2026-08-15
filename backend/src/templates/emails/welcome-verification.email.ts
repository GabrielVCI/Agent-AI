import { renderBrandEmail, renderPlainText, type RenderedEmail } from "./email-layout.js";

/** Correo 1: Bienvenida + botón "Verificar Cuenta". */
export function buildWelcomeVerificationEmail(vars: {
  firstName: string;
  businessName?: string | null;
  verificationUrl: string;
}): RenderedEmail {
  const business = vars.businessName ? ` de <strong>${vars.businessName}</strong>` : " de tu negocio";
  const content = {
    title: "¡Bienvenido a Sendwary!",
    greeting: `Hola ${vars.firstName},`,
    paragraphs: [
      `Gracias por unirte a <strong>Sendwary</strong>. Estamos listos para ayudarte a automatizar la atención${business}: conversaciones de WhatsApp, citas, cotizaciones y agentes IA trabajando por ti las 24 horas.`,
      "Para continuar con la activación de tu cuenta y confirmar los datos de tu empresa, primero necesitamos verificar que este correo te pertenece. Solo toma unos segundos:",
    ],
    button: { label: "Verificar Cuenta", url: vars.verificationUrl },
    footNote:
      "Este enlace expira en 48 horas. Si no creaste esta cuenta, puedes ignorar este correo con tranquilidad.",
  };

  return {
    subject: "Bienvenido a Sendwary — Verifica tu cuenta",
    html: renderBrandEmail({
      previewText: "Verifica tu cuenta para comenzar con Sendwary",
      ...content,
    }),
    text: renderPlainText(content),
  };
}
