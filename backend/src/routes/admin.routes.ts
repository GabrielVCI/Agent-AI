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
} from "../controllers/admin.controller.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireSuperAdmin, adminRateLimit);

adminRoutes.get("/tenants", listTenantsController);
adminRoutes.post("/tenants", adminSensitiveRateLimit, createTenantController);
adminRoutes.get("/tenants/:id", getTenantController);
adminRoutes.put("/tenants/:id", updateTenantController);
adminRoutes.put("/tenants/:id/subscription", adminSensitiveRateLimit, updateSubscriptionController);
adminRoutes.post("/tenants/:id/reset-usage", resetUsageController);
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

adminRoutes.get("/cancellation-requests", listCancellationRequestsController);
adminRoutes.post("/cancellation-requests/:id/approve", processCancellationController("approve"));
adminRoutes.post("/cancellation-requests/:id/reject", processCancellationController("reject"));
adminRoutes.post("/cancellation-requests/:id/complete", processCancellationController("complete"));
