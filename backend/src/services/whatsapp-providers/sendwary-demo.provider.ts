import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { MetaCloudWhatsAppProvider } from "./meta-cloud.provider.js";
import type {
  PhoneNumberInfo,
  ProviderContext,
  ProviderHealth,
  ProviderResult,
  WhatsAppProviderAdapter,
} from "./whatsapp-provider.interface.js";

/**
 * Modo demo: número de WhatsApp controlado por Sendwary para que el cliente
 * pruebe la plataforma antes de conectar el suyo.
 *
 * Reglas duras (evitan que el demo se convierta en producción encubierta):
 * - Solo funciona si WHATSAPP_DEMO_ENABLED=true y hay número demo configurado.
 * - El transporte real es Meta Cloud con el token GLOBAL de Sendwary: por eso
 *   está limitado por cuota y jamás debe usarse para atender clientes reales.
 * - La cuota se controla en whatsapp-integration.service (demoMessagesUsed).
 */
export class SendwaryDemoWhatsAppProvider implements WhatsAppProviderAdapter {
  readonly id = "SENDWARY_DEMO" as const;
  readonly label = "Número demo de Sendwary";
  readonly implemented = true;

  private readonly meta = new MetaCloudWhatsAppProvider();

  static isConfigured(): boolean {
    return Boolean(
      env.WHATSAPP_DEMO_ENABLED && env.WHATSAPP_DEMO_PHONE_NUMBER_ID && env.META_WHATSAPP_TOKEN
    );
  }

  /** Contexto del número demo (token global de la plataforma). */
  static demoContext(): ProviderContext | null {
    if (!SendwaryDemoWhatsAppProvider.isConfigured()) return null;
    return {
      accessToken: env.META_WHATSAPP_TOKEN!,
      phoneNumberId: env.WHATSAPP_DEMO_PHONE_NUMBER_ID!,
      graphApiVersion: env.META_GRAPH_API_VERSION,
    };
  }

  private unavailable<T>(): ProviderResult<T> {
    return {
      ok: false,
      error:
        "El modo demo no está disponible en este entorno. Conecta tu propio número o solicita ayuda al equipo de Sendwary.",
    };
  }

  async validateConnection(ctx: ProviderContext): Promise<ProviderResult<PhoneNumberInfo>> {
    if (!SendwaryDemoWhatsAppProvider.isConfigured()) return this.unavailable<PhoneNumberInfo>();
    return this.meta.validateConnection(ctx);
  }

  async getPhoneNumberInfo(ctx: ProviderContext): Promise<ProviderResult<PhoneNumberInfo>> {
    if (!SendwaryDemoWhatsAppProvider.isConfigured()) return this.unavailable<PhoneNumberInfo>();
    return this.meta.getPhoneNumberInfo(ctx);
  }

  async sendTextMessage(
    ctx: ProviderContext,
    input: { to: string; text: string }
  ): Promise<ProviderResult<{ messageId?: string }>> {
    if (!SendwaryDemoWhatsAppProvider.isConfigured()) {
      return this.unavailable<{ messageId?: string }>();
    }
    logger.info(`[WHATSAPP DEMO] envío por número demo → ${input.to.slice(0, 4)}****`);
    return this.meta.sendTextMessage(ctx, input);
  }

  async sendMediaMessage(
    ctx: ProviderContext,
    input: { to: string; filePath: string; filename: string; caption?: string }
  ): Promise<ProviderResult<{ messageId?: string }>> {
    if (!SendwaryDemoWhatsAppProvider.isConfigured()) {
      return this.unavailable<{ messageId?: string }>();
    }
    return this.meta.sendMediaMessage(ctx, input);
  }

  async refreshTokenIfSupported(): Promise<
    ProviderResult<{ accessToken: string; expiresAt: Date | null } | null>
  > {
    return { ok: true, data: null };
  }

  async getHealthStatus(ctx: ProviderContext): Promise<ProviderHealth> {
    if (!SendwaryDemoWhatsAppProvider.isConfigured()) {
      return {
        healthy: false,
        message: "El modo demo no está habilitado en este entorno.",
        checkedAt: new Date(),
      };
    }
    const health = await this.meta.getHealthStatus(ctx);
    return {
      ...health,
      message: `${health.message} Estás usando el número DEMO de Sendwary: solo para pruebas, no lo uses con clientes reales.`,
    };
  }
}
