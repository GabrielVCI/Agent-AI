import type { Request, Response, NextFunction } from "express";
import {
  getDashboardSummary,
  getDashboardByPhone,
  getAgentPerformance,
  getHumanInterventionsMetrics,
  getQuotesMetrics,
  getActivityMetrics,
  getCustomerMetrics,
  getUsageMetrics,
  getAudioMetrics,
  getDashboardAlerts,
  invalidateDashboardCache,
} from "../services/dashboard.service.js";
import { AppError } from "../middlewares/error.middleware.js";

function handler(fn: (tenantId: string) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
      // ?fresh=1 (botón "Actualizar"): invalida el cache y recomputa desde DB.
      // El polling de fondo NO lo manda (aprovecha el cache de 60s).
      if (req.query.fresh === "1" || req.query.fresh === "true") {
        await invalidateDashboardCache(req.tenantId);
      }
      const data = await fn(req.tenantId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}

export const dashboardSummaryController = handler(getDashboardSummary);
export const dashboardByPhoneController = handler(getDashboardByPhone);
export const agentPerformanceController = handler(getAgentPerformance);
export const humanInterventionsController = handler(getHumanInterventionsMetrics);
export const quotesMetricsController = handler(getQuotesMetrics);
export const activityMetricsController = handler(getActivityMetrics);
export const customerMetricsController = handler(getCustomerMetrics);
export const usageMetricsController = handler(getUsageMetrics);
export const dashboardAlertsController = handler(getDashboardAlerts);

// Métricas de audio reales (UsageMetric AUDIO_TRANSCRIPTION del mes).
// Antes era un stub con ceros hardcoded — eliminado en la fase de consistencia.
export const audioMetricsController = handler(getAudioMetrics);
