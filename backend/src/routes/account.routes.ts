import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  getPlanController,
  getInvoicesController,
  cancellationRequestController,
} from "../controllers/account.controller.js";

export const accountRoutes = Router();

accountRoutes.use(requireAuth, requireTenantAccess);

accountRoutes.get("/plan", getPlanController);
accountRoutes.get("/invoices", getInvoicesController);
accountRoutes.post(
  "/cancellation-request",
  requireRole("OWNER"),
  cancellationRequestController
);
