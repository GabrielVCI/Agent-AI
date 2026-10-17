import type { Request, Response, NextFunction } from "express";
import { resolveSession } from "../services/auth.service.js";
import { env, sessionCookieAttrs } from "../config/env.js";
import { AppError } from "./error.middleware.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];

    // --- [DEBUG-AUTH] temporal (quitar luego: grep "[DEBUG-AUTH]") ---
    const dbg = env.NODE_ENV === "development";
    if (dbg) {
      console.log("[AUTH MIDDLEWARE] ruta:", req.method, req.originalUrl);
      console.log("[AUTH MIDDLEWARE] origin:", req.headers.origin ?? "(sin origin)");
      console.log("[AUTH MIDDLEWARE] header cookie presente:", Boolean(req.headers.cookie));
      console.log("[AUTH MIDDLEWARE] cookies parseadas:", Object.keys(req.cookies ?? {}));
      console.log("[AUTH MIDDLEWARE] cookieName esperado:", env.SESSION_COOKIE_NAME, "| token presente:", Boolean(token));
    }

    if (!token) {
      if (dbg) console.log("[AUTH MIDDLEWARE] -> 401 motivo: no llegó cookie", env.SESSION_COOKIE_NAME);
      throw new AppError("Tu sesión no está activa. Inicia sesión nuevamente.", 401, {
        code: "UNAUTHENTICATED",
        internalMessage: "sin cookie de sesión",
      });
    }

    const user = await resolveSession(token);

    if (!user) {
      if (dbg) console.log("[AUTH MIDDLEWARE] -> 401 motivo: sesión no resuelta (no existe/expirada/revocada/usuario disabled)");
      // Mismos atributos que al emitirla: si no coinciden, el navegador no la
      // borra y el usuario queda con una cookie zombi que falla en cada request.
      res.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieAttrs());
      throw new AppError("Tu sesión expiró. Inicia sesión nuevamente.", 401, {
        code: "SESSION_EXPIRED",
        internalMessage: "sesión no resuelta (expirada/revocada/usuario disabled)",
      });
    }

    if (dbg) console.log("[AUTH MIDDLEWARE] autenticado: sí | id:", user.id, "| role:", user.role, "| tenantId:", user.tenantId);

    req.user = user;
    req.tenantId = user.tenantId ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];
  if (token) {
    const user = await resolveSession(token);
    if (user) {
      req.user = user;
      req.tenantId = user.tenantId ?? undefined;
    }
  }
  next();
}
