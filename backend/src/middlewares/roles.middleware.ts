import type { Request, Response, NextFunction } from "express";
import { AppError } from "./error.middleware.js";
import { env } from "../config/env.js";
import type { UserRoleType } from "../types/auth.types.js";

// --- [DEBUG-AUTH] temporal (quitar luego: grep "[DEBUG-AUTH]") ---
const dbg = env.NODE_ENV !== "production";

export function requireRole(...roles: UserRoleType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      if (dbg) console.log("[AUTH ROLES] requireRole -> 401: no autenticado |", req.method, req.originalUrl);
      next(new AppError("No autenticado", 401));
      return;
    }

    if (!roles.includes(req.user.role)) {
      if (dbg) console.log("[AUTH ROLES] requireRole -> 403 |", req.originalUrl, "| requerido:", roles.join(","), "| actual:", req.user.role);
      next(new AppError("Acceso denegado: permisos insuficientes", 403));
      return;
    }

    next();
  };
}

export function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== "SUPER_ADMIN") {
    next(new AppError("Acceso restringido a administradores del sistema", 403));
    return;
  }
  next();
}

export function requireTenantAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(new AppError("No autenticado", 401));
    return;
  }

  if (req.user.role === "SUPER_ADMIN") {
    if (dbg) console.log("[AUTH ROLES] requireTenantAccess -> OK (SUPER_ADMIN bypass) |", req.originalUrl);
    next();
    return;
  }

  if (!req.user.tenantId) {
    if (dbg) console.log("[AUTH ROLES] requireTenantAccess -> 403: usuario sin tenantId |", req.originalUrl, "| role:", req.user.role);
    next(new AppError("Usuario no asociado a ninguna empresa", 403));
    return;
  }

  if (dbg) console.log("[AUTH ROLES] requireTenantAccess -> OK | tenantId:", req.user.tenantId, "|", req.originalUrl);
  next();
}
