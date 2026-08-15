/**
 * Abstracción de proveedor de WhatsApp.
 *
 * Todo lo que Sendwary necesita de un transporte de WhatsApp vive aquí, para
 * que agregar un BSP (Twilio, 360dialog, Infobip, 8x8) o Embedded Signup sea
 * implementar esta interfaz — sin tocar el webhook, el runtime de agentes ni
 * el pipeline de audio.
 *
 * Regla de seguridad: las implementaciones reciben el token YA DESCIFRADO en
 * `ProviderContext` y nunca lo devuelven en ninguna respuesta ni lo loguean.
 */

export type WhatsAppProviderId =
  | "META_CLOUD"
  | "TWILIO"
  | "DIALOG360"
  | "INFOBIP"
  | "EIGHTX8"
  | "SENDWARY_DEMO"
  | "OTHER";

/** Credenciales + coordenadas de envío resueltas para un tenant concreto. */
export interface ProviderContext {
  /** Token descifrado. NUNCA se serializa hacia el frontend ni a logs. */
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  /** Datos extra del BSP (subcuenta, region, sender id...) sin secretos. */
  metadata?: Record<string, unknown>;
}

export interface ProviderResult<T = unknown> {
  ok: boolean;
  data?: T;
  /** Mensaje ya traducido a lenguaje de usuario (sin token ni stack). */
  error?: string;
}

export interface PhoneNumberInfo {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
}

export interface ProviderHealth {
  /** true si el proveedor puede enviar ahora mismo. */
  healthy: boolean;
  /** Mensaje amigable para el panel (nunca técnico crudo). */
  message: string;
  qualityRating?: string | null;
  checkedAt: Date;
}

export interface WhatsAppProviderAdapter {
  readonly id: WhatsAppProviderId;
  /** Nombre comercial para la UI. */
  readonly label: string;
  /** false = declarado pero sin implementación real todavía (BSP futuros). */
  readonly implemented: boolean;

  /** Comprueba credenciales sin enviar mensajes. */
  validateConnection(ctx: ProviderContext): Promise<ProviderResult<PhoneNumberInfo>>;

  sendTextMessage(
    ctx: ProviderContext,
    input: { to: string; text: string }
  ): Promise<ProviderResult<{ messageId?: string }>>;

  sendMediaMessage(
    ctx: ProviderContext,
    input: {
      to: string;
      /** Ruta local del archivo a subir (PDF de cotización, etc.). */
      filePath: string;
      filename: string;
      caption?: string;
      mimeType?: string;
    }
  ): Promise<ProviderResult<{ messageId?: string }>>;

  getPhoneNumberInfo(ctx: ProviderContext): Promise<ProviderResult<PhoneNumberInfo>>;

  /**
   * Renueva el token si el proveedor lo soporta (OAuth de Embedded Signup,
   * tokens rotativos de BSP). Meta Cloud con token de System User: no aplica.
   */
  refreshTokenIfSupported(
    ctx: ProviderContext
  ): Promise<ProviderResult<{ accessToken: string; expiresAt: Date | null } | null>>;

  getHealthStatus(ctx: ProviderContext): Promise<ProviderHealth>;
}

/** Base para proveedores declarados pero aún no implementados (BSP futuros). */
export abstract class UnimplementedProvider implements WhatsAppProviderAdapter {
  abstract readonly id: WhatsAppProviderId;
  abstract readonly label: string;
  readonly implemented = false;

  private notAvailable<T>(): ProviderResult<T> {
    return {
      ok: false,
      error: `La conexión vía ${this.label} todavía no está disponible en Sendwary. Escríbenos y te ayudamos a conectar tu WhatsApp.`,
    };
  }

  async validateConnection() {
    return this.notAvailable<PhoneNumberInfo>();
  }
  async sendTextMessage() {
    return this.notAvailable<{ messageId?: string }>();
  }
  async sendMediaMessage() {
    return this.notAvailable<{ messageId?: string }>();
  }
  async getPhoneNumberInfo() {
    return this.notAvailable<PhoneNumberInfo>();
  }
  async refreshTokenIfSupported() {
    return this.notAvailable<{ accessToken: string; expiresAt: Date | null } | null>();
  }
  async getHealthStatus(): Promise<ProviderHealth> {
    return {
      healthy: false,
      message: `${this.label} aún no está disponible como proveedor de conexión.`,
      checkedAt: new Date(),
    };
  }
}
