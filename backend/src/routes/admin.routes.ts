import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireSuperAdmin } from "../middlewares/roles.middleware.js";
import {
  listTenantsController,
  getTenantController,
  createTenantController,
  suspendTenantController,
  reactivateTenantController,
  cancelTenantController,
  assignPlanController,
  createUserController,
  listCancellationRequestsController,
  processCancellationController,
} from "../controllers/admin.controller.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireSuperAdmin);

adminRoutes.get("/tenants", listTenantsController);
adminRoutes.post("/tenants", createTenantController);
adminRoutes.get("/tenants/:id", getTenantController);
adminRoutes.post("/tenants/:id/suspend", suspendTenantController);
adminRoutes.post("/tenants/:id/reactivate", reactivateTenantController);
adminRoutes.post("/tenants/:id/cancel", cancelTenantController);
adminRoutes.put("/tenants/:id/plan", assignPlanController);
adminRoutes.post("/tenants/:id/users", createUserController);

adminRoutes.get("/cancellation-requests", listCancellationRequestsController);
adminRoutes.post("/cancellation-requests/:id/approve", processCancellationController("approve"));
adminRoutes.post("/cancellation-requests/:id/reject", processCancellationController("reject"));
adminRoutes.post("/cancellation-requests/:id/complete", processCancellationController("complete"));
