import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/roles.middleware.js";
import { AppError } from "../middlewares/error.middleware.js";

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

    const [whatsappAgents, voiceAgents, subscription] = await Promise.all([
      prisma.agent.count({ where: { tenantId, whatsappPhoneNumberId: { not: null } } }),
      prisma.agent.count({ where: { tenantId, elevenLabsAgentId: { not: null } } }),
      prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } }),
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
        description: "Números de WhatsApp conectados a tus agentes IA (Meta Cloud API).",
        status: whatsappAgents > 0 ? "CONFIGURED" : "REQUIRES_CONFIG",
        actions: ["MANAGE_IN_SETTINGS"],
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
        status: !env.LEMONSQUEEZY_API_KEY
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
