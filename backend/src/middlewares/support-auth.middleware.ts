import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { AppError } from "./error.middleware.js";

/**
 * Autenticación de /api/support (Parte I — conexión segura a producción):
 *
 * Dos identidades posibles, nunca credenciales personales del agente IA:
 * 1. Sesión SUPER_ADMIN (panel admin) → todos los scopes de soporte.
 * 2. Token interno `x-support-token` (SUPPORT_AGENT_TOKEN) → SOLO los scopes
 *    de SUPPORT_AGENT_SCOPES (default: support:read, support:triage,
 *    support:tickets:write).
 *
 * Scopes que NO existen a propósito (el token jamás puede): admin:billing:write,
 * admin:delete, db:raw, secrets:read. Las rutas de soporte son de lectura +
 * tickets; cualquier escritura administrativa vive en /api/admin con sesión.
 */

export type SupportScope = "support:read" | "support:triage" | "support:tickets:write";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supportActor?: {
        type: "ADMIN" | "AI" | "USER";
        id: string | null;
        scopes: SupportScope[];
      };
    }
  }
}

const ALL_SCOPES: SupportScope[] = ["support:read", "support:triage", "support:tickets:write"];

function tokenScopes(): SupportScope[] {
  return env.SUPPORT_AGENT_SCOPES.split(",")
    .map((s) => s.trim())
    .filter((s): s is SupportScope => (ALL_SCOPES as string[]).includes(s));
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Resuelve la identidad de soporte. Requiere que requireAuth (cookie) haya
 * corrido antes SI hay sesión; el token interno funciona sin sesión.
 */
export function supportAuth(req: Request, _res: Response, next: NextFunction): void {
  // 1) Token interno del agente de soporte
  const headerToken = req.headers["x-support-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) {
    if (!env.SUPPORT_AGENT_TOKEN) {
      next(new AppError("El token de soporte no está habilitado en el servidor", 503));
      return;
    }
    if (!safeEqual(headerToken, env.SUPPORT_AGENT_TOKEN)) {
      next(new AppError("Token de soporte inválido", 401));
      return;
    }
    req.supportActor = { type: "AI", id: "support-agent", scopes: tokenScopes() };
    next();
    return;
  }

  // 2) Sesión de usuario (poblada por requireAuth en la ruta)
  if (req.user) {
    if (req.user.role === "SUPER_ADMIN") {
      req.supportActor = { type: "ADMIN", id: req.user.id, scopes: ALL_SCOPES };
      next();
      return;
    }
    // Usuarios tenant: solo pueden crear/ver tickets de su propio tenant.
    // El scope de lectura de contexto/health NO se les concede.
    req.supportActor = { type: "USER", id: req.user.id, scopes: ["support:tickets:write"] };
    next();
    return;
  }

  next(new AppError("No autenticado", 401));
}

export function requireSupportScope(scope: SupportScope) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.supportActor) {
      next(new AppError("No autenticado", 401));
      return;
    }
    if (!req.supportActor.scopes.includes(scope)) {
      next(new AppError("Permisos de soporte insuficientes", 403));
      return;
    }
    next();
  };
}

/** Solo ADMIN (sesión SUPER_ADMIN) o el token del agente IA — nunca usuarios tenant. */
export function requireSupportStaff(req: Request, _res: Response, next: NextFunction): void {
  if (req.supportActor?.type === "ADMIN" || req.supportActor?.type === "AI") {
    next();
    return;
  }
  next(new AppError("Permisos de soporte insuficientes", 403));
}
