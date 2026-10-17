import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireSuperAdmin } from "../middlewares/roles.middleware.js";
import {
  adminRateLimit,
  adminSensitiveRateLimit,
} from "../middlewares/rate-limit.middleware.js";
import {
  listTenantsController,
  getTenantController,
  createTenantController,
  updateTenantController,
  updateSubscriptionController,
  resetUsageController,
  getTenantVoiceController,
  updateTenantVoiceController,
  resetTenantVoiceUsageController,
  suspendTenantController,
  reactivateTenantController,
  cancelTenantController,
  assignPlanController,
  createUserController,
  listCancellationRequestsController,
  processCancellationController,
  listUnmatchedWebhooksController,
  updateImplementationController,
  resendVerificationEmailController,
  resendImplementationEmailController,
  sendImplementationReminderController,
} from "../controllers/admin.controller.js";
import {
  adminGetTenantWhatsAppController,
  adminPatchTenantWhatsAppController,
  adminMarkAssistedStartedController,
  adminMarkConnectedController,
  adminListAssistedRequestsController,
  adminPatchReadinessController,
  retryWebhookSubscriptionController,
} from "../controllers/whatsapp-integration.controller.js";
import {
  adminAutomationHealthController,
  adminCancelAutomationJobController,
  adminListAutomationJobsController,
  adminRetryAutomationJobController,
} from "../controllers/admin-automation.controller.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireSuperAdmin, adminRateLimit);

adminRoutes.get("/tenants", listTenantsController);
adminRoutes.post("/tenants", adminSensitiveRateLimit, createTenantController);
adminRoutes.get("/tenants/:id", getTenantController);
adminRoutes.put("/tenants/:id", updateTenantController);
adminRoutes.put("/tenants/:id/subscription", adminSensitiveRateLimit, updateSubscriptionController);
adminRoutes.post("/tenants/:id/reset-usage", resetUsageController);
// Flujo comercial: implementación, activación final, bypass de paywall y reenvíos
adminRoutes.put("/tenants/:id/implementation", adminSensitiveRateLimit, updateImplementationController);
adminRoutes.post("/tenants/:id/resend-verification", adminSensitiveRateLimit, resendVerificationEmailController);
adminRoutes.post("/tenants/:id/resend-implementation-email", adminSensitiveRateLimit, resendImplementationEmailController);
adminRoutes.post("/tenants/:id/send-payment-reminder", adminSensitiveRateLimit, sendImplementationReminderController);
adminRoutes.get("/tenants/:id/voice", getTenantVoiceController);
adminRoutes.put("/tenants/:id/voice", updateTenantVoiceController);
adminRoutes.post("/tenants/:id/voice/reset-usage", resetTenantVoiceUsageController);
// Futuro (documentado, no implementado): POST /tenants/:id/impersonate —
// requiere diseño de seguridad (sesión secundaria auditada) antes de existir.
adminRoutes.post("/tenants/:id/suspend", suspendTenantController);
adminRoutes.post("/tenants/:id/reactivate", reactivateTenantController);
adminRoutes.post("/tenants/:id/cancel", cancelTenantController);
adminRoutes.put("/tenants/:id/plan", adminSensitiveRateLimit, assignPlanController);
adminRoutes.post("/tenants/:id/users", createUserController);

// WhatsApp por tenant: estado, notas internas y conexión asistida.
// El access token del cliente NUNCA se devuelve (solo last four).
adminRoutes.get("/whatsapp/assisted-requests", adminListAssistedRequestsController);
adminRoutes.get("/tenants/:id/whatsapp", adminGetTenantWhatsAppController);
adminRoutes.patch("/tenants/:id/whatsapp", adminSensitiveRateLimit, adminPatchTenantWhatsAppController);
adminRoutes.post(
  "/tenants/:id/whatsapp/mark-assisted-setup-started",
  adminSensitiveRateLimit,
  adminMarkAssistedStartedController
);
adminRoutes.post(
  "/tenants/:id/whatsapp/mark-connected",
  adminSensitiveRateLimit,
  adminMarkConnectedController
);
// Reintento de la suscripción a webhooks de la WABA del cliente
adminRoutes.post(
  "/tenants/:id/whatsapp/retry-webhook",
  adminSensitiveRateLimit,
  retryWebhookSubscriptionController
);
// Seguimiento de la preparación del número (etapa, diagnóstico, notas)
adminRoutes.patch(
  "/tenants/:id/whatsapp/readiness",
  adminSensitiveRateLimit,
  adminPatchReadinessController
);

// Webhooks de billing que no se pudieron asociar a un tenant (revisión manual)
adminRoutes.get("/billing/unmatched-webhooks", listUnmatchedWebhooksController);

// Motor de automatizaciones (Módulo 0): salud de la cola, jobs fallidos y
// acciones operativas. Solo SUPER_ADMIN; el tenant usa /api/automations.
adminRoutes.get("/automations/health", adminAutomationHealthController);
adminRoutes.get("/automations/jobs", adminListAutomationJobsController);
adminRoutes.post("/automations/jobs/:id/retry", adminSensitiveRateLimit, adminRetryAutomationJobController);
adminRoutes.post("/automations/jobs/:id/cancel", adminSensitiveRateLimit, adminCancelAutomationJobController);

adminRoutes.get("/cancellation-requests", listCancellationRequestsController);
adminRoutes.post("/cancellation-requests/:id/approve", processCancellationController("approve"));
adminRoutes.post("/cancellation-requests/:id/reject", processCancellationController("reject"));
adminRoutes.post("/cancellation-requests/:id/complete", processCancellationController("complete"));
