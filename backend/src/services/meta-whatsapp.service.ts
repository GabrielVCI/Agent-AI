import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { env } from "../config/env.js";

function resolvePhoneNumberId(overrideId?: string): string {
  const id = overrideId || env.META_PHONE_NUMBER_ID;
  if (!id) throw new Error("META_PHONE_NUMBER_ID no está configurado.");
  return id;
}

function getToken(): string {
  if (!env.META_WHATSAPP_TOKEN) throw new Error("META_WHATSAPP_TOKEN no está configurado.");
  return env.META_WHATSAPP_TOKEN;
}

export async function sendWhatsappTextMessage(input: {
  to: string;
  text: string;
  phoneNumberId?: string;
}) {
  const phoneId = resolvePhoneNumberId(input.phoneNumberId);
  const token = getToken();
  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${phoneId}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { preview_url: false, body: input.text },
    },
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  return response.data;
}

/**
 * Descarga un media entrante (audio/imagen/documento) desde la Graph API.
 * Flujo de Meta en dos pasos: GET /{mediaId} devuelve una URL temporal
 * (expira en ~5 min, requiere el Bearer token) y luego se descarga el binario.
 * La URL temporal NUNCA se persiste ni se expone al frontend.
 */
export async function downloadWhatsappMedia(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  fileSize: number | null;
}> {
  const token = getToken();

  const metaRes = await axios.get(
    `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
  const { url, mime_type: mimeType, file_size: fileSize } = metaRes.data as {
    url: string;
    mime_type?: string;
    file_size?: number;
  };
  if (!url) throw new Error(`Meta no devolvió URL para el media ${mediaId}`);

  const binRes = await axios.get<ArrayBuffer>(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 25 * 1024 * 1024,
  });

  return {
    buffer: Buffer.from(binRes.data),
    mimeType: mimeType ?? "audio/ogg",
    fileSize: fileSize ?? null,
  };
}

export async function uploadWhatsappDocumentMedia(input: {
  filePath: string;
  phoneNumberId?: string;
}) {
  const phoneId = resolvePhoneNumberId(input.phoneNumberId);
  const token = getToken();

  if (!fs.existsSync(input.filePath)) {
    throw new Error(`No se encontró el archivo PDF: ${input.filePath}`);
  }

  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${phoneId}/media`;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", fs.createReadStream(input.filePath));

  const response = await axios.post(url, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    timeout: 30000,
  });

  return response.data as { id: string };
}

export async function sendWhatsappDocumentMessage(input: {
  to: string;
  mediaId: string;
  filename: string;
  caption?: string;
  phoneNumberId?: string;
}) {
  const phoneId = resolvePhoneNumberId(input.phoneNumberId);
  const token = getToken();
  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${phoneId}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "document",
      document: {
        id: input.mediaId,
        filename: input.filename,
        caption: input.caption || "Cotización en PDF",
      },
    },
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  return response.data;
}
