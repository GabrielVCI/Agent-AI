import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../middlewares/error.middleware.js";
import {
  listWhatsAppIntegrations,
  upsertWhatsAppIntegration,
  validateWhatsAppIntegration,
  assignAgentToWhatsApp,
  sendWhatsAppTestMessage,
  webhookCallbackUrl,
  getWhatsAppCapabilities,
  requestAssistedSetup,
  enableDemoSandbox,
  getWhatsAppHealth,
  getTenantWhatsAppForAdmin,
  adminUpdateTenantWhatsApp,
  markAssistedSetupStarted,
  adminMarkConnected,
  listAssistedSetupRequests,
  saveNumberReadiness,
  adminUpdateNumberReadiness,
  completeEmbeddedSignup,
  selectEmbeddedSignupPhoneNumber,
  retryWebhookSubscription,
} from "../services/whatsapp-integration.service.js";

/**
 * /api/integrations/whatsapp — configuración guiada de WhatsApp por tenant.
 *
 * - OWNER/ADMIN operan sobre SU tenant (req.user.tenantId).
 * - SUPER_ADMIN puede VER el estado de cualquier tenant con ?tenantId=, pero
 *   las escrituras son del tenant (el token es del cliente, no de la plataforma).
 * - El access token jamás sale en una respuesta (solo hasToken + last four).
 */

function resolveTenantId(req: Request, allowSuperAdminQuery = false): string {
  if (allowSuperAdminQuery && req.user?.role === "SUPER_ADMIN") {
    const q = req.query.tenantId;
    if (typeof q === "string" && q) return q;
    throw new AppError("SUPER_ADMIN debe indicar ?tenantId=", 400);
  }
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);
  return tenantId;
}

export async function getWhatsAppIntegrationController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req, true);
    const integrations = await listWhatsAppIntegrations(tenantId);
    res.json({
      success: true,
      data: {
        integrations,
        webhookUrl: webhookCallbackUrl(),
        subscribeFields: ["messages"],
        // Qué vías de conexión ofrece este entorno (guiada / manual / demo)
        capabilities: getWhatsAppCapabilities(),
      },
    });
  } catch (err) {
    next(err);
  }
}

// Payload del SDK de Meta. `code` tiene TTL de 30s y NO se persiste.
// rawPayload no se acepta a propósito: evita que lleguen tokens del navegador.
const embeddedSignupSchema = z.object({
  code: z.string().min(10).max(2000).optional().nullable(),
  wabaId: z.string().max(40).optional().nullable(),
  phoneNumberId: z.string().max(40).optional().nullable(),
  businessId: z.string().max(40).optional().nullable(),
  displayPhoneNumber: z.string().max(30).optional().nullable(),
  event: z.string().max(60).optional().nullable(),
});

/**
 * Cierre del flujo de Embedded Signup. El frontend manda el code y los ids que
 * Meta devolvió; el intercambio por el token del cliente ocurre AQUÍ, nunca en
 * el navegador.
 */
export async function embeddedSignupCompleteController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = embeddedSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "No pudimos completar la conexión con Meta. Intenta nuevamente.",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const data = await completeEmbeddedSignup(tenantId, parsed.data);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

const selectPhoneNumberSchema = z.object({
  phoneNumberId: z.string().min(1).max(40),
});

/**
 * Parte D: el cliente elige cuál de los números de su WABA usará Sendwary.
 * La pertenencia del número a la WABA del tenant se revalida contra Meta en el
 * servicio; aquí solo se valida la forma del body.
 */
export async function embeddedSignupSelectPhoneNumberController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = selectPhoneNumberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Selecciona un número válido para continuar.",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const data = await selectEmbeddedSignupPhoneNumber(tenantId, parsed.data.phoneNumberId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** Reintento de la suscripción a webhooks de la WABA (tenant y admin). */
export async function retryWebhookSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Admin usa /api/admin/tenants/:id/...; el tenant su propia empresa
    const tenantId = req.params.id ?? resolveTenantId(req);
    const result = await retryWebhookSubscription(tenantId);
    res.json({ success: true, data: result, message: result.message });
  } catch (err) {
    next(err);
  }
}

const numberReadinessSchema = z.object({
  declaredNumberType: z.enum([
    "PERSONAL",
    "BUSINESS_APP",
    "CLOUD_API",
    "OTHER_PROVIDER",
    "NEW_NUMBER",
  ]),
  phoneNumber: z.string().max(30).optional().nullable(),
  currentProvider: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Wizard "Preparar número": guarda lo que el cliente declaró y devuelve la
 * recomendación honesta. NO conecta nada ni promete que el número ya sirva.
 */
export async function numberReadinessController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = numberReadinessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await saveNumberReadiness(tenantId, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

const assistedSetupSchema = z.object({
  businessName: z.string().max(200).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
  desiredNumber: z.string().max(30).optional().nullable(),
  hasMetaBusinessAccount: z.boolean().optional(),
  hasAdminAccess: z.boolean().optional(),
  hasAvailableNumber: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

/** El cliente pide que el equipo de Sendwary le conecte WhatsApp. */
export async function requestAssistedSetupController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    if (!req.user) throw new AppError("No autenticado", 401);
    const parsed = assistedSetupSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await requestAssistedSetup(
      tenantId,
      { id: req.user.id, name: req.user.name, email: req.user.email },
      parsed.data
    );
    res.status(201).json({
      success: true,
      data: result,
      message:
        "Solicitud recibida. El equipo de Sendwary te contactará para conectar tu WhatsApp Business.",
    });
  } catch (err) {
    next(err);
  }
}

/** Activa el número demo de Sendwary (solo pruebas, con cuota). */
export async function enableDemoController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    const integration = await enableDemoSandbox(tenantId);
    res.json({
      success: true,
      data: integration,
      message: "Modo demo activado. Recuerda: es solo para pruebas, no para atender clientes reales.",
    });
  } catch (err) {
    next(err);
  }
}

/** Estado de salud de la conexión en lenguaje de negocio. */
export async function whatsappHealthController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req, true);
    const health = await getWhatsAppHealth(tenantId);
    res.json({ success: true, data: health });
  } catch (err) {
    next(err);
  }
}

// ─── Panel SUPER_ADMIN ───────────────────────────────────────────────────────

export async function adminGetTenantWhatsAppController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getTenantWhatsAppForAdmin(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

const adminPatchSchema = z.object({
  status: z
    .enum(["DRAFT", "CONNECTING", "CONNECTED", "REQUIRES_ACTION", "ERROR", "DISABLED"])
    .optional(),
  mode: z.enum(["EASY_ONBOARDING", "MANUAL_CLOUD_API", "DEMO_SANDBOX"]).optional(),
  provider: z
    .enum(["META_CLOUD", "TWILIO", "DIALOG360", "INFOBIP", "EIGHTX8", "SENDWARY_DEMO", "OTHER"])
    .optional(),
  adminNotes: z.string().max(4000).nullish(),
  businessName: z.string().max(200).nullish(),
  businessAccountId: z.string().max(40).nullish(),
  businessId: z.string().max(40).nullish(),
  displayPhoneNumber: z.string().max(30).nullish(),
});

export async function adminPatchTenantWhatsAppController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = adminPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const data = await adminUpdateTenantWhatsApp(req.params.id, parsed.data, req.user?.id);
    res.json({ success: true, data, message: "Conexión actualizada" });
  } catch (err) {
    next(err);
  }
}

export async function adminMarkAssistedStartedController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await markAssistedSetupStarted(req.params.id, req.user?.id);
    res.json({ success: true, data, message: "Setup asistido marcado como iniciado" });
  } catch (err) {
    next(err);
  }
}

const markConnectedSchema = z.object({
  phoneNumberId: z.string().min(5).max(30),
  accessToken: z.string().min(1).max(600).optional().nullable(),
  displayPhoneNumber: z.string().max(30).optional().nullable(),
});

export async function adminMarkConnectedController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = markConnectedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const data = await adminMarkConnected(req.params.id, parsed.data, req.user?.id);
    res.json({
      success: true,
      data,
      message:
        data.status === "CONNECTED"
          ? "Conexión validada y marcada como conectada"
          : `No se pudo validar contra el proveedor: ${data.lastValidationError ?? "revisa las credenciales"}`,
    });
  } catch (err) {
    next(err);
  }
}

const readinessPatchSchema = z.object({
  readinessStage: z
    .enum(["PENDING", "IN_REVIEW", "READY_TO_CONNECT", "CONNECTED", "REQUIRES_CUSTOMER_ACTION"])
    .optional(),
  numberReadiness: z
    .enum([
      "UNKNOWN",
      "PERSONAL_WHATSAPP",
      "WHATSAPP_BUSINESS_APP",
      "CLOUD_API_READY",
      "BSP_CONNECTED",
      "NEW_NUMBER_RECOMMENDED",
      "NEEDS_MIGRATION",
      "NEEDS_ASSISTED_SETUP",
      "CONNECTED",
      "ERROR",
    ])
    .optional(),
  adminNotes: z.string().max(4000).nullish(),
  currentProvider: z.string().max(120).nullish(),
});

/** Seguimiento admin de la preparación del número. */
export async function adminPatchReadinessController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = readinessPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const data = await adminUpdateNumberReadiness(req.params.id, parsed.data, req.user?.id);
    res.json({ success: true, data, message: "Seguimiento del número actualizado" });
  } catch (err) {
    next(err);
  }
}

/** Cola de solicitudes de conexión asistida pendientes. */
export async function adminListAssistedRequestsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listAssistedSetupRequests();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

const upsertSchema = z.object({
  phoneNumberId: z.string().min(5).max(30),
  accessToken: z.string().min(1).max(600).optional().nullable(),
  businessName: z.string().max(200).optional().nullable(),
  businessAccountId: z.string().max(40).optional().nullable(),
  businessId: z.string().max(40).optional().nullable(),
  displayPhoneNumber: z.string().max(30).optional().nullable(),
  graphApiVersion: z
    .string()
    .regex(/^v\d{2}\.\d$/, "Versión inválida (ej: v20.0)")
    .optional(),
  verifyToken: z.string().min(12).max(120).optional(),
  disabled: z.boolean().optional(),
});

export async function upsertWhatsAppIntegrationController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const integration = await upsertWhatsAppIntegration(tenantId, parsed.data);
    res.status(201).json({ success: true, data: integration });
  } catch (err) {
    next(err);
  }
}

const validateSchema = z.object({ integrationId: z.string().min(1) });

export async function validateWhatsAppIntegrationController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "integrationId requerido" });
      return;
    }
    const integration = await validateWhatsAppIntegration(tenantId, parsed.data.integrationId);
    res.json({ success: true, data: integration });
  } catch (err) {
    next(err);
  }
}

const assignSchema = z.object({
  agentId: z.string().min(1),
  phoneNumberId: z.string().min(5).max(30),
  reassign: z.boolean().optional(),
  /** Solo true si el usuario confirmó "activar este agente" en la UI. */
  activate: z.boolean().optional(),
});

export async function assignAgentController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await assignAgentToWhatsApp(tenantId, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

const testMessageSchema = z.object({
  integrationId: z.string().min(1),
  to: z.string().min(8).max(20),
});

export async function testMessageController(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req);
    const parsed = testMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const result = await sendWhatsAppTestMessage(tenantId, parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
