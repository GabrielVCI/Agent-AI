import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  getCompanyController,
  updateCompanyController,
} from "../controllers/company.controller.js";

export const companyRoutes = Router();

companyRoutes.use(requireAuth, requireTenantAccess);

companyRoutes.get("/me", getCompanyController);
companyRoutes.put("/me", requireRole("OWNER", "ADMIN"), updateCompanyController);
