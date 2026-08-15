import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";
import { encryptJson, decryptJson, generateToken } from "../lib/crypto.js";
import {
  getWhatsAppProvider,
  listWhatsAppProviders,
  SendwaryDemoWhatsAppProvider,
  type ProviderContext,
} from "./whatsapp-providers/index.js";
import {
  assessNumberReadiness,
  maskPhoneNumber,
  NUMBER_TYPE_LABELS,
  type DeclaredNumberType,
  type ReadinessAssessment,
} from "./whatsapp-number-readiness.js";
import {
  exchangeCodeForBusinessToken,
  getWabaPhoneNumbers,
  subscribeAppToWaba,
  isEmbeddedSignupConfigured,
  getEmbeddedSignupPublicConfig,
  type WabaPhoneNumber,
} from "./meta-embedded-signup.service.js";

/**
 * Integración WhatsApp por tenant — arquitectura multi-modo.
 *
 * Modos (WhatsAppConnectionMode):
 * - EASY_ONBOARDING: conexión guiada. Hoy = asistida por el equipo Sendwary
 *   (el cliente pide ayuda y nosotros configuramos). Mañana = Embedded Signup
 *   o BSP, sin cambiar el modelo ni el webhook.
 * - MANUAL_CLOUD_API: el cliente ya tiene Meta Cloud API y pega credenciales.
 * - DEMO_SANDBOX: número de Sendwary con cuota, solo para probar.
 *
 * Seguridad:
 * - El access token se cifra con AES-256-GCM (lib/crypto.ts) antes de guardar.
 * - Al frontend SOLO se devuelven hasToken + tokenLastFour, nunca el token.
 * - decryptAccessToken() solo se usa server-side (validación y envío).
 * - El app secret de Meta y el token global jamás salen en una respuesta.
 */

// Forma pública (segura) que ve el frontend. Nunca incluye el token.
export interface WhatsAppIntegrationPublic {
  id: string;
  provider: string;
  mode: string;
  status: string;
  businessName: string | null;
  /** @deprecated usar wabaId (se mantiene sincronizado por compat) */
  businessAccountId: string | null;
  wabaId: string | null;
  businessId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  graphApiVersion: string;
  verifyToken: string;
  hasToken: boolean;
  tokenLastFour: string | null;
  tokenExpiresAt: Date | null;
  webhookUrl: string;
  webhookVerifiedAt: Date | null;
  webhookSubscribedAt: Date | null;
  embeddedSignupCompletedAt: Date | null;
  lastValidationAt: Date | null;
  lastValidationError: string | null;
  assistedSetupRequestedAt: Date | null;
  assistedSetupStartedAt: Date | null;
  demoMessagesUsed: number;
  demoMessageLimit: number | null;
  // Preparación del número (wizard). El número declarado NO se devuelve
  // completo al cliente: se muestra enmascarado.
  numberReadiness: string;
  readinessStage: string | null;
  declaredNumberType: string | null;
  declaredPhoneNumberMasked: string | null;
  currentProvider: string | null;
  readinessRecommendation: string | null;
  readinessUpdatedAt: Date | null;
  assignedAgents: { id: string; name: string; status: string }[];
  createdAt: Date;
  updatedAt: Date;
}

/** Qué vías de conexión ofrece este entorno (lo consume la UI). */
export interface WhatsAppCapabilities {
  easyOnboarding: {
    enabled: boolean;
    /** true cuando Embedded Signup/BSP ya opera solo, sin intervención humana. */
    selfService: boolean;
    /** Vía activa: EMBEDDED_SIGNUP | BSP | ASSISTED */
    channel: "EMBEDDED_SIGNUP" | "BSP" | "ASSISTED";
    bspProvider: string | null;
  };
  /** Config PÚBLICA del SDK de Meta (nunca incluye el app secret). */
  embeddedSignup: {
    enabled: boolean;
    appId: string | null;
    configId: string | null;
    graphApiVersion: string;
  };
  manualCloudApi: { enabled: boolean };
  demoSandbox: { enabled: boolean; displayNumber: string | null; messageLimit: number };
  providers: { id: string; label: string; implemented: boolean }[];
}

export function getWhatsAppCapabilities(): WhatsAppCapabilities {
  const embeddedConfig = getEmbeddedSignupPublicConfig();
  const embedded = embeddedConfig.enabled;
  const bsp = env.WHATSAPP_BSP_PROVIDER || null;
  return {
    easyOnboarding: {
      enabled: env.WHATSAPP_EASY_ONBOARDING_ENABLED,
      selfService: embedded,
      channel: embedded ? "EMBEDDED_SIGNUP" : bsp ? "BSP" : "ASSISTED",
      bspProvider: bsp,
    },
    embeddedSignup: embeddedConfig,
    manualCloudApi: { enabled: true },
    demoSandbox: {
      enabled: SendwaryDemoWhatsAppProvider.isConfigured(),
      displayNumber: env.WHATSAPP_DEMO_DISPLAY_NUMBER ?? null,
      messageLimit: env.WHATSAPP_DEMO_MESSAGE_LIMIT,
    },
    providers: listWhatsAppProviders(),
  };
}

/** URL que el cliente pega en el panel de Meta (App > WhatsApp > Configuration). */
export function webhookCallbackUrl(): string {
  return `${env.BACKEND_PUBLIC_URL}/api/whatsapp/webhook`;
}

type IntegrationRow = NonNullable<
  Awaited<ReturnType<typeof prisma.whatsAppIntegration.findFirst>>
>;

async function toPublic(row: IntegrationRow): Promise<WhatsAppIntegrationPublic> {
  // Sin número aún (solicitud de conexión guiada): no hay agentes asignados.
  const agents = row.phoneNumberId
    ? await prisma.agent.findMany({
        where: { tenantId: row.tenantId, whatsappPhoneNumberId: row.phoneNumberId },
        select: { id: true, name: true, status: true },
      })
    : [];
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    businessName: row.businessName,
    businessAccountId: row.businessAccountId,
    wabaId: row.wabaId ?? row.businessAccountId,
    businessId: row.businessId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    graphApiVersion: row.graphApiVersion,
    verifyToken: row.verifyToken,
    hasToken: Boolean(row.accessTokenEncrypted),
    tokenLastFour: row.tokenLastFour,
    tokenExpiresAt: row.tokenExpiresAt,
    webhookUrl: row.webhookUrl ?? webhookCallbackUrl(),
    webhookVerifiedAt: row.webhookVerifiedAt,
    webhookSubscribedAt: row.webhookSubscribedAt,
    embeddedSignupCompletedAt: row.embeddedSignupCompletedAt,
    lastValidationAt: row.lastValidationAt,
    lastValidationError: row.lastValidationError,
    assistedSetupRequestedAt: row.assistedSetupRequestedAt,
    assistedSetupStartedAt: row.assistedSetupStartedAt,
    demoMessagesUsed: row.demoMessagesUsed,
    demoMessageLimit: row.mode === "DEMO_SANDBOX" ? env.WHATSAPP_DEMO_MESSAGE_LIMIT : null,
    numberReadiness: row.numberReadiness,
    readinessStage: row.readinessStage,
    declaredNumberType: row.declaredNumberType,
    declaredPhoneNumberMasked: row.declaredPhoneNumber
      ? maskPhoneNumber(row.declaredPhoneNumber)
      : null,
    currentProvider: row.currentProvider,
    readinessRecommendation: row.readinessRecommendation,
    readinessUpdatedAt: row.readinessUpdatedAt,
    assignedAgents: agents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listWhatsAppIntegrations(tenantId: string): Promise<WhatsAppIntegrationPublic[]> {
  const rows = await prisma.whatsAppIntegration.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(rows.map(toPublic));
}

export interface UpsertWhatsAppIntegrationInput {
  phoneNumberId: string;
  accessToken?: string | null; // solo se actualiza si viene; nunca se borra implícitamente
  businessName?: string | null;
  businessAccountId?: string | null; // WABA ID
  businessId?: string | null; // Meta Business ID
  displayPhoneNumber?: string | null;
  graphApiVersion?: string;
  verifyToken?: string; // editable; si no existe se genera
  disabled?: boolean;
}

// Formato razonable de un token de Meta (EAA... largo). No garantiza validez
// (eso lo hace /validate contra Graph), pero corta basura obvia y espacios.
function assertTokenFormat(token: string): void {
  const t = token.trim();
  if (t.length < 40 || t.length > 600 || /\s/.test(t)) {
    throw new AppError(
      "El access token no tiene un formato válido. Copia el token completo desde Meta (sin espacios).",
      400
    );
  }
}

function assertPhoneNumberIdFormat(phoneNumberId: string): void {
  if (!/^\d{5,25}$/.test(phoneNumberId.trim())) {
    throw new AppError(
      "El Phone Number ID debe ser numérico (lo encuentras en Meta: WhatsApp > API Setup).",
      400
    );
  }
}

export async function upsertWhatsAppIntegration(
  tenantId: string,
  input: UpsertWhatsAppIntegrationInput
): Promise<WhatsAppIntegrationPublic> {
  const phoneNumberId = input.phoneNumberId.trim();
  assertPhoneNumberIdFormat(phoneNumberId);

  // phoneNumberId es único global: si otro tenant ya lo registró, rechazar claro.
  const existing = await prisma.whatsAppIntegration.findUnique({ where: { phoneNumberId } });
  if (existing && existing.tenantId !== tenantId) {
    throw new AppError("Ese Phone Number ID ya está registrado por otra empresa.", 409);
  }

  let tokenFields: {
    accessTokenEncrypted?: string;
    tokenLastFour?: string;
  } = {};
  if (input.accessToken) {
    assertTokenFormat(input.accessToken);
    const token = input.accessToken.trim();
    tokenFields = {
      accessTokenEncrypted: encryptJson({ token }),
      tokenLastFour: token.slice(-4),
    };
  }

  const shared = {
    businessName: input.businessName?.trim() || null,
    businessAccountId: input.businessAccountId?.trim() || null,
    businessId: input.businessId?.trim() || null,
    displayPhoneNumber: input.displayPhoneNumber?.trim() || null,
    ...(input.graphApiVersion ? { graphApiVersion: input.graphApiVersion.trim() } : {}),
    ...(input.verifyToken?.trim() ? { verifyToken: input.verifyToken.trim() } : {}),
    webhookUrl: webhookCallbackUrl(),
    ...tokenFields,
  };

  // Si el tenant ya tenía una fila SIN número (solicitud de conexión guiada),
  // se completa esa misma en vez de crear una segunda.
  const pendingRow =
    existing ??
    (await prisma.whatsAppIntegration.findFirst({
      where: { tenantId, phoneNumberId: null },
      orderBy: { createdAt: "asc" },
    }));

  let row: IntegrationRow;
  if (pendingRow) {
    row = await prisma.whatsAppIntegration.update({
      where: { id: pendingRow.id },
      data: {
        ...shared,
        phoneNumberId,
        // Config manual completada: el modo pasa a MANUAL_CLOUD_API salvo demo.
        ...(pendingRow.mode === "DEMO_SANDBOX" ? {} : { mode: "MANUAL_CLOUD_API" as const }),
        provider: pendingRow.mode === "DEMO_SANDBOX" ? pendingRow.provider : ("META_CLOUD" as const),
        // Editar la config vuelve a DRAFT (hay que revalidar), salvo disable explícito.
        status: input.disabled ? "DISABLED" : "DRAFT",
        lastValidationError: null,
      },
    });
  } else {
    row = await prisma.whatsAppIntegration.create({
      data: {
        tenantId,
        phoneNumberId,
        mode: "MANUAL_CLOUD_API",
        provider: "META_CLOUD",
        ...shared,
        verifyToken: input.verifyToken?.trim() || `sendwary_${generateToken(16)}`,
        status: input.disabled ? "DISABLED" : "DRAFT",
      },
    });
  }

  logger.info(
    `[WHATSAPP INTEGRATION] config ${existing ? "actualizada" : "creada"} (tenant ${tenantId}, phoneNumberId ${phoneNumberId})`
  );
  return toPublic(row);
}

/** Descifra el token de una integración. SOLO uso server-side. */
export function decryptAccessToken(row: { accessTokenEncrypted: string | null }): string | null {
  if (!row.accessTokenEncrypted) return null;
  try {
    const data = decryptJson(row.accessTokenEncrypted);
    return typeof data.token === "string" ? data.token : null;
  } catch (err) {
    logger.error(`[WHATSAPP INTEGRATION] no se pudo descifrar el token: ${String(err)}`);
    return null;
  }
}

/**
 * Valida token + phoneNumberId contra la Graph API de Meta.
 * GET /{phoneNumberId}?fields=... con el token del tenant: si responde, el
 * token es válido Y el número pertenece a ese token. Nunca envía mensajes.
 */
export async function validateWhatsAppIntegration(
  tenantId: string,
  integrationId: string
): Promise<WhatsAppIntegrationPublic> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { id: integrationId, tenantId },
  });
  if (!row) throw new AppError("Integración de WhatsApp no encontrada", 404);

  const ctx = await providerContextFor(row);
  if (!ctx) {
    throw new AppError(
      row.phoneNumberId
        ? "Guarda primero un access token para poder validar."
        : "Todavía no hay un número de WhatsApp asociado a esta conexión.",
      400
    );
  }

  const provider = getWhatsAppProvider(row.provider);
  const result = await provider.validateConnection(ctx);

  const updated = await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: result.ok
      ? {
          status: "CONNECTED",
          displayPhoneNumber: result.data?.displayPhoneNumber ?? row.displayPhoneNumber,
          businessName: result.data?.verifiedName ?? row.businessName,
          lastValidationAt: new Date(),
          lastValidationError: null,
        }
      : {
          status: "ERROR",
          lastValidationAt: new Date(),
          lastValidationError: result.error ?? "No se pudo validar la conexión.",
        },
  });

  if (result.ok) {
    logger.info(
      `[WHATSAPP INTEGRATION] validación OK (tenant ${tenantId}, provider ${row.provider}, número ${result.data?.displayPhoneNumber ?? row.phoneNumberId}, calidad ${result.data?.qualityRating ?? "?"})`
    );
  } else {
    logger.warn(
      `[WHATSAPP INTEGRATION] validación FALLÓ (tenant ${tenantId}, provider ${row.provider}): ${result.error}`
    );
  }

  return toPublic(updated);
}

/**
 * Contexto de envío del proveedor para una integración concreta.
 * Demo usa las credenciales globales de Sendwary; el resto, el token cifrado
 * del propio tenant. Nunca mezcla los dos.
 */
async function providerContextFor(row: IntegrationRow): Promise<ProviderContext | null> {
  if (row.mode === "DEMO_SANDBOX") {
    return SendwaryDemoWhatsAppProvider.demoContext();
  }
  const token = decryptAccessToken(row);
  if (!token || !row.phoneNumberId) return null;
  return {
    accessToken: token,
    phoneNumberId: row.phoneNumberId,
    graphApiVersion: row.graphApiVersion,
  };
}

// ─── Embedded Signup (flujo oficial de Meta) ─────────────────────────────────

export interface EmbeddedSignupInput {
  /** Code de Meta (TTL 30s). No se persiste: se intercambia y se descarta. */
  code?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  businessId?: string | null;
  displayPhoneNumber?: string | null;
  /** Evento del postMessage: FINISH, FINISH_ONLY_WABA, CANCEL… */
  event?: string | null;
}

/** Número de la WABA expuesto al frontend. Nunca incluye credenciales. */
export interface SelectablePhoneNumber {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  status: string | null;
}

export interface EmbeddedSignupResult {
  status: string;
  mode: string;
  provider: string;
  displayPhoneNumber: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  businessId: string | null;
  /**
   * Números que Meta devolvió para la WABA. Se llena cuando el cliente tiene
   * MÁS DE UNO y hay que preguntarle cuál usar: elegir uno al azar conectaría
   * el número equivocado en silencio.
   */
  availablePhoneNumbers: SelectablePhoneNumber[];
  /** Qué debe pasar ahora, en lenguaje de negocio. */
  nextStep: string;
  /** Mensaje amigable de resultado (nunca error técnico crudo). */
  message: string;
  webhookSubscribed: boolean;
  warning?: string;
}

/** Mapea un número de la Graph API al shape público (sin credenciales). */
function toSelectablePhoneNumber(n: WabaPhoneNumber): SelectablePhoneNumber {
  return {
    id: n.id,
    displayPhoneNumber: n.display_phone_number,
    verifiedName: n.verified_name,
    qualityRating: n.quality_rating,
    status: n.status,
  };
}

/** Metadata del flujo SIN secretos (nunca el code ni el token). */
function sanitizeSignupMetadata(input: EmbeddedSignupInput) {
  return {
    embeddedSignup: {
      event: input.event ?? null,
      wabaId: input.wabaId ?? null,
      businessId: input.businessId ?? null,
      phoneNumberId: input.phoneNumberId ?? null,
      completedAt: new Date().toISOString(),
    },
  };
}

/**
 * Cierra el flujo de Embedded Signup en el backend.
 *
 * Reglas duras:
 * - CONNECTED solo si hay wabaId + phoneNumberId + token utilizable. Si falta
 *   algo → REQUIRES_ACTION con un mensaje accionable (jamás se le dice al
 *   cliente que está conectado si Meta no confirmó lo suficiente).
 * - El token se cifra antes de guardarse; el code nunca se persiste.
 * - Si la suscripción a webhooks falla, la conexión NO se cae: queda
 *   CONNECTED con warning para que el equipo la reintente.
 */
export async function completeEmbeddedSignup(
  tenantId: string,
  input: EmbeddedSignupInput
): Promise<EmbeddedSignupResult> {
  if (!isEmbeddedSignupConfigured()) {
    throw AppError.fromCode("SERVICE_NOT_CONFIGURED", {
      message:
        "La conexión automática con Meta está en preparación. Puedes solicitar asistencia o usar la configuración avanzada.",
      internalMessage: "embedded signup deshabilitado o sin credenciales",
    });
  }

  const existing = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  // 1) Intercambiar el code por el business token del cliente
  let accessToken: string | null = null;
  let tokenExpiresAt: Date | null = null;
  let exchangeError: string | null = null;

  if (input.code) {
    const exchange = await exchangeCodeForBusinessToken(input.code);
    if (exchange.ok && exchange.data) {
      accessToken = exchange.data.accessToken;
      tokenExpiresAt = exchange.data.expiresIn
        ? new Date(Date.now() + exchange.data.expiresIn * 1000)
        : null;
    } else {
      exchangeError = exchange.error ?? "No pudimos completar la conexión con Meta.";
    }
  }

  // 2) Confirmar WABA y números. Si Meta no mandó el phone_number_id por
  //    postMessage, se intenta resolver listando los números de la WABA.
  let wabaId = input.wabaId?.trim() || null;
  let phoneNumberId = input.phoneNumberId?.trim() || null;
  let displayPhoneNumber = input.displayPhoneNumber?.trim() || null;
  let businessName: string | null = null;

  // Números de la WABA que hay que mostrarle al cliente para que elija.
  let availablePhoneNumbers: SelectablePhoneNumber[] = [];
  // true cuando Meta devolvió varios números y ninguno viene preseleccionado
  let needsPhoneChoice = false;

  if (accessToken && wabaId) {
    const numbers = await getWabaPhoneNumbers({ wabaId, accessToken });
    if (numbers.ok && numbers.data?.length) {
      const rows = numbers.data;
      const preselected = phoneNumberId ? rows.find((n) => n.id === phoneNumberId) : null;

      if (preselected) {
        // Meta ya dijo cuál por postMessage: se confirma contra la WABA.
        phoneNumberId = preselected.id;
        displayPhoneNumber = preselected.display_phone_number ?? displayPhoneNumber;
        businessName = preselected.verified_name ?? null;
      } else if (rows.length === 1) {
        // Un solo número: no hay ambigüedad posible, se selecciona.
        phoneNumberId = rows[0].id;
        displayPhoneNumber = rows[0].display_phone_number ?? displayPhoneNumber;
        businessName = rows[0].verified_name ?? null;
      } else {
        // Varios números y Meta no indicó cuál. NO se adivina: se deja sin
        // número y el cliente elige en /embedded-signup/select-phone-number.
        phoneNumberId = null;
        needsPhoneChoice = true;
      }

      availablePhoneNumbers = rows.map(toSelectablePhoneNumber);
    } else if (!numbers.ok) {
      logger.warn(`[EMBEDDED SIGNUP] no se pudieron listar números de la WABA: ${numbers.error}`);
    }
  }

  // 3) Estado final según lo que Meta realmente confirmó
  const hasMinimum = Boolean(wabaId && phoneNumberId && accessToken);
  let status: "CONNECTED" | "REQUIRES_ACTION" = hasMinimum ? "CONNECTED" : "REQUIRES_ACTION";
  let nextStep = "";
  let validationError: string | null = null;

  if (!hasMinimum) {
    if (exchangeError) {
      validationError = exchangeError;
      nextStep = "Vuelve a intentar la conexión o solicita asistencia a nuestro equipo.";
    } else if (needsPhoneChoice) {
      // No es un fallo: falta que el cliente elija entre sus números.
      validationError = null;
      nextStep = "Selecciona el número que usará Sendwary para responder por WhatsApp.";
    } else if (input.event === "FINISH_ONLY_WABA") {
      // Evento oficial de Meta: se creó la WABA pero sin número de teléfono.
      validationError =
        "Creaste tu cuenta de WhatsApp Business, pero todavía no tiene un número de teléfono asociado.";
      nextStep = "Agrega un número a tu cuenta de WhatsApp Business y repite la conexión.";
    } else if (!phoneNumberId) {
      validationError =
        "Meta no devolvió un número conectado. Revisa que hayas seleccionado o registrado un número durante el proceso.";
      nextStep = "Repite la conexión seleccionando un número, o solicita asistencia.";
    } else if (!wabaId) {
      validationError =
        "Meta no devolvió tu cuenta de WhatsApp Business. Repite el proceso completo o solicita asistencia.";
      nextStep = "Repite la conexión o solicita asistencia.";
    } else {
      validationError =
        "No recibimos las credenciales necesarias desde Meta. Puedes intentar nuevamente o solicitar asistencia.";
      nextStep = "Intenta nuevamente o solicita asistencia.";
    }
  }

  // 4) Persistir (token cifrado; el code nunca se guarda)
  const tokenFields = accessToken
    ? {
        accessTokenEncrypted: encryptJson({ token: accessToken }),
        tokenLastFour: accessToken.slice(-4),
        tokenExpiresAt,
      }
    : {};

  // phoneNumberId es único global: si otro tenant ya lo tiene, se corta aquí
  // (nunca se mezclan números entre empresas).
  if (phoneNumberId) {
    const owner = await prisma.whatsAppIntegration.findUnique({ where: { phoneNumberId } });
    if (owner && owner.tenantId !== tenantId) {
      throw new AppError("Ese número de WhatsApp ya está registrado por otra empresa.", 409);
    }
  }

  const shared = {
    mode: "EASY_ONBOARDING" as const,
    provider: "META_CLOUD" as const,
    status,
    wabaId,
    // Compat: la config manual y la UI antigua leen businessAccountId
    businessAccountId: wabaId,
    businessId: input.businessId?.trim() || null,
    ...(phoneNumberId ? { phoneNumberId } : {}),
    displayPhoneNumber,
    ...(businessName ? { businessName } : {}),
    graphApiVersion: env.META_GRAPH_API_VERSION,
    webhookUrl: webhookCallbackUrl(),
    embeddedSignupCompletedAt: new Date(),
    lastValidationAt: new Date(),
    lastValidationError: validationError,
    numberReadiness: (hasMinimum ? "CONNECTED" : "NEEDS_ASSISTED_SETUP") as never,
    readinessStage: (hasMinimum ? "CONNECTED" : "REQUIRES_CUSTOMER_ACTION") as never,
    metadataJson: sanitizeSignupMetadata(input) as never,
    ...tokenFields,
  };

  let row = existing
    ? await prisma.whatsAppIntegration.update({ where: { id: existing.id }, data: shared })
    : await prisma.whatsAppIntegration.create({
        data: {
          tenantId,
          verifyToken: `sendwary_${generateToken(16)}`,
          ...shared,
        },
      });

  // 5) Suscribir la app a los webhooks de la WABA (no bloqueante)
  let webhookSubscribed = false;
  let warning: string | undefined;

  if (accessToken && wabaId) {
    const sub = await subscribeAppToWaba({ wabaId, accessToken });
    if (sub.ok) {
      webhookSubscribed = true;
      row = await prisma.whatsAppIntegration.update({
        where: { id: row.id },
        data: { webhookSubscribedAt: new Date(), webhookVerifiedAt: new Date() },
      });
    } else {
      warning =
        "Conectamos tu número, pero no pudimos activar la recepción automática de mensajes. Nuestro equipo lo revisará.";
      row = await prisma.whatsAppIntegration.update({
        where: { id: row.id },
        data: { lastValidationError: sub.error ?? warning },
      });
      logger.warn(`[EMBEDDED SIGNUP] webhook no suscrito para tenant ${tenantId}: ${sub.error}`);
    }
  }

  if (status === "CONNECTED") {
    nextStep = "Asigna este número a uno de tus agentes IA para que empiece a responder.";
  }

  logger.info(
    `[EMBEDDED SIGNUP] tenant=${tenantId} status=${status} waba=${wabaId ?? "—"} phoneNumberId=${phoneNumberId ?? "—"} webhook=${webhookSubscribed}`
  );

  const message =
    status === "CONNECTED"
      ? `Conectamos tu número${row.displayPhoneNumber ? ` ${row.displayPhoneNumber}` : ""} correctamente.`
      : needsPhoneChoice
        ? "Tu cuenta de WhatsApp Business tiene varios números disponibles."
        : (validationError ??
          "No pudimos completar la conexión con Meta. Puedes intentar nuevamente o solicitar asistencia.");

  return {
    status: row.status,
    mode: row.mode,
    provider: row.provider,
    displayPhoneNumber: row.displayPhoneNumber,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    businessId: row.businessId,
    // Solo se devuelven cuando hay que elegir: si ya hay número, la lista no
    // aporta nada y solo expondría otros números del cliente.
    availablePhoneNumbers: needsPhoneChoice ? availablePhoneNumbers : [],
    nextStep,
    message,
    webhookSubscribed,
    ...(warning ? { warning } : {}),
  };
}

/**
 * Parte D: el cliente elige cuál de los números de su WABA usará Sendwary.
 *
 * Se vuelve a consultar la Graph API en vez de confiar en el id que manda el
 * navegador: así se garantiza que el número pertenece de verdad a la WABA de
 * ESTE tenant y no a otra cuenta.
 */
export async function selectEmbeddedSignupPhoneNumber(
  tenantId: string,
  phoneNumberId: string
): Promise<EmbeddedSignupResult> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!row) throw new AppError("Todavía no has iniciado la conexión con Meta.", 404);
  if (!row.wabaId) {
    throw new AppError(
      "Tu conexión no tiene una cuenta de WhatsApp Business asociada. Repite la conexión con Meta.",
      400
    );
  }

  const token = decryptAccessToken(row);
  if (!token) {
    throw new AppError(
      "Tu conexión no tiene credenciales guardadas. Repite la conexión con Meta o solicita asistencia.",
      400
    );
  }

  const numbers = await getWabaPhoneNumbers({ wabaId: row.wabaId, accessToken: token });
  if (!numbers.ok || !numbers.data?.length) {
    throw new AppError(
      "No pudimos consultar los números de tu cuenta de WhatsApp Business. Intenta nuevamente o solicita asistencia.",
      502
    );
  }

  const chosen = numbers.data.find((n) => n.id === phoneNumberId);
  if (!chosen) {
    throw new AppError("Ese número no pertenece a tu cuenta de WhatsApp Business.", 400);
  }

  // phoneNumberId es único global: nunca se roba el número de otra empresa.
  const owner = await prisma.whatsAppIntegration.findUnique({ where: { phoneNumberId } });
  if (owner && owner.tenantId !== tenantId) {
    throw new AppError("Ese número de WhatsApp ya está registrado por otra empresa.", 409);
  }

  const updated = await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: {
      phoneNumberId: chosen.id,
      displayPhoneNumber: chosen.display_phone_number ?? null,
      ...(chosen.verified_name ? { businessName: chosen.verified_name } : {}),
      status: "CONNECTED",
      lastValidationAt: new Date(),
      lastValidationError: null,
      numberReadiness: "CONNECTED" as never,
      readinessStage: "CONNECTED" as never,
    },
  });

  // El webhook se suscribe a nivel WABA; si aún no se hizo, se reintenta ahora.
  let webhookSubscribed = Boolean(updated.webhookSubscribedAt);
  let warning: string | undefined;
  if (!webhookSubscribed) {
    const sub = await subscribeAppToWaba({ wabaId: row.wabaId, accessToken: token });
    if (sub.ok) {
      webhookSubscribed = true;
      await prisma.whatsAppIntegration.update({
        where: { id: updated.id },
        data: { webhookSubscribedAt: new Date(), webhookVerifiedAt: new Date() },
      });
    } else {
      warning =
        "Conectamos tu número, pero no pudimos activar la recepción automática de mensajes. Nuestro equipo lo revisará.";
    }
  }

  logger.info(
    `[EMBEDDED SIGNUP] tenant=${tenantId} número seleccionado phoneNumberId=${chosen.id} webhook=${webhookSubscribed}`
  );

  return {
    status: updated.status,
    mode: updated.mode,
    provider: updated.provider,
    displayPhoneNumber: updated.displayPhoneNumber,
    phoneNumberId: updated.phoneNumberId,
    wabaId: updated.wabaId,
    businessId: updated.businessId,
    availablePhoneNumbers: [],
    nextStep: "Asigna este número a uno de tus agentes IA para que empiece a responder.",
    message: `Conectamos tu número${updated.displayPhoneNumber ? ` ${updated.displayPhoneNumber}` : ""} correctamente.`,
    webhookSubscribed,
    ...(warning ? { warning } : {}),
  };
}

/** Reintento manual de la suscripción a webhooks (panel admin). */
export async function retryWebhookSubscription(
  tenantId: string
): Promise<{ subscribed: boolean; message: string }> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!row) throw new AppError("Esta empresa no tiene conexión de WhatsApp registrada", 404);
  if (!row.wabaId) {
    return {
      subscribed: false,
      message: "Esta conexión no tiene una cuenta de WhatsApp Business (WABA) asociada.",
    };
  }
  const token = decryptAccessToken(row);
  if (!token) {
    return { subscribed: false, message: "La conexión no tiene credenciales guardadas." };
  }

  const sub = await subscribeAppToWaba({ wabaId: row.wabaId, accessToken: token });
  if (sub.ok) {
    await prisma.whatsAppIntegration.update({
      where: { id: row.id },
      data: { webhookSubscribedAt: new Date(), webhookVerifiedAt: new Date(), lastValidationError: null },
    });
    return { subscribed: true, message: "Webhooks activados correctamente." };
  }
  await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: { lastValidationError: sub.error ?? "No se pudo suscribir el webhook." },
  });
  return { subscribed: false, message: sub.error ?? "No se pudo activar la recepción de mensajes." };
}

// ─── Preparación del número (wizard "Preparar número") ───────────────────────

export interface SaveNumberReadinessInput {
  declaredNumberType: DeclaredNumberType;
  phoneNumber?: string | null;
  currentProvider?: string | null;
  notes?: string | null;
}

/**
 * Guarda lo que el cliente declaró sobre su número y devuelve la evaluación
 * (recomendación honesta). No conecta nada: solo deja constancia del estado
 * real del número para que el cliente y el equipo vean lo mismo.
 *
 * Nunca marca la integración como CONNECTED: eso solo ocurre tras validar
 * contra la API oficial.
 */
export async function saveNumberReadiness(
  tenantId: string,
  input: SaveNumberReadinessInput
): Promise<{ integration: WhatsAppIntegrationPublic; assessment: ReadinessAssessment }> {
  const caps = getWhatsAppCapabilities();
  const assessment = assessNumberReadiness({
    declaredNumberType: input.declaredNumberType,
    embeddedSignupAvailable: caps.easyOnboarding.selfService,
    demoAvailable: caps.demoSandbox.enabled,
  });

  const existing = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  // Una integración ya conectada no se degrada por rellenar el wizard.
  const readiness = existing?.status === "CONNECTED" ? "CONNECTED" : assessment.readiness;

  const shared = {
    numberReadiness: readiness as never,
    readinessStage:
      existing?.status === "CONNECTED" ? ("CONNECTED" as const) : ("PENDING" as const),
    declaredNumberType: input.declaredNumberType,
    declaredPhoneNumber: input.phoneNumber?.trim() || null,
    currentProvider: input.currentProvider?.trim() || null,
    readinessRecommendation: assessment.title,
    readinessNotes: input.notes?.trim() || null,
    readinessUpdatedAt: new Date(),
  };

  const row = existing
    ? await prisma.whatsAppIntegration.update({ where: { id: existing.id }, data: shared })
    : await prisma.whatsAppIntegration.create({
        data: {
          tenantId,
          // Modo tentativo: el cliente aún no eligió cómo conectar. Si va a
          // configuración avanzada, el upsert lo cambia a MANUAL_CLOUD_API.
          mode: input.declaredNumberType === "CLOUD_API" ? "MANUAL_CLOUD_API" : "EASY_ONBOARDING",
          status: "REQUIRES_ACTION",
          verifyToken: `sendwary_${generateToken(16)}`,
          webhookUrl: webhookCallbackUrl(),
          ...shared,
        },
      });

  logger.info(
    `[WHATSAPP READINESS] tenant=${tenantId} tipo=${input.declaredNumberType} readiness=${readiness} numero=${maskPhoneNumber(input.phoneNumber)}`
  );

  return { integration: await toPublic(row), assessment };
}

// ─── Conexión guiada (asistida por el equipo Sendwary) ───────────────────────

export interface AssistedSetupInput {
  businessName?: string | null;
  contactPhone?: string | null;
  desiredNumber?: string | null;
  hasMetaBusinessAccount?: boolean;
  hasAdminAccess?: boolean;
  hasAvailableNumber?: boolean;
  notes?: string | null;
}

/**
 * El cliente pide que Sendwary le conecte WhatsApp. Crea (o actualiza) la
 * integración en modo EASY_ONBOARDING con status CONNECTING y abre un ticket
 * de soporte para el equipo. Idempotente: repetir la solicitud no duplica
 * integraciones y solo refresca los datos.
 */
export async function requestAssistedSetup(
  tenantId: string,
  user: { id: string; name: string; email: string },
  input: AssistedSetupInput
): Promise<{ integration: WhatsAppIntegrationPublic; ticketId: string | null }> {
  if (!env.WHATSAPP_EASY_ONBOARDING_ENABLED) {
    throw new AppError(
      "La conexión guiada no está disponible en este momento. Usa la configuración avanzada o escríbenos.",
      503
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const existing = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  if (existing?.status === "CONNECTED") {
    throw new AppError("Tu WhatsApp ya está conectado. Si necesitas cambios, contáctanos.", 409);
  }

  const now = new Date();
  const checklist = {
    hasMetaBusinessAccount: Boolean(input.hasMetaBusinessAccount),
    hasAdminAccess: Boolean(input.hasAdminAccess),
    hasAvailableNumber: Boolean(input.hasAvailableNumber),
  };
  const metadata = {
    assistedSetup: {
      requestedBy: { id: user.id, name: user.name, email: user.email },
      contactPhone: input.contactPhone?.trim() || null,
      desiredNumber: input.desiredNumber?.trim() || null,
      checklist,
      notes: input.notes?.trim() || null,
      requestedAt: now.toISOString(),
    },
  };

  const row = existing
    ? await prisma.whatsAppIntegration.update({
        where: { id: existing.id },
        data: {
          mode: "EASY_ONBOARDING",
          status: "CONNECTING",
          businessName: input.businessName?.trim() || existing.businessName || tenant?.name || null,
          assistedSetupRequestedAt: existing.assistedSetupRequestedAt ?? now,
          assistedSetupRequestedByUserId: user.id,
          // El número queda a la espera del equipo. Si el cliente declaró un
          // tipo concreto (personal, BSP…) ese diagnóstico se conserva.
          numberReadiness:
            existing.numberReadiness === "UNKNOWN"
              ? "NEEDS_ASSISTED_SETUP"
              : existing.numberReadiness,
          readinessStage: "PENDING",
          ...(input.desiredNumber?.trim() && !existing.declaredPhoneNumber
            ? { declaredPhoneNumber: input.desiredNumber.trim() }
            : {}),
          metadataJson: metadata as never,
        },
      })
    : await prisma.whatsAppIntegration.create({
        data: {
          tenantId,
          mode: "EASY_ONBOARDING",
          provider: "META_CLOUD",
          status: "CONNECTING",
          businessName: input.businessName?.trim() || tenant?.name || null,
          verifyToken: `sendwary_${generateToken(16)}`,
          webhookUrl: webhookCallbackUrl(),
          assistedSetupRequestedAt: now,
          assistedSetupRequestedByUserId: user.id,
          numberReadiness: "NEEDS_ASSISTED_SETUP",
          readinessStage: "PENDING",
          ...(input.desiredNumber?.trim()
            ? { declaredPhoneNumber: input.desiredNumber.trim() }
            : {}),
          metadataJson: metadata as never,
        },
      });

  // Contexto de preparación del número (si pasó por el wizard): el equipo ve
  // exactamente la misma recomendación que vio el cliente.
  const declaredType = (row.declaredNumberType ?? null) as DeclaredNumberType | null;
  const assessment = declaredType
    ? assessNumberReadiness({
        declaredNumberType: declaredType,
        embeddedSignupAvailable: getWhatsAppCapabilities().easyOnboarding.selfService,
      })
    : null;

  // Ticket de soporte para el equipo (no bloqueante: la solicitud vale igual).
  // El número va ENMASCARADO y nunca se incluyen tokens ni credenciales.
  let ticketId: string | null = null;
  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId,
        userId: user.id,
        createdByUserId: user.id,
        title: `Conexión asistida de WhatsApp — ${tenant?.name ?? tenantId}`,
        description: [
          `El cliente solicitó ayuda para conectar WhatsApp.`,
          `Negocio: ${input.businessName?.trim() || tenant?.name || "—"}`,
          `Contacto: ${input.contactPhone?.trim() || user.email}`,
          declaredType
            ? `Tipo de número declarado: ${NUMBER_TYPE_LABELS[declaredType]}`
            : "Tipo de número: no declarado (no pasó por el wizard)",
          `Número (enmascarado): ${maskPhoneNumber(row.declaredPhoneNumber ?? input.desiredNumber)}`,
          row.currentProvider ? `Proveedor actual: ${row.currentProvider}` : "",
          assessment ? `Recomendación mostrada al cliente: ${assessment.title}` : "",
          `Estado del número: ${row.numberReadiness}`,
          `Cuenta Meta Business: ${checklist.hasMetaBusinessAccount ? "sí" : "no"}`,
          `Acceso administrador: ${checklist.hasAdminAccess ? "sí" : "no"}`,
          `Número disponible: ${checklist.hasAvailableNumber ? "sí" : "no"}`,
          row.readinessNotes ? `Notas del wizard: ${row.readinessNotes}` : "",
          input.notes?.trim() ? `Notas de la solicitud: ${input.notes.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        category: "WHATSAPP_SETUP",
        // Cloud API propio es autoservicio (TIER_1); migraciones y números
        // nuevos requieren trabajo del equipo (TIER_2).
        tier: assessment?.supportTier ?? "TIER_2",
        severity: "MEDIUM",
        source: "USER",
        status: "OPEN",
      },
    });
    ticketId = ticket.id;
  } catch (err) {
    logger.error(`[WHATSAPP INTEGRATION] no se pudo crear el ticket de asistencia: ${String(err)}`);
  }

  logger.info(
    `[WHATSAPP INTEGRATION] conexión asistida solicitada (tenant ${tenantId}, usuario ${user.id}, ticket ${ticketId ?? "—"})`
  );
  return { integration: await toPublic(row), ticketId };
}

// ─── Modo demo (número de Sendwary) ──────────────────────────────────────────

/**
 * Activa el número demo para el tenant. El transporte usa el token global de
 * Sendwary, por eso está limitado por cuota (WHATSAPP_DEMO_MESSAGE_LIMIT) y
 * bloqueado si el entorno no lo habilita explícitamente.
 */
export async function enableDemoSandbox(tenantId: string): Promise<WhatsAppIntegrationPublic> {
  if (!SendwaryDemoWhatsAppProvider.isConfigured()) {
    throw new AppError(
      "El modo demo no está disponible en este entorno. Conecta tu propio número o solicita la conexión guiada.",
      503
    );
  }

  const existing = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (existing?.status === "CONNECTED" && existing.mode !== "DEMO_SANDBOX") {
    throw new AppError(
      "Ya tienes un número real conectado. El modo demo solo está pensado para probar antes de conectar el tuyo.",
      409
    );
  }

  const demoPhoneNumberId = env.WHATSAPP_DEMO_PHONE_NUMBER_ID!;
  const shared = {
    mode: "DEMO_SANDBOX" as const,
    provider: "SENDWARY_DEMO" as const,
    status: "CONNECTED" as const,
    displayPhoneNumber: env.WHATSAPP_DEMO_DISPLAY_NUMBER ?? null,
    businessName: "Sendwary Demo",
    lastValidationAt: new Date(),
    lastValidationError: null,
  };

  // El phoneNumberId demo es de la plataforma y es único global: si ya lo tiene
  // otro tenant, este tenant usa la fila demo SIN número propio (el envío usa
  // el contexto demo global igualmente).
  const demoTakenByOther = await prisma.whatsAppIntegration.findUnique({
    where: { phoneNumberId: demoPhoneNumberId },
  });
  const canOwnDemoNumber = !demoTakenByOther || demoTakenByOther.tenantId === tenantId;

  const row = existing
    ? await prisma.whatsAppIntegration.update({
        where: { id: existing.id },
        data: { ...shared, ...(canOwnDemoNumber ? { phoneNumberId: demoPhoneNumberId } : {}) },
      })
    : await prisma.whatsAppIntegration.create({
        data: {
          tenantId,
          ...shared,
          ...(canOwnDemoNumber ? { phoneNumberId: demoPhoneNumberId } : {}),
          verifyToken: `sendwary_${generateToken(16)}`,
          webhookUrl: webhookCallbackUrl(),
        },
      });

  logger.info(`[WHATSAPP DEMO] modo demo activado (tenant ${tenantId})`);
  return toPublic(row);
}

/** Consume una unidad de la cuota demo. Devuelve false si ya se agotó. */
export async function consumeDemoQuota(integrationId: string): Promise<boolean> {
  const row = await prisma.whatsAppIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.mode !== "DEMO_SANDBOX") return true; // no aplica cuota
  if (row.demoMessagesUsed >= env.WHATSAPP_DEMO_MESSAGE_LIMIT) return false;
  await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: { demoMessagesUsed: { increment: 1 } },
  });
  return true;
}

// ─── Health check ────────────────────────────────────────────────────────────

export interface WhatsAppHealth {
  configured: boolean;
  mode: string | null;
  provider: string | null;
  status: string | null;
  healthy: boolean;
  /** Mensaje amigable (nunca error técnico crudo). */
  message: string;
  qualityRating: string | null;
  checkedAt: string;
  checklist: { label: string; done: boolean }[];
  // Detalle operativo. NUNCA incluye el token: solo si existe o no.
  tokenConfigured: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  webhookSubscribedAt: string | null;
  assignedAgent: { id: string; name: string; active: boolean } | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastError: string | null;
  // ── Campos derivados (Parte F) ──
  // Se AÑADEN a los de arriba en vez de renombrarlos: el panel admin y la UI
  // del tenant ya consumen `configured`/`healthy`/`checklist`.
  /** true solo si Meta confirmó lo suficiente para operar. */
  connected: boolean;
  hasWabaId: boolean;
  hasPhoneNumberId: boolean;
  hasToken: boolean;
  webhookSubscribed: boolean;
  assignedAgentActive: boolean;
  /** Siguientes pasos accionables, en lenguaje de negocio. */
  recommendations: string[];
}

/**
 * Deriva los campos de la Parte F a partir del health ya calculado. Es puro:
 * no consulta ni la base ni Meta.
 */
function withHealthDerivations(
  h: Omit<
    WhatsAppHealth,
    | "connected"
    | "hasWabaId"
    | "hasPhoneNumberId"
    | "hasToken"
    | "webhookSubscribed"
    | "assignedAgentActive"
    | "recommendations"
  >
): WhatsAppHealth {
  const hasWabaId = Boolean(h.wabaId);
  const hasPhoneNumberId = Boolean(h.phoneNumberId);
  const hasToken = h.tokenConfigured;
  const webhookSubscribed = Boolean(h.webhookSubscribedAt);
  const assignedAgentActive = Boolean(h.assignedAgent?.active);
  const connected = h.status === "CONNECTED" && hasWabaId && hasPhoneNumberId;

  const recommendations: string[] = [];
  if (!h.configured) {
    recommendations.push("Conecta tu WhatsApp Business para empezar.");
  } else {
    if (!hasWabaId) recommendations.push("Falta la cuenta de WhatsApp Business (WABA).");
    if (!hasPhoneNumberId) recommendations.push("Falta seleccionar el número de WhatsApp.");
    if (!hasToken) recommendations.push("No se pudo validar el token.");
    if (!webhookSubscribed) recommendations.push("El webhook no está confirmado.");
    if (!h.assignedAgent) recommendations.push("Asigna este número a un agente.");
    else if (!assignedAgentActive) recommendations.push("Activa el agente.");
  }
  if (recommendations.length === 0) recommendations.push("Conexión lista.");

  return {
    ...h,
    connected,
    hasWabaId,
    hasPhoneNumberId,
    hasToken,
    webhookSubscribed,
    assignedAgentActive,
    recommendations,
  };
}

/** Bloque operativo del health (compartido por todas las ramas de estado). */
async function healthDetails(
  tenantId: string,
  row: IntegrationRow
): Promise<
  Pick<
    WhatsAppHealth,
    | "tokenConfigured"
    | "wabaId"
    | "phoneNumberId"
    | "webhookSubscribedAt"
    | "assignedAgent"
    | "lastInboundAt"
    | "lastOutboundAt"
    | "lastError"
  >
> {
  const agent = row.phoneNumberId
    ? await prisma.agent.findFirst({
        where: { tenantId, whatsappPhoneNumberId: row.phoneNumberId },
        select: { id: true, name: true, status: true },
      })
    : null;

  // Último tráfico real del tenant (sirve para "está recibiendo/respondiendo")
  const [lastInbound, lastOutbound] = await Promise.all([
    prisma.conversation.findFirst({
      where: { tenantId, lastInboundAt: { not: null } },
      orderBy: { lastInboundAt: "desc" },
      select: { lastInboundAt: true },
    }),
    prisma.conversation.findFirst({
      where: { tenantId, lastOutboundAt: { not: null } },
      orderBy: { lastOutboundAt: "desc" },
      select: { lastOutboundAt: true },
    }),
  ]);

  return {
    tokenConfigured:
      row.mode === "DEMO_SANDBOX" ? true : Boolean(row.accessTokenEncrypted),
    wabaId: row.wabaId ?? row.businessAccountId ?? null,
    phoneNumberId: row.phoneNumberId,
    webhookSubscribedAt: row.webhookSubscribedAt?.toISOString() ?? null,
    assignedAgent: agent ? { id: agent.id, name: agent.name, active: agent.status === "ACTIVE" } : null,
    lastInboundAt: lastInbound?.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: lastOutbound?.lastOutboundAt?.toISOString() ?? null,
    lastError: row.lastValidationError,
  };
}

/**
 * Estado de salud de la conexión, en lenguaje de negocio: qué falta para que
 * el WhatsApp del cliente funcione. No expone tokens ni errores crudos.
 */
/** Health "crudo": el estado observable. Los derivados los añade el wrapper. */
type WhatsAppHealthBase = Omit<
  WhatsAppHealth,
  | "connected"
  | "hasWabaId"
  | "hasPhoneNumberId"
  | "hasToken"
  | "webhookSubscribed"
  | "assignedAgentActive"
  | "recommendations"
>;

export async function getWhatsAppHealth(tenantId: string): Promise<WhatsAppHealth> {
  return withHealthDerivations(await computeWhatsAppHealth(tenantId));
}

async function computeWhatsAppHealth(tenantId: string): Promise<WhatsAppHealthBase> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  const now = new Date().toISOString();
  if (!row) {
    return {
      configured: false,
      mode: null,
      provider: null,
      status: null,
      healthy: false,
      message: "Todavía no has conectado WhatsApp. Elige cómo quieres conectarlo para empezar.",
      qualityRating: null,
      checkedAt: now,
      checklist: [
        { label: "Elegir método de conexión", done: false },
        { label: "Conectar número de WhatsApp", done: false },
        { label: "Asignar un agente IA al número", done: false },
      ],
      tokenConfigured: false,
      wabaId: null,
      phoneNumberId: null,
      webhookSubscribedAt: null,
      assignedAgent: null,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastError: null,
    };
  }

  const details = await healthDetails(tenantId, row);

  const assignedAgents = row.phoneNumberId
    ? await prisma.agent.count({
        where: {
          tenantId,
          whatsappPhoneNumberId: row.phoneNumberId,
          status: "ACTIVE",
        },
      })
    : 0;

  const checklist = [
    { label: "Método de conexión elegido", done: true },
    { label: "Número de WhatsApp asociado", done: Boolean(row.phoneNumberId) },
    {
      label: "Credenciales guardadas",
      done: row.mode === "DEMO_SANDBOX" ? true : Boolean(row.accessTokenEncrypted),
    },
    {
      label: "Recepción de mensajes activada",
      done:
        row.mode === "DEMO_SANDBOX"
          ? true
          : Boolean(row.webhookSubscribedAt ?? row.webhookVerifiedAt),
    },
    { label: "Conexión validada", done: row.status === "CONNECTED" },
    { label: "Agente IA asignado al número", done: assignedAgents > 0 },
  ];

  // Estados que no requieren llamar a Meta: el mensaje sale del propio estado.
  if (row.status !== "CONNECTED") {
    const messages: Record<string, string> = {
      DRAFT: "Falta validar la conexión con Meta. Abre la configuración y pulsa «Validar conexión».",
      CONNECTING:
        "Tu conexión guiada está en proceso. El equipo de Sendwary te contactará para completarla.",
      REQUIRES_ACTION:
        "Necesitamos un dato tuyo para continuar con la conexión. Revisa el correo del equipo de Sendwary.",
      ERROR:
        row.lastValidationError ??
        "La última validación con Meta falló. Revisa tus credenciales e inténtalo de nuevo.",
      DISABLED: "Tu conexión de WhatsApp está deshabilitada.",
    };
    return {
      configured: true,
      mode: row.mode,
      provider: row.provider,
      status: row.status,
      healthy: false,
      message: messages[row.status] ?? "La conexión de WhatsApp aún no está lista.",
      qualityRating: null,
      checkedAt: now,
      checklist,
      ...details,
    };
  }

  const ctx = await providerContextFor(row);
  if (!ctx) {
    return {
      configured: true,
      mode: row.mode,
      provider: row.provider,
      status: row.status,
      healthy: false,
      message: "No encontramos credenciales válidas para tu conexión. Vuelve a guardarlas.",
      qualityRating: null,
      checkedAt: now,
      checklist,
      ...details,
    };
  }

  const health = await getWhatsAppProvider(row.provider).getHealthStatus(ctx);
  const agentWarning =
    assignedAgents === 0
      ? " Falta asignar un agente IA a este número: sin agente, los mensajes entrantes no reciben respuesta."
      : "";

  return {
    configured: true,
    mode: row.mode,
    provider: row.provider,
    status: row.status,
    healthy: health.healthy && assignedAgents > 0,
    message: `${health.message}${agentWarning}`,
    qualityRating: health.qualityRating ?? null,
    checkedAt: health.checkedAt.toISOString(),
    checklist,
    ...details,
  };
}

/**
 * Asigna el número de una integración a un agente del tenant.
 * Si otro agente ya tiene ese número, exige reassign=true (la UI lo confirma).
 */
export async function assignAgentToWhatsApp(
  tenantId: string,
  input: { agentId: string; phoneNumberId: string; reassign?: boolean; activate?: boolean }
): Promise<{ agentId: string; agentName: string; phoneNumberId: string; active: boolean }> {
  const integration = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId, phoneNumberId: input.phoneNumberId },
  });
  if (!integration) {
    throw new AppError("Ese número no está configurado en tu integración de WhatsApp.", 404);
  }
  if (integration.status !== "CONNECTED") {
    throw new AppError("Valida la conexión con Meta antes de asignar el número a un agente.", 400);
  }

  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, tenantId },
  });
  if (!agent) throw new AppError("Agente no encontrado", 404);

  const current = await prisma.agent.findFirst({
    where: {
      tenantId,
      whatsappPhoneNumberId: input.phoneNumberId,
      id: { not: agent.id },
    },
    select: { id: true, name: true },
  });
  if (current && !input.reassign) {
    throw new AppError(`Este número ya está asignado a otro agente (${current.name}).`, 409);
  }

  await prisma.$transaction([
    ...(current
      ? [
          prisma.agent.update({
            where: { id: current.id },
            data: { whatsappPhoneNumberId: null, whatsappDisplayPhone: null },
          }),
        ]
      : []),
    prisma.agent.update({
      where: { id: agent.id },
      data: {
        whatsappPhoneNumberId: input.phoneNumberId,
        whatsappDisplayPhone: integration.displayPhoneNumber,
        // Solo se activa si el usuario lo confirmó explícitamente en la UI.
        // Asignar un número NO puede poner un agente a responder solo.
        ...(input.activate ? { status: "ACTIVE" as const } : {}),
      },
    }),
  ]);

  const active = input.activate ? true : agent.status === "ACTIVE";

  logger.info(
    `[WHATSAPP INTEGRATION] número ${input.phoneNumberId} asignado al agente ${agent.name} (tenant ${tenantId}) activo=${active}${current ? ` — reasignado desde ${current.name}` : ""}`
  );
  return {
    agentId: agent.id,
    agentName: agent.name,
    phoneNumberId: input.phoneNumberId,
    active,
  };
}

/**
 * Mensaje de prueba con CONTENIDO FIJO (anti-spam: el cliente no puede usar
 * esto para mandar texto libre) al número que el usuario indique — pensado
 * para su propio teléfono. Solo con integración CONNECTED.
 */
export async function sendWhatsAppTestMessage(
  tenantId: string,
  input: { integrationId: string; to: string }
): Promise<{ sent: boolean }> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { id: input.integrationId, tenantId },
  });
  if (!row) throw new AppError("Integración de WhatsApp no encontrada", 404);
  if (row.status !== "CONNECTED") {
    throw new AppError("Valida la conexión antes de enviar un mensaje de prueba.", 400);
  }

  const to = input.to.replace(/[^\d]/g, "");
  if (to.length < 8 || to.length > 15) {
    throw new AppError("Número de destino inválido. Usa formato internacional (ej: 18095551234).", 400);
  }

  const ctx = await providerContextFor(row);
  if (!ctx) throw new AppError("La integración no tiene credenciales guardadas.", 400);

  // El demo tiene cuota: evita que se use como canal de producción encubierto.
  if (row.mode === "DEMO_SANDBOX" && !(await consumeDemoQuota(row.id))) {
    throw new AppError(
      `Alcanzaste el límite de ${env.WHATSAPP_DEMO_MESSAGE_LIMIT} mensajes del modo demo. Conecta tu propio número para seguir.`,
      429
    );
  }

  const result = await getWhatsAppProvider(row.provider).sendTextMessage(ctx, {
    to,
    text: "✅ Mensaje de prueba de Sendwary: tu WhatsApp Business quedó conectado correctamente.",
  });

  if (!result.ok) {
    // Nota: fuera de la ventana de 24h Meta rechaza texto libre — es esperado.
    throw new AppError(
      `${result.error} Si el número de destino nunca te ha escrito, Meta puede rechazar mensajes de texto libre (ventana de 24h): escribe primero al número del negocio desde tu teléfono y reintenta.`,
      502
    );
  }

  logger.info(`[WHATSAPP INTEGRATION] mensaje de prueba enviado (tenant ${tenantId} → ${to.slice(0, 4)}****)`);
  return { sent: true };
}

// ─── Resolución para el webhook (Parte D) ────────────────────────────────────

/**
 * Credenciales de envío para un phone_number_id entrante.
 * 1) Integración DEMO_SANDBOX → credenciales del número demo de Sendwary.
 * 2) Integración CONNECTED del tenant → token propio (descifrado).
 * 3) Sin integración → token global SOLO si ALLOW_GLOBAL_META_TOKEN_FALLBACK
 *    (modo dev/demo controlado). Si no, null y el webhook loguea sin responder.
 *
 * Nunca mezcla tokens entre tenants: el lookup es por phoneNumberId único.
 */
export async function resolveSendCredentials(phoneNumberId: string): Promise<{
  accessToken: string;
  graphApiVersion: string;
  provider: string;
  source: "TENANT" | "DEMO" | "GLOBAL_FALLBACK";
} | null> {
  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { phoneNumberId },
  });

  if (integration && integration.status === "CONNECTED") {
    if (integration.mode === "DEMO_SANDBOX") {
      const demo = SendwaryDemoWhatsAppProvider.demoContext();
      if (demo) {
        return {
          accessToken: demo.accessToken,
          graphApiVersion: demo.graphApiVersion,
          provider: "SENDWARY_DEMO",
          source: "DEMO",
        };
      }
      logger.warn(
        `[WHATSAPP INTEGRATION] integración DEMO sin configuración de demo activa (phoneNumberId ${phoneNumberId})`
      );
    } else {
      const token = decryptAccessToken(integration);
      if (token) {
        return {
          accessToken: token,
          graphApiVersion: integration.graphApiVersion,
          provider: integration.provider,
          source: "TENANT",
        };
      }
      logger.error(
        `[WHATSAPP INTEGRATION] integración CONNECTED sin token descifrable (phoneNumberId ${phoneNumberId})`
      );
    }
  }

  if (env.ALLOW_GLOBAL_META_TOKEN_FALLBACK && env.META_WHATSAPP_TOKEN) {
    logger.warn(
      `[WHATSAPP INTEGRATION] usando token GLOBAL (fallback demo) para phoneNumberId ${phoneNumberId}`
    );
    return {
      accessToken: env.META_WHATSAPP_TOKEN,
      graphApiVersion: env.META_GRAPH_API_VERSION,
      provider: "META_CLOUD",
      source: "GLOBAL_FALLBACK",
    };
  }

  return null;
}

// ─── Panel SUPER_ADMIN ───────────────────────────────────────────────────────

/** Vista admin de la conexión de un tenant. Nunca incluye el token. */
export async function getTenantWhatsAppForAdmin(tenantId: string) {
  const rows = await prisma.whatsAppIntegration.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  const integrations = await Promise.all(rows.map(toPublic));
  const health = await getWhatsAppHealth(tenantId);
  return {
    integrations: integrations.map((i, idx) => ({
      ...i,
      // Solo el admin ve las notas internas, la solicitud y el número completo
      // (lo necesita para configurarlo en Meta). Nunca sale el access token.
      adminNotes: rows[idx].adminNotes,
      declaredPhoneNumber: rows[idx].declaredPhoneNumber,
      readinessNotes: rows[idx].readinessNotes,
      assistedSetupRequest:
        (rows[idx].metadataJson as { assistedSetup?: unknown } | null)?.assistedSetup ?? null,
    })),
    health,
    capabilities: getWhatsAppCapabilities(),
  };
}

/**
 * Seguimiento del número por parte del equipo: mover la etapa, corregir el
 * diagnóstico y dejar notas internas. No toca credenciales.
 */
export async function adminUpdateNumberReadiness(
  tenantId: string,
  patch: {
    readinessStage?: "PENDING" | "IN_REVIEW" | "READY_TO_CONNECT" | "CONNECTED" | "REQUIRES_CUSTOMER_ACTION";
    numberReadiness?: string;
    adminNotes?: string | null;
    currentProvider?: string | null;
  },
  adminId?: string
): Promise<WhatsAppIntegrationPublic> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!row) throw new AppError("Esta empresa no tiene conexión de WhatsApp registrada", 404);

  const updated = await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: {
      ...(patch.readinessStage ? { readinessStage: patch.readinessStage } : {}),
      ...(patch.numberReadiness ? { numberReadiness: patch.numberReadiness as never } : {}),
      ...(patch.adminNotes !== undefined ? { adminNotes: patch.adminNotes } : {}),
      ...(patch.currentProvider !== undefined ? { currentProvider: patch.currentProvider } : {}),
      // Marcar "en revisión" implica que el equipo ya está trabajando en ello
      ...(patch.readinessStage === "IN_REVIEW" && !row.assistedSetupStartedAt
        ? { assistedSetupStartedAt: new Date() }
        : {}),
      readinessUpdatedAt: new Date(),
    },
  });

  await prisma.supportAuditLog
    .create({
      data: {
        actorType: "ADMIN",
        actorId: adminId ?? null,
        action: "tenant.whatsapp.readiness",
        detailsJson: { tenantId, changes: JSON.parse(JSON.stringify(patch)) },
      },
    })
    .catch(() => undefined);

  logger.info(
    `[WHATSAPP READINESS] admin actualizó tenant=${tenantId} etapa=${updated.readinessStage} readiness=${updated.numberReadiness} por admin=${adminId ?? "?"}`
  );
  return toPublic(updated);
}

export interface AdminWhatsAppPatch {
  status?: "DRAFT" | "CONNECTING" | "CONNECTED" | "REQUIRES_ACTION" | "ERROR" | "DISABLED";
  mode?: "EASY_ONBOARDING" | "MANUAL_CLOUD_API" | "DEMO_SANDBOX";
  provider?: string;
  adminNotes?: string | null;
  businessName?: string | null;
  businessAccountId?: string | null;
  businessId?: string | null;
  displayPhoneNumber?: string | null;
}

/** Edición admin de la conexión (sin tocar el token del cliente). */
export async function adminUpdateTenantWhatsApp(
  tenantId: string,
  patch: AdminWhatsAppPatch,
  adminId?: string
): Promise<WhatsAppIntegrationPublic> {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!row) throw new AppError("Esta empresa no tiene conexión de WhatsApp registrada", 404);

  const updated = await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.mode ? { mode: patch.mode } : {}),
      ...(patch.provider ? { provider: patch.provider as never } : {}),
      ...(patch.adminNotes !== undefined ? { adminNotes: patch.adminNotes } : {}),
      ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
      ...(patch.businessAccountId !== undefined
        ? { businessAccountId: patch.businessAccountId }
        : {}),
      ...(patch.businessId !== undefined ? { businessId: patch.businessId } : {}),
      ...(patch.displayPhoneNumber !== undefined
        ? { displayPhoneNumber: patch.displayPhoneNumber }
        : {}),
    },
  });

  await prisma.supportAuditLog
    .create({
      data: {
        actorType: "ADMIN",
        actorId: adminId ?? null,
        action: "tenant.whatsapp.update",
        detailsJson: { tenantId, changes: JSON.parse(JSON.stringify(patch)) },
      },
    })
    .catch(() => undefined);

  logger.info(
    `[WHATSAPP ADMIN] conexión actualizada tenant=${tenantId} status=${updated.status} mode=${updated.mode} por admin=${adminId ?? "?"}`
  );
  return toPublic(updated);
}

/** Marca que el equipo empezó a trabajar en la conexión asistida. */
export async function markAssistedSetupStarted(tenantId: string, adminId?: string) {
  const row = await prisma.whatsAppIntegration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!row) throw new AppError("Esta empresa no tiene conexión de WhatsApp registrada", 404);

  const updated = await prisma.whatsAppIntegration.update({
    where: { id: row.id },
    data: {
      status: row.status === "CONNECTED" ? row.status : "CONNECTING",
      assistedSetupStartedAt: row.assistedSetupStartedAt ?? new Date(),
    },
  });
  logger.info(`[WHATSAPP ADMIN] setup asistido iniciado tenant=${tenantId} por admin=${adminId ?? "?"}`);
  return toPublic(updated);
}

/**
 * El equipo terminó de configurar el número del cliente: guarda las
 * credenciales (cifradas) y valida contra el proveedor antes de dar por
 * conectada la integración. Nunca marca CONNECTED "a ciegas".
 */
export async function adminMarkConnected(
  tenantId: string,
  input: { phoneNumberId: string; accessToken?: string | null; displayPhoneNumber?: string | null },
  adminId?: string
): Promise<WhatsAppIntegrationPublic> {
  const saved = await upsertWhatsAppIntegration(tenantId, {
    phoneNumberId: input.phoneNumberId,
    accessToken: input.accessToken ?? undefined,
    displayPhoneNumber: input.displayPhoneNumber ?? undefined,
  });

  // La conexión asistida la hizo el equipo: el modo sigue siendo guiado.
  await prisma.whatsAppIntegration.update({
    where: { id: saved.id },
    data: { mode: "EASY_ONBOARDING" },
  });

  const validated = await validateWhatsAppIntegration(tenantId, saved.id);

  await prisma.supportAuditLog
    .create({
      data: {
        actorType: "ADMIN",
        actorId: adminId ?? null,
        action: "tenant.whatsapp.mark-connected",
        detailsJson: { tenantId, phoneNumberId: input.phoneNumberId, status: validated.status },
      },
    })
    .catch(() => undefined);

  logger.info(
    `[WHATSAPP ADMIN] conexión asistida completada tenant=${tenantId} status=${validated.status} por admin=${adminId ?? "?"}`
  );
  return validated;
}

/** Solicitudes de conexión asistida pendientes (cola del equipo Sendwary). */
export async function listAssistedSetupRequests() {
  // Incluye tanto a quien pidió ayuda explícitamente como a quien el wizard
  // detectó que la necesita (número personal, BSP externo, migración) aunque
  // todavía no haya pulsado "solicitar asistencia".
  const rows = await prisma.whatsAppIntegration.findMany({
    where: {
      status: { not: "CONNECTED" },
      OR: [
        { assistedSetupRequestedAt: { not: null } },
        {
          numberReadiness: {
            in: [
              "PERSONAL_WHATSAPP",
              "BSP_CONNECTED",
              "NEEDS_MIGRATION",
              "NEEDS_ASSISTED_SETUP",
              "NEW_NUMBER_RECOMMENDED",
            ],
          },
        },
      ],
    },
    orderBy: [{ assistedSetupRequestedAt: "asc" }, { readinessUpdatedAt: "asc" }],
    include: { tenant: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({
    integrationId: r.id,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    tenantEmail: r.tenant.email,
    status: r.status,
    mode: r.mode,
    businessName: r.businessName,
    numberReadiness: r.numberReadiness,
    readinessStage: r.readinessStage,
    declaredNumberType: r.declaredNumberType,
    // En la cola el número va enmascarado; el detalle del cliente lo muestra
    // completo para quien va a configurarlo.
    declaredPhoneNumberMasked: maskPhoneNumber(r.declaredPhoneNumber),
    currentProvider: r.currentProvider,
    requestedAt: r.assistedSetupRequestedAt,
    startedAt: r.assistedSetupStartedAt,
    request: (r.metadataJson as { assistedSetup?: unknown } | null)?.assistedSetup ?? null,
  }));
}

/**
 * Verifica el GET del webhook de Meta: acepta el verify token global (compat
 * con la config actual) o el de cualquier tenant (y marca webhookVerifiedAt).
 */
export async function verifyWebhookToken(token: string): Promise<boolean> {
  if (env.META_VERIFY_TOKEN && token === env.META_VERIFY_TOKEN) return true;

  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { verifyToken: token },
  });
  if (!integration) return false;

  await prisma.whatsAppIntegration.update({
    where: { id: integration.id },
    data: { webhookVerifiedAt: new Date() },
  });
  logger.info(
    `[WHATSAPP INTEGRATION] webhook verificado por Meta (tenant ${integration.tenantId}, phoneNumberId ${integration.phoneNumberId})`
  );
  return true;
}
