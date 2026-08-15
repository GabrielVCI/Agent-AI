import { renderBrandEmail, renderPlainText, type RenderedEmail } from "./email-layout.js";

/** Recuperación de contraseña. El enlace lleva el token de un solo uso. */
export function buildPasswordResetEmail(vars: {
  firstName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): RenderedEmail {
  const minutes = vars.expiresInMinutes ?? 60;
  const content = {
    title: "Restablece tu contraseña",
    greeting: `Hola ${vars.firstName},`,
    paragraphs: [
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta de <strong>Sendwary</strong>. Pulsa el botón para crear una nueva:",
    ],
    button: { label: "Restablecer contraseña", url: vars.resetUrl },
    footNote: `Este enlace expira en ${minutes} minutos y solo puede usarse una vez. Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida y tu cuenta está segura. Nunca compartas este enlace con nadie.`,
  };

  return {
    subject: "Restablece tu contraseña de Sendwary",
    html: renderBrandEmail({
      previewText: "Enlace para restablecer tu contraseña de Sendwary",
      ...content,
    }),
    text: renderPlainText(content),
  };
}
