import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import { webhookRateLimit } from "../middlewares/rate-limit.middleware.js";
import {
  voiceEntitlementController,
  voiceUsageController,
  listCallsController,
  getCallDetailController,
  syncAgentVoiceController,
  testRecordUsageController,
} from "../controllers/voice.controller.js";
import {
  elevenLabsWebhookController,
  toolSearchCatalogController,
  toolCheckAvailabilityController,
  toolCreateAppointmentController,
  toolRequestHumanController,
} from "../controllers/voice-webhook.controller.js";

export const voiceRoutes = Router();

// ── Endpoints públicos para ElevenLabs (sin sesión; auth propia) ──
// Webhook post-call: firma HMAC obligatoria (ElevenLabs-Signature)
voiceRoutes.post("/elevenlabs/webhook", webhookRateLimit, elevenLabsWebhookController);
// Tools en vivo durante la llamada: token propio (x-voice-tools-token)
voiceRoutes.post("/tools/search-catalog", webhookRateLimit, toolSearchCatalogController);
voiceRoutes.post("/tools/check-availability", webhookRateLimit, toolCheckAvailabilityController);
voiceRoutes.post("/tools/create-appointment", webhookRateLimit, toolCreateAppointmentController);
voiceRoutes.post("/tools/request-human", webhookRateLimit, toolRequestHumanController);

// ── Endpoints del panel (sesión + tenant) ──
voiceRoutes.use(requireAuth, requireTenantAccess);

voiceRoutes.get("/entitlement", voiceEntitlementController);
voiceRoutes.get("/usage", voiceUsageController);
voiceRoutes.get("/calls", listCallsController);
voiceRoutes.get("/calls/:id", getCallDetailController);
voiceRoutes.post(
  "/agents/:id/sync",
  requireRole("OWNER", "ADMIN"),
  syncAgentVoiceController
);
// Consumo simulado (dev o SUPER_ADMIN) para probar UI/enforcement sin ElevenLabs
voiceRoutes.post("/test-record-usage", testRecordUsageController);
