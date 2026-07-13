import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  supportAuth,
  requireSupportScope,
  requireSupportStaff,
} from "../middlewares/support-auth.middleware.js";
import { adminRateLimit } from "../middlewares/rate-limit.middleware.js";
import {
  supportHealthController,
  supportTenantContextController,
  supportUserContextController,
  supportConversationContextController,
  createTicketController,
  listTicketsController,
  getTicketController,
  updateTicketController,
  aiTriageController,
} from "../controllers/support.controller.js";

/**
 * /api/support — API interna del asistente de soporte.
 *
 * Identidades: sesión SUPER_ADMIN (panel), token interno del agente IA
 * (x-support-token, scopes limitados) o usuario tenant (solo sus tickets).
 * Todo con rate limit y audit log; nunca se devuelven secrets.
 */

// Con token interno no hay cookie: solo se corre requireAuth cuando aplica.
function supportEntry(req: Request, res: Response, next: NextFunction): void {
  if (typeof req.headers["x-support-token"] === "string") {
    supportAuth(req, res, next);
    return;
  }
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    supportAuth(req, res, next);
  });
}

export const supportRoutes = Router();

supportRoutes.use(adminRateLimit, supportEntry);

// Contexto seguro (staff: SUPER_ADMIN o agente IA; nunca usuarios tenant)
supportRoutes.get("/health", requireSupportStaff, requireSupportScope("support:read"), supportHealthController);
supportRoutes.get(
  "/context/tenant/:tenantId",
  requireSupportStaff,
  requireSupportScope("support:read"),
  supportTenantContextController
);
supportRoutes.get(
  "/context/user/:userId",
  requireSupportStaff,
  requireSupportScope("support:read"),
  supportUserContextController
);
supportRoutes.get(
  "/context/conversation/:id",
  requireSupportStaff,
  requireSupportScope("support:read"),
  supportConversationContextController
);

// Tickets (usuarios tenant: solo su tenant; staff: todos)
supportRoutes.post("/tickets", requireSupportScope("support:tickets:write"), createTicketController);
supportRoutes.get("/tickets", listTicketsController);
supportRoutes.get("/tickets/:id", getTicketController);
supportRoutes.patch(
  "/tickets/:id",
  requireSupportStaff,
  requireSupportScope("support:tickets:write"),
  updateTicketController
);

// Triage IA (staff)
supportRoutes.post("/ai/triage", requireSupportStaff, requireSupportScope("support:triage"), aiTriageController);
