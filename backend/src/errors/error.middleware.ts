import type { NextFunction, Request, Response } from "express";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "./AppError.js";
import { userMessageFor } from "./error-messages.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

/**
 * Manejo centralizado de errores.
 *
 * Contrato de respuesta (SIEMPRE):
 *   {
 *     success: false,
 *     message: "<mensaje amigable>",        // compat: el frontend ya lee esto
 *     error: { code, message, details?, traceId? }
 *   }
 *
 * - El usuario NUNCA recibe stack traces, mensajes técnicos, "Unauthorized"
 *   ni códigos crudos como texto: solo mensajes en español + `code` estable.
 * - Lo técnico (internalMessage, stack, Prisma code...) va al log con traceId
 *   para correlacionar. Nunca se loguean tokens/passwords/cookies/API keys.
 */

function newTraceId(): string {
  return randomBytes(6).toString("hex");
}

/** Convierte cualquier error en un AppError con código y mensaje amigable. */
function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // ── Prisma ──
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = { prismaCode: error.code };
    if (error.code === "P2002") {
      return AppError.fromCode("CONFLICT", {
        message: "Ya existe un registro con esos datos.",
        internalMessage: `Prisma P2002 unique constraint: ${JSON.stringify(error.meta ?? {})}`,
      });
    }
    if (error.code === "P2025") {
      return AppError.fromCode("RESOURCE_NOT_FOUND", {
        message: "No encontramos el registro solicitado.",
        internalMessage: `Prisma P2025: ${error.message.split("\n").pop() ?? ""}`,
      });
    }
    // Conexión/pool/timeouts (P1xxx y P2024 connection pool timeout)
    if (error.code.startsWith("P1") || error.code === "P2024") {
      return AppError.fromCode("DATABASE_CONNECTION_ERROR", {
        internalMessage: `Prisma ${error.code}: ${error.message.split("\n").pop() ?? ""}`,
        details: undefined,
        cause: meta,
      });
    }
    return AppError.fromCode("DATABASE_QUERY_ERROR", {
      internalMessage: `Prisma ${error.code}: ${error.message.split("\n").pop() ?? ""}`,
    });
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return AppError.fromCode("DATABASE_CONNECTION_ERROR", {
      internalMessage: `Prisma init: ${error.message.split("\n").pop() ?? ""}`,
    });
  }
  if (
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return AppError.fromCode("DATABASE_QUERY_ERROR", {
      internalMessage: `Prisma ${error.constructor.name}: ${error.message.split("\n").pop() ?? ""}`,
    });
  }

  // ── Zod lanzado suelto (los controllers suelen usar safeParse) ──
  if (error instanceof ZodError) {
    return AppError.fromCode("VALIDATION_ERROR", {
      details: { fieldErrors: error.flatten().fieldErrors },
      internalMessage: "ZodError fuera de safeParse",
    });
  }

  // ── Body JSON malformado (express.json) ──
  if (error instanceof SyntaxError && "body" in (error as object)) {
    return AppError.fromCode("VALIDATION_ERROR", {
      internalMessage: `JSON inválido en el body: ${error.message}`,
    });
  }

  // ── Errores HTTP de axios (servicios externos). OJO: err.config lleva el
  // header Authorization — solo extraemos método/host/status, nunca headers. ──
  if (isAxiosLike(error)) {
    const status = error.response?.status;
    const host = safeHost(error.config?.url);
    return AppError.fromCode("EXTERNAL_SERVICE_ERROR", {
      internalMessage: `HTTP ${status ?? "sin respuesta"} de ${host} (${error.config?.method ?? "?"})`,
    });
  }

  // ── Errores con statusCode/status (http-errors, express.static, etc.) ──
  const anyErr = error as { statusCode?: number; status?: number; message?: string };
  const status = anyErr?.statusCode ?? anyErr?.status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    const app = new AppError(userMessageFor(status >= 500 ? "UNKNOWN_ERROR" : "RESOURCE_NOT_FOUND"), status, {
      internalMessage: anyErr.message,
    });
    return app;
  }

  // ── Desconocido ──
  return AppError.fromCode("UNKNOWN_ERROR", {
    internalMessage: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

interface AxiosLikeError {
  isAxiosError: boolean;
  response?: { status?: number };
  config?: { url?: string; method?: string };
}

function isAxiosLike(err: unknown): err is AxiosLikeError {
  return Boolean(err && typeof err === "object" && (err as AxiosLikeError).isAxiosError);
}

function safeHost(url?: string): string {
  if (!url) return "servicio externo";
  try {
    return new URL(url).host;
  } catch {
    return "servicio externo";
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(
    AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    })
  );
}

export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const appError = normalizeError(error);
  const traceId = newTraceId();
  const isDev = env.NODE_ENV !== "production";

  // ── Log técnico (Parte I): code, internalMessage, traceId, userId,
  // tenantId, ruta. Sin tokens/passwords/cookies/keys (nunca se agregan). ──
  const logPayload = {
    traceId,
    code: appError.code,
    statusCode: appError.statusCode,
    route: `${req.method} ${req.originalUrl}`,
    userId: req.user?.id ?? null,
    tenantId: req.user?.tenantId ?? req.tenantId ?? null,
    userMessage: appError.userMessage,
    internalMessage: appError.internalMessage ?? null,
    // stack: siempre en dev; en producción solo para 5xx (diagnóstico de
    // incidentes) — jamás viaja en la respuesta HTTP.
    ...(isDev || appError.statusCode >= 500 ? { stack: appError.stack } : {}),
  };
  if (appError.statusCode >= 500) {
    logger.error(`[ERROR ${appError.code}]`, logPayload);
  } else {
    logger.warn(`[ERROR ${appError.code}]`, logPayload);
  }

  // ── Respuesta al cliente: solo mensaje amigable + code + details seguros ──
  res.status(appError.statusCode).json({
    success: false,
    message: appError.userMessage,
    error: {
      code: appError.code,
      message: appError.userMessage,
      ...(appError.details ? { details: appError.details } : {}),
      ...(isDev ? { traceId } : {}),
    },
  });
}
