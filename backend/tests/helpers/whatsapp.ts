/**
 * Entrada de WhatsApp para las pruebas: payloads sintéticos con la forma real
 * del webhook de Meta, e integración CONNECTED con un token falso cifrado.
 *
 * `deliverWebhook()` invoca el controlador REAL del webhook y ESPERA a que
 * termine de procesar. Por HTTP no se puede: el controlador responde 200 a
 * Meta de inmediato y sigue trabajando después, así que Supertest volvería
 * antes de que exista el mensaje. La ruta HTTP en sí se prueba aparte, con
 * espera activa sobre la base.
 */
import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";

import { prisma } from "../../src/config/prisma.js";
import { incomingMetaWhatsappWebhookController } from "../../src/controllers/whatsapp.controller.js";
import { encryptJson } from "../../src/lib/crypto.js";
import { PREFIX } from "./factories.js";

function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/** Número de cliente con el formato de Meta (`wa_id`: dígitos, sin `+`). */
export function fakeWaId(): string {
  const n = Math.floor(1000 + Math.random() * 8999);
  return `1809555${n}`;
}

/** Id de mensaje de Meta, con prefijo de prueba (acaba en IdempotencyKey). */
export function fakeMessageId(): string {
  return `wamid.${PREFIX}${randomUUID()}`;
}

export type InboundMessage = {
  phoneNumberId: string;
  from: string;
  name?: string;
  id?: string;
  text?: string;
  /** `text` por defecto. Cualquier otro tipo viaja sin cuerpo de texto. */
  type?: "text" | "image" | "document" | "sticker";
};

export function inboundPayload(msg: InboundMessage) {
  const type = msg.type ?? "text";
  const message: Record<string, unknown> = {
    from: msg.from,
    id: msg.id ?? fakeMessageId(),
    timestamp: String(Math.floor(Date.now() / 1000)),
    type,
  };
  if (type === "text") message.text = { body: msg.text ?? "Hola" };
  else message[type] = { id: `media-${uniqueSuffix()}`, mime_type: "image/jpeg" };

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-test",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "18095550000", phone_number_id: msg.phoneNumberId },
              contacts: [{ profile: { name: msg.name ?? "Cliente Prueba" }, wa_id: msg.from }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Entrega un mensaje al controlador real del webhook y espera a que termine.
 * Devuelve el status que el controlador le dio a "Meta".
 */
export async function deliverWebhook(msg: InboundMessage): Promise<number> {
  let status = 0;
  const res = {
    sendStatus(code: number) {
      status = code;
      return res;
    },
  } as unknown as Response;

  await incomingMetaWhatsappWebhookController({ body: inboundPayload(msg) } as Request, res);
  return status;
}

/**
 * Integración de WhatsApp CONNECTED con un access token FALSO cifrado con la
 * ENCRYPTION_KEY de `.env.test`. Es lo que hace que el webhook multi-tenant
 * procese (sin credenciales no responde). El envío nunca sale: lo intercepta
 * `external-mocks.ts`.
 */
export async function createConnectedIntegration(
  tenantId: string,
  label: string
): Promise<{ integrationId: string; phoneNumberId: string; accessToken: string }> {
  const phoneNumberId = `${PREFIX}pnid-${label}-${uniqueSuffix()}`;
  const accessToken = `${PREFIX}fake-token-${label}-${uniqueSuffix()}`;

  const integration = await prisma.whatsAppIntegration.create({
    data: {
      tenantId,
      provider: "META_CLOUD",
      mode: "MANUAL_CLOUD_API",
      status: "CONNECTED",
      businessName: `${PREFIX}waba-${label}`,
      phoneNumberId,
      displayPhoneNumber: "+18095550000",
      verifyToken: `${PREFIX}verify-${label}-${uniqueSuffix()}`,
      accessTokenEncrypted: encryptJson({ token: accessToken }),
      tokenLastFour: accessToken.slice(-4),
    },
  });

  return { integrationId: integration.id, phoneNumberId, accessToken };
}
