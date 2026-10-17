import { Router } from "express";
import { isLemonSqueezyConfigured } from "../services/billing/lemon-squeezy/lemonSqueezy.config.js";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess, requireRole } from "../middlewares/roles.middleware.js";
import { adminSensitiveRateLimit } from "../middlewares/rate-limit.middleware.js";
import { AppError } from "../middlewares/error.middleware.js";
import {
  getWhatsAppIntegrationController,
  upsertWhatsAppIntegrationController,
  validateWhatsAppIntegrationController,
  assignAgentController,
  testMessageController,
  requestAssistedSetupController,
  enableDemoController,
  whatsappHealthController,
  numberReadinessController,
  embeddedSignupCompleteController,
  embeddedSignupSelectPhoneNumberController,
} from "../controllers/whatsapp-integration.controller.js";

/**
 * Herramientas externas / Integraciones (Parte D).
 *
 * GET /api/integrations devuelve el estado de cada conector para el tenant.
 * Los estados se COMPUTAN en vivo (env + datos del tenant); la configuración
 * persistente de sincronizaciones futuras (Excel Online/Graph, Sheets) usará
 * el modelo `Integration` existente (type EXCEL/GOOGLE_SHEETS, encryptedConfig).
 */

export type IntegrationCardStatus =
  | "AVAILABLE" // lista para usar sin configuración extra
  | "CONFIGURED" // conectada y funcionando para este tenant
  | "REQUIRES_CONFIG" // existe pero falta configuración
  | "COMING_SOON"; // aún no disponible

interface IntegrationCard {
  id: string;
  name: string;
  description: string;
  status: IntegrationCardStatus;
  /** Acciones que el frontend puede ofrecer para esta integración. */
  actions: string[];
}

async function listIntegrationsController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);

    const [whatsappAgents, voiceAgents, subscription, whatsappIntegration] = await Promise.all([
      prisma.agent.count({ where: { tenantId, whatsappPhoneNumberId: { not: null } } }),
      prisma.agent.count({ where: { tenantId, elevenLabsAgentId: { not: null } } }),
      prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } }),
      prisma.whatsAppIntegration.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { status: true },
      }),
    ]);

    const cards: IntegrationCard[] = [
      {
        id: "excel",
        name: "Microsoft Excel",
        description:
          "Exporta tu agenda de citas, descarga la plantilla oficial e importa citas desde un archivo .xlsx con validación y vista previa.",
        status: "AVAILABLE",
        actions: ["EXPORT_APPOINTMENTS", "DOWNLOAD_TEMPLATE", "IMPORT_APPOINTMENTS"],
      },
      {
        id: "google-sheets",
        name: "Google Sheets",
        description: "Sincroniza tu agenda con una hoja de cálculo de Google.",
        status: "COMING_SOON",
        actions: [],
      },
      {
        id: "whatsapp",
        name: "WhatsApp Business",
        description:
          "Conecta tu propio número de WhatsApp Business (Meta Cloud API) y asígnalo a tus agentes IA.",
        status:
          whatsappIntegration?.status === "CONNECTED" && whatsappAgents > 0
            ? "CONFIGURED"
            : "REQUIRES_CONFIG",
        actions: ["CONFIGURE_WHATSAPP"],
      },
      {
        id: "elevenlabs",
        name: "ElevenLabs (llamadas IA)",
        description: "Agentes de voz para atender llamadas con IA.",
        status: !env.ELEVENLABS_API_KEY
          ? "COMING_SOON"
          : voiceAgents > 0
            ? "CONFIGURED"
            : "REQUIRES_CONFIG",
        actions: ["MANAGE_IN_AGENTS"],
      },
      {
        id: "lemonsqueezy",
        name: "LemonSqueezy (facturación)",
        description: "Cobros y suscripciones del plan de tu empresa.",
        // "Configurado" = hay API key Y store: sin store no se puede crear un
        // checkout. La comprobación vive en lemonSqueezy.config (única fuente).
        status: !isLemonSqueezyConfigured()
          ? "COMING_SOON"
          : subscription
            ? "CONFIGURED"
            : "REQUIRES_CONFIG",
        actions: ["MANAGE_IN_ACCOUNT"],
      },
    ];

    res.json({ success: true, data: cards });
  } catch (err) {
    next(err);
  }
}

export const integrationsRoutes = Router();
integrationsRoutes.use(requireAuth, requireTenantAccess);
integrationsRoutes.get("/", listIntegrationsController);

// ── WhatsApp Business Cloud API por tenant ──
// Lectura: OWNER/ADMIN de su tenant; SUPER_ADMIN con ?tenantId= (solo estado,
// nunca el token). Escrituras: solo OWNER/ADMIN, con rate limit estricto.
integrationsRoutes.get(
  "/whatsapp",
  requireRole("OWNER", "ADMIN", "SUPER_ADMIN"),
  getWhatsAppIntegrationController
);
integrationsRoutes.post(
  "/whatsapp",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  upsertWhatsAppIntegrationController
);
integrationsRoutes.post(
  "/whatsapp/validate",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  validateWhatsAppIntegrationController
);
integrationsRoutes.post(
  "/whatsapp/assign-agent",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  assignAgentController
);
integrationsRoutes.post(
  "/whatsapp/test-message",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  testMessageController
);
// Embedded Signup: cierre del flujo oficial de Meta. Rate limit estricto —
// intercambia el code por el token del cliente contra la Graph API.
integrationsRoutes.post(
  "/whatsapp/embedded-signup/complete",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  embeddedSignupCompleteController
);
// Selección del número cuando la WABA del cliente tiene más de uno.
integrationsRoutes.post(
  "/whatsapp/embedded-signup/select-phone-number",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  embeddedSignupSelectPhoneNumberController
);
// Wizard "Preparar número": declara el tipo de número y recibe recomendación
integrationsRoutes.post(
  "/whatsapp/number-readiness",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  numberReadinessController
);
// Conexión guiada: el cliente pide que Sendwary configure su WhatsApp
integrationsRoutes.post(
  "/whatsapp/request-assisted-setup",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  requestAssistedSetupController
);
// Modo demo (número de Sendwary, con cuota)
integrationsRoutes.post(
  "/whatsapp/demo",
  requireRole("OWNER", "ADMIN"),
  adminSensitiveRateLimit,
  enableDemoController
);
// Health check en lenguaje de negocio (lectura: también SUPER_ADMIN con ?tenantId=)
integrationsRoutes.get(
  "/whatsapp/health",
  requireRole("OWNER", "ADMIN", "SUPER_ADMIN"),
  whatsappHealthController
);
