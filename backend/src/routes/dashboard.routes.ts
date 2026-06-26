import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  dashboardSummaryController,
  dashboardByPhoneController,
  agentPerformanceController,
  humanInterventionsController,
  quotesMetricsController,
  activityMetricsController,
  customerMetricsController,
  usageMetricsController,
  audioMetricsController,
  dashboardAlertsController,
} from "../controllers/dashboard.controller.js";

export const dashboardRoutes = Router();

dashboardRoutes.use(requireAuth, requireTenantAccess);

dashboardRoutes.get("/summary", dashboardSummaryController);
dashboardRoutes.get("/by-phone", dashboardByPhoneController);
dashboardRoutes.get("/agent-performance", agentPerformanceController);
dashboardRoutes.get("/human-interventions", humanInterventionsController);
dashboardRoutes.get("/quotes", quotesMetricsController);
dashboardRoutes.get("/activity", activityMetricsController);
dashboardRoutes.get("/customers", customerMetricsController);
dashboardRoutes.get("/usage", usageMetricsController);
dashboardRoutes.get("/audio", audioMetricsController);
dashboardRoutes.get("/alerts", dashboardAlertsController);
