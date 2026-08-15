import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  loginUser,
  registerUser,
  loginWithGoogleProfile,
  logoutSession,
  logoutAllSessions,
  listActiveSessions,
} from "../services/auth.service.js";
import {
  isGoogleConfigured,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
} from "../services/google-oauth.service.js";
import {
  requestPasswordReset,
  validateResetToken,
  resetPasswordWithToken,
} from "../services/password-reset.service.js";
import {
  verifyEmailWithToken,
  resendVerificationEmail,
} from "../services/email-verification.service.js";
import { prisma } from "../config/prisma.js";
import { generateToken } from "../lib/crypto.js";
import { env, sessionCookieAttrs } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

const strongPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe incluir al menos una mayúscula")
  .regex(/[a-z]/, "Debe incluir al menos una minúscula")
  .regex(/[0-9]/, "Debe incluir al menos un número")
  .regex(/[^A-Za-z0-9]/, "Debe incluir al menos un símbolo");

const registerSchema = z
  .object({
    name: z.string().min(2, "Nombre requerido").max(80),
    lastName: z.string().min(2, "Apellido requerido").max(80),
    email: z.string().email("Email inválido"),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

const GOOGLE_STATE_COOKIE = "g_oauth_state";

function setCookieOptions() {
  return {
    ...sessionCookieAttrs(),
    maxAge: env.SESSION_TTL_SECONDS * 1000,
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

export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { token, user, verificationEmailSent } = await registerUser(parsed.data, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    // La cuenta queda creada aunque el correo falle: el usuario puede pedir el
    // reenvío desde la pantalla de verificación (nunca se revierte el registro).
    const emailFailedInProd = !verificationEmailSent && env.NODE_ENV === "production";

    res.cookie(env.SESSION_COOKIE_NAME, token, setCookieOptions());
    res.status(201).json({
      success: true,
      message: emailFailedInProd
        ? "Tu cuenta fue creada, pero no pudimos enviar el correo de verificación. Puedes solicitar reenviarlo."
        : "Registro creado. Revisa tu correo para verificar tu cuenta.",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        emailVerified: false,
        verificationEmailSent,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Redirige al consentimiento de Google. Si no está configurado, 503 con mensaje claro. */
export function googleStartController(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!isGoogleConfigured()) {
      // Navegación top-level del navegador: redirigir con mensaje en vez de JSON.
      res.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent(
          "El inicio de sesión con Google no está disponible todavía. Usa tu correo y contraseña."
        )}`
      );
      return;
    }

    const state = generateToken(16);
    res.cookie(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: "lax", // debe viajar en el redirect top-level desde Google
      maxAge: 10 * 60 * 1000,
      path: "/",
    });
    res.redirect(buildGoogleAuthUrl(state));
  } catch (err) {
    next(err);
  }
}

/** Callback de Google: valida state, intercambia el código y crea la sesión (cookie httpOnly). */
export async function googleCallbackController(
  req: Request,
  res: Response
): Promise<void> {
  const failRedirect = (message: string) =>
    res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`);

  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const expectedState = req.cookies?.[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/" });

    if (error === "access_denied") {
      failRedirect("Cancelaste el inicio de sesión con Google");
      return;
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      failRedirect("No se pudo validar la solicitud de Google. Intenta de nuevo.");
      return;
    }

    const profile = await exchangeGoogleCode(code);
    const { token } = await loginWithGoogleProfile(profile, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    res.cookie(env.SESSION_COOKIE_NAME, token, setCookieOptions());
    res.redirect(`${env.FRONTEND_URL}/`);
  } catch (err) {
    const message =
      err instanceof AppError ? err.message : "Error iniciando sesión con Google";
    failRedirect(message);
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
    res.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieAttrs());
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
    res.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieAttrs());
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
    // emailVerifiedAt no vive en la cache de sesión: lectura fresca de DB para
    // que la verificación se refleje sin re-login.
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { emailVerifiedAt: true },
    });
    res.json({
      success: true,
      data: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        tenantId: req.user.tenantId,
        status: req.user.status,
        emailVerified: req.user.role === "SUPER_ADMIN" ? true : Boolean(dbUser?.emailVerifiedAt),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Verificación de correo ──────────────────────────────────────────────────

const verifyEmailSchema = z.object({
  token: z.string().min(32, "Token inválido"),
});

export async function verifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "El enlace de verificación no es válido o ya expiró.",
      });
      return;
    }

    const result = await verifyEmailWithToken(parsed.data.token);
    res.json({
      success: true,
      message: result.alreadyVerified
        ? "Tu cuenta ya estaba verificada. Puedes continuar en Sendwary."
        : "Cuenta verificada. Revisa tu correo: te enviamos los siguientes pasos.",
    });
  } catch (err) {
    next(err);
  }
}

const resendVerificationSchema = z.object({
  email: z.string().email("Email inválido").optional(),
});

/** Respuesta SIEMPRE genérica: no revela si el correo existe ni su estado. */
export async function resendVerificationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    // Usuario autenticado: reenvía a su propia cuenta; si no, requiere email.
    if (req.user) {
      await resendVerificationEmail({ userId: req.user.id });
    } else if (parsed.data.email) {
      await resendVerificationEmail({ email: parsed.data.email });
    }

    res.json({
      success: true,
      message: "Si tu cuenta está pendiente de verificación, recibirás un nuevo correo en unos minutos.",
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

// ─── Recuperación de contraseña ──────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

const resetPasswordSchema = z
  .object({
    token: z.string().min(32, "Token inválido"),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

/** Respuesta SIEMPRE genérica: no revela si el correo existe. */
export async function forgotPasswordController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    await requestPasswordReset(parsed.data.email);
    res.json({
      success: true,
      message: "Si el correo existe, enviaremos instrucciones para restablecer tu contraseña.",
    });
  } catch (err) {
    next(err);
  }
}

export async function validateResetTokenController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = String(req.query.token ?? "");
    const result = await validateResetToken(token);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    await resetPasswordWithToken(parsed.data.token, parsed.data.password);
    res.json({
      success: true,
      message: "Contraseña actualizada. Ya puedes iniciar sesión.",
    });
  } catch (err) {
    next(err);
  }
}
