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
  getDashboardAlerts,
} from "../services/dashboard.service.js";
import { AppError } from "../middlewares/error.middleware.js";

function handler(fn: (tenantId: string) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantId) throw new AppError("Empresa no identificada", 403);
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

// Placeholder for audio metrics (stub until audio transcription is implemented)
export async function audioMetricsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.tenantId) throw new AppError("Empresa no identificada", 403);

    res.json({
      success: true,
      data: {
        note: "Audio transcription metrics will be available when audio support is enabled.",
        audioReceived: 0,
        audioTranscribed: 0,
        audioFailed: 0,
      },
    });
  } catch (err) {
    next(err);
  }
}
