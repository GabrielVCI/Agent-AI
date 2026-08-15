import { env } from "../../config/env.js";

/**
 * Layout base de los correos transaccionales de Sendwary.
 * HTML de tablas + estilos inline (compatibilidad con clientes de correo);
 * paleta de marca: violeta primary-600 #7c3aed sobre fondo limpio.
 */

const BRAND_PURPLE = "#7c3aed";
const BRAND_PURPLE_DARK = "#6d28d9";
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#64748b";
const BG = "#f5f3ff";

export interface EmailButton {
  label: string;
  url: string;
}

/** Contenido listo para enviar: HTML + alternativa en texto plano. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Quita etiquetas HTML para construir la versión de texto plano. */
function stripHtml(value: string): string {
  return value
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|li|ul|div|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Versión de texto plano del mismo contenido. Muchos clientes (y los filtros
 * de spam) penalizan los correos que solo traen HTML.
 */
export function renderPlainText(options: {
  title: string;
  greeting: string;
  paragraphs: string[];
  button?: EmailButton;
  footNote?: string;
}): string {
  const parts = [
    options.title,
    "",
    options.greeting,
    "",
    ...options.paragraphs.map(stripHtml),
  ];
  if (options.button) {
    parts.push("", `${options.button.label}: ${options.button.url}`);
  }
  if (options.footNote) {
    parts.push("", stripHtml(options.footNote));
  }
  parts.push(
    "",
    "—",
    "Sendwary — Agentes IA para WhatsApp, citas y atención al cliente.",
    `¿Necesitas ayuda? Escríbenos a ${env.SUPPORT_EMAIL}`
  );
  return parts.join("\n");
}

export function renderBrandEmail(options: {
  previewText: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  button?: EmailButton;
  footNote?: string;
}): string {
  const { previewText, title, greeting, paragraphs, button, footNote } = options;

  const logo = env.SENDWARY_LOGO_URL
    ? `<img src="${env.SENDWARY_LOGO_URL}" alt="Sendwary" height="40" style="height:40px;display:block;margin:0 auto;" />`
    : `<span style="font-size:26px;font-weight:800;color:${BRAND_PURPLE};letter-spacing:-0.5px;">Sendwary</span>`;

  const buttonHtml = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;">
        <tr>
          <td style="border-radius:12px;background:linear-gradient(135deg,${BRAND_PURPLE},${BRAND_PURPLE_DARK});">
            <a href="${button.url}"
               style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;font-family:'Segoe UI',Arial,sans-serif;">
              ${button.label}
            </a>
          </td>
        </tr>
      </table>`
    : "";

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;font-family:'Segoe UI',Arial,sans-serif;">${p}</p>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:8px 0 24px;text-align:center;">${logo}</td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:40px 36px;box-shadow:0 4px 24px rgba(124,58,237,0.10);">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${TEXT_DARK};font-family:'Segoe UI',Arial,sans-serif;">${title}</h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;font-family:'Segoe UI',Arial,sans-serif;">${greeting}</p>
              ${paragraphsHtml}
              ${buttonHtml}
              ${
                footNote
                  ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${TEXT_MUTED};font-family:'Segoe UI',Arial,sans-serif;">${footNote}</p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:24px 12px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};font-family:'Segoe UI',Arial,sans-serif;">
                Sendwary — Agentes IA para WhatsApp, citas y atención al cliente.
              </p>
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};font-family:'Segoe UI',Arial,sans-serif;">
                ¿Necesitas ayuda? Escríbenos a
                <a href="mailto:${env.SUPPORT_EMAIL}" style="color:${BRAND_PURPLE};text-decoration:none;">${env.SUPPORT_EMAIL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
