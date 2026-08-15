import axios from "axios";
import { logger } from "../../config/logger.js";
import {
  sendWhatsappTextMessage,
  sendWhatsappDocumentMessage,
  uploadWhatsappDocumentMedia,
} from "../meta-whatsapp.service.js";
import type {
  PhoneNumberInfo,
  ProviderContext,
  ProviderHealth,
  ProviderResult,
  WhatsAppProviderAdapter,
} from "./whatsapp-provider.interface.js";

/**
 * Meta WhatsApp Cloud API — el único proveedor implementado hoy.
 *
 * Envuelve `meta-whatsapp.service.ts` (que sigue siendo el transporte real y
 * no cambió), de modo que el webhook actual sigue funcionando igual mientras
 * el resto del sistema puede hablar contra la interfaz genérica.
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProviderAdapter {
  readonly id = "META_CLOUD" as const;
  readonly label = "Meta WhatsApp Cloud API";
  readonly implemented = true;

  async validateConnection(ctx: ProviderContext): Promise<ProviderResult<PhoneNumberInfo>> {
    return this.getPhoneNumberInfo(ctx);
  }

  /** GET /{phoneNumberId} — confirma token + pertenencia del número. No envía nada. */
  async getPhoneNumberInfo(ctx: ProviderContext): Promise<ProviderResult<PhoneNumberInfo>> {
    try {
      const res = await axios.get(
        `https://graph.facebook.com/${ctx.graphApiVersion}/${ctx.phoneNumberId}`,
        {
          params: { fields: "display_phone_number,verified_name,quality_rating" },
          headers: { Authorization: `Bearer ${ctx.accessToken}` },
          timeout: 15000,
        }
      );
      const data = res.data as {
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
      };
      return {
        ok: true,
        data: {
          phoneNumberId: ctx.phoneNumberId,
          displayPhoneNumber: data.display_phone_number ?? null,
          verifiedName: data.verified_name ?? null,
          qualityRating: data.quality_rating ?? null,
        },
      };
    } catch (err) {
      return { ok: false, error: metaErrorMessage(err) };
    }
  }

  async sendTextMessage(
    ctx: ProviderContext,
    input: { to: string; text: string }
  ): Promise<ProviderResult<{ messageId?: string }>> {
    try {
      const res = await sendWhatsappTextMessage({
        to: input.to,
        text: input.text,
        phoneNumberId: ctx.phoneNumberId,
        credentials: { accessToken: ctx.accessToken, graphApiVersion: ctx.graphApiVersion },
      });
      return { ok: true, data: { messageId: res?.messages?.[0]?.id } };
    } catch (err) {
      return { ok: false, error: metaErrorMessage(err) };
    }
  }

  async sendMediaMessage(
    ctx: ProviderContext,
    input: { to: string; filePath: string; filename: string; caption?: string }
  ): Promise<ProviderResult<{ messageId?: string }>> {
    try {
      const credentials = {
        accessToken: ctx.accessToken,
        graphApiVersion: ctx.graphApiVersion,
      };
      const uploaded = await uploadWhatsappDocumentMedia({
        filePath: input.filePath,
        phoneNumberId: ctx.phoneNumberId,
        credentials,
      });
      const res = await sendWhatsappDocumentMessage({
        to: input.to,
        mediaId: uploaded.id,
        filename: input.filename,
        caption: input.caption,
        phoneNumberId: ctx.phoneNumberId,
        credentials,
      });
      return { ok: true, data: { messageId: res?.messages?.[0]?.id } };
    } catch (err) {
      return { ok: false, error: metaErrorMessage(err) };
    }
  }

  /**
   * Los tokens de System User de Meta son permanentes: no hay refresh.
   * Cuando exista Embedded Signup, el intercambio de código por token de larga
   * duración se implementa aquí (el resto del sistema no se entera).
   */
  async refreshTokenIfSupported(): Promise<
    ProviderResult<{ accessToken: string; expiresAt: Date | null } | null>
  > {
    return { ok: true, data: null };
  }

  async getHealthStatus(ctx: ProviderContext): Promise<ProviderHealth> {
    const info = await this.getPhoneNumberInfo(ctx);
    if (!info.ok) {
      return { healthy: false, message: info.error ?? "No se pudo verificar la conexión.", checkedAt: new Date() };
    }
    const quality = info.data?.qualityRating ?? null;
    const qualityWarning =
      quality === "RED"
        ? " La calidad de tu número está en ROJO: pausa los envíos salientes y revisa el contenido."
        : quality === "YELLOW"
          ? " La calidad de tu número está en AMARILLO: baja el volumen y evita mensajes no solicitados."
          : "";
    return {
      healthy: true,
      message: `Conexión activa con Meta${info.data?.displayPhoneNumber ? ` (${info.data.displayPhoneNumber})` : ""}.${qualityWarning}`,
      qualityRating: quality,
      checkedAt: new Date(),
    };
  }
}

/**
 * Traduce errores de la Graph API a mensajes accionables.
 * Nunca incluye el token ni el cuerpo crudo de la respuesta.
 */
export function metaErrorMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    logger.error(`[WHATSAPP PROVIDER] error no-HTTP: ${String(err)}`);
    return "No se pudo contactar a Meta. Intenta de nuevo en unos minutos.";
  }
  const status = err.response?.status;
  const body = err.response?.data as { error?: { message?: string; code?: number } } | undefined;
  const metaCode = body?.error?.code ?? null;
  const metaMsg = body?.error?.message ?? "";

  if (status === 401 || metaCode === 190) {
    return "El token no es válido o expiró. Genera uno nuevo en Meta y guárdalo aquí.";
  }
  if (status === 403 || metaCode === 10 || metaCode === 200) {
    return "El token no tiene permiso sobre ese Phone Number ID (¿pertenece a otra app/WABA?). Verifica que el número esté en la misma app de Meta que generó el token.";
  }
  if (status === 404 || metaCode === 100) {
    return "El Phone Number ID no existe o no pertenece a este token. Revísalo en Meta: WhatsApp > API Setup.";
  }
  if (status === 429 || metaCode === 4 || metaCode === 80007) {
    return "Meta está limitando las peticiones (rate limit). Espera unos minutos y reintenta.";
  }
  if (metaCode === 131047 || metaCode === 131051) {
    return "Meta rechazó el mensaje: la ventana de 24 horas está cerrada. El cliente debe escribir primero, o usa una plantilla aprobada.";
  }
  return metaMsg ? `Meta respondió: ${metaMsg}` : `Error ${status ?? "desconocido"} al comunicarse con Meta.`;
}
