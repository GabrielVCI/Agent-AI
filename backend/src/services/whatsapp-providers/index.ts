import { MetaCloudWhatsAppProvider } from "./meta-cloud.provider.js";
import { SendwaryDemoWhatsAppProvider } from "./sendwary-demo.provider.js";
import {
  UnimplementedProvider,
  type WhatsAppProviderAdapter,
  type WhatsAppProviderId,
} from "./whatsapp-provider.interface.js";

/**
 * Registro de proveedores de WhatsApp.
 *
 * Meta Cloud y el demo están implementados; los BSP quedan declarados con un
 * adaptador que responde "no disponible todavía" en lenguaje de usuario. Así
 * la UI puede listarlos y el día que haya contrato con uno solo se sustituye
 * la clase, sin migración de datos ni cambios en el webhook.
 */

class TwilioWhatsAppProvider extends UnimplementedProvider {
  readonly id = "TWILIO" as const;
  readonly label = "Twilio";
}
class Dialog360WhatsAppProvider extends UnimplementedProvider {
  readonly id = "DIALOG360" as const;
  readonly label = "360dialog";
}
class InfobipWhatsAppProvider extends UnimplementedProvider {
  readonly id = "INFOBIP" as const;
  readonly label = "Infobip";
}
class EightX8WhatsAppProvider extends UnimplementedProvider {
  readonly id = "EIGHTX8" as const;
  readonly label = "8x8";
}
class OtherWhatsAppProvider extends UnimplementedProvider {
  readonly id = "OTHER" as const;
  readonly label = "Otro proveedor";
}

const REGISTRY: Record<WhatsAppProviderId, WhatsAppProviderAdapter> = {
  META_CLOUD: new MetaCloudWhatsAppProvider(),
  SENDWARY_DEMO: new SendwaryDemoWhatsAppProvider(),
  TWILIO: new TwilioWhatsAppProvider(),
  DIALOG360: new Dialog360WhatsAppProvider(),
  INFOBIP: new InfobipWhatsAppProvider(),
  EIGHTX8: new EightX8WhatsAppProvider(),
  OTHER: new OtherWhatsAppProvider(),
};

/** Adaptador de un proveedor. Desconocido → Meta Cloud (comportamiento actual). */
export function getWhatsAppProvider(id: string | null | undefined): WhatsAppProviderAdapter {
  return REGISTRY[(id ?? "META_CLOUD") as WhatsAppProviderId] ?? REGISTRY.META_CLOUD;
}

/** Catálogo para la UI (qué proveedores existen y cuáles ya funcionan). */
export function listWhatsAppProviders(): {
  id: WhatsAppProviderId;
  label: string;
  implemented: boolean;
}[] {
  return Object.values(REGISTRY).map((p) => ({
    id: p.id,
    label: p.label,
    implemented: p.implemented,
  }));
}

export { MetaCloudWhatsAppProvider, SendwaryDemoWhatsAppProvider };
export * from "./whatsapp-provider.interface.js";
