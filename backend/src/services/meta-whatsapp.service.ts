import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import { env } from "../config/env.js";

export async function sendWhatsappTextMessage(input: {
  to: string;
  text: string;
}) {
  if (!env.META_WHATSAPP_TOKEN || !env.META_PHONE_NUMBER_ID) {
    throw new Error(
      "Faltan META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID en variables de entorno."
    );
  }

  const apiVersion = env.META_GRAPH_API_VERSION || "v20.0";

  const url = `https://graph.facebook.com/${apiVersion}/${env.META_PHONE_NUMBER_ID}/messages`;

  const response = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: {
        preview_url: false,
        body: input.text
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  return response.data;
}

export async function uploadWhatsappDocumentMedia(input: {
  filePath: string;
}) {
  if (!env.META_WHATSAPP_TOKEN || !env.META_PHONE_NUMBER_ID) {
    throw new Error(
      "Faltan META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID en variables de entorno."
    );
  }

  if (!fs.existsSync(input.filePath)) {
    throw new Error(`No se encontró el archivo PDF: ${input.filePath}`);
  }

  const apiVersion = env.META_GRAPH_API_VERSION || "v20.0";

  const url = `https://graph.facebook.com/${apiVersion}/${env.META_PHONE_NUMBER_ID}/media`;

  const form = new FormData();

  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", fs.createReadStream(input.filePath));

  const response = await axios.post(url, form, {
    headers: {
      Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}`,
      ...form.getHeaders()
    },
    timeout: 30000
  });

  return response.data as {
    id: string;
  };
}

export async function sendWhatsappDocumentMessage(input: {
  to: string;
  mediaId: string;
  filename: string;
  caption?: string;
}) {
  if (!env.META_WHATSAPP_TOKEN || !env.META_PHONE_NUMBER_ID) {
    throw new Error(
      "Faltan META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID en variables de entorno."
    );
  }

  const apiVersion = env.META_GRAPH_API_VERSION || "v20.0";

  const url = `https://graph.facebook.com/${apiVersion}/${env.META_PHONE_NUMBER_ID}/messages`;

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
        caption: input.caption || "Cotización en PDF"
      }
    },
    {
      headers: {
        Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  return response.data;
}