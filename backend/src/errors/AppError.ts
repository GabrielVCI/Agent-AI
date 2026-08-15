import { type ErrorCode, codeFromStatus, defaultStatusFor } from "./error-codes.js";
import { userMessageFor } from "./error-messages.js";

export interface AppErrorOptions {
  code?: ErrorCode;
  /** Detalle técnico SOLO para logs; jamás viaja al cliente. */
  internalMessage?: string;
  /** Datos estructurados seguros para el cliente (ej. fieldErrors). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Error estándar de Sendwary.
 *
 * Firmas soportadas (la primera es la legacy usada en ~100 call sites):
 *   new AppError("Mensaje para el usuario", 404)
 *   new AppError("Mensaje para el usuario", 404, { code: "RESOURCE_NOT_FOUND", internalMessage: "..." })
 *   AppError.fromCode("INVALID_CREDENTIALS")            // usa mensaje y status default
 *   AppError.fromCode("FORBIDDEN", { internalMessage })
 *
 * `message` (== userMessage) es SIEMPRE apto para mostrarse al usuario final.
 * Lo técnico va en internalMessage/cause y solo se loguea.
 */
export class AppError extends Error {
  public statusCode: number;
  public code: ErrorCode;
  public userMessage: string;
  public internalMessage?: string;
  public details?: Record<string, unknown>;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500, options: AppErrorOptions = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = options.code ?? codeFromStatus(statusCode);
    this.userMessage = message;
    this.internalMessage = options.internalMessage;
    this.details = options.details;
    this.isOperational = true;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;

    Error.captureStackTrace(this, this.constructor);
  }

  /** Crea el error a partir del código: mensaje amigable y status default. */
  static fromCode(
    code: ErrorCode,
    options: Omit<AppErrorOptions, "code"> & { statusCode?: number; message?: string } = {}
  ): AppError {
    const { statusCode, message, ...rest } = options;
    return new AppError(message ?? userMessageFor(code), statusCode ?? defaultStatusFor(code), {
      ...rest,
      code,
    });
  }
}
