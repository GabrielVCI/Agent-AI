import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  loginUser,
  logoutSession,
  logoutAllSessions,
  listActiveSessions,
} from "../services/auth.service.js";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

function setCookieOptions() {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // En dev sobre http no se puede usar Secure (el navegador descartaría la cookie).
    secure: isProd,
    // dev: "lax" para que la cookie viaje en peticiones same-site del SPA local.
    // prod: "strict" (front y API bajo el mismo dominio).
    sameSite: isProd ? ("strict" as const) : ("lax" as const),
    maxAge: env.SESSION_TTL_SECONDS * 1000,
    // Solo fijar domain si está configurado; en localhost debe omitirse (cookie host-only).
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    path: "/",
  };
}

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // --- [DEBUG-AUTH] temporal (quitar luego: grep "[DEBUG-AUTH]") ---
    if (env.NODE_ENV !== "production") {
      console.log("[AUTH LOGIN] email recibido:", parsed.data.email);
    }

    const { token, user } = await loginUser(parsed.data.email, parsed.data.password, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    const cookieOpts = setCookieOptions();
    res.cookie(env.SESSION_COOKIE_NAME, token, cookieOpts);

    // --- [DEBUG-AUTH] temporal ---
    if (env.NODE_ENV !== "production") {
      console.log("[AUTH LOGIN] usuario encontrado: sí | id:", user.id, "| role:", user.role, "| tenantId:", user.tenantId);
      console.log("[AUTH LOGIN] sesión creada: sí | cookieName:", env.SESSION_COOKIE_NAME);
      console.log("[AUTH LOGIN] cookieOptions:", JSON.stringify(cookieOpts));
      console.log("[AUTH LOGIN] Set-Cookie debería enviarse: sí (token oculto)");
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME];
    if (token) {
      await logoutSession(token);
    }
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true, message: "Sesión cerrada" });
  } catch (err) {
    next(err);
  }
}

export async function logoutAllController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);
    await logoutAllSessions(req.user.id);
    res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true, message: "Todas las sesiones cerradas" });
  } catch (err) {
    next(err);
  }
}

export async function meController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);
    res.json({
      success: true,
      data: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        tenantId: req.user.tenantId,
        status: req.user.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function sessionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("No autenticado", 401);
    const sessions = await listActiveSessions(req.user.id);
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
}
