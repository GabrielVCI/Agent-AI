/**
 * Compat: el sistema de errores vive ahora en src/errors/ (AppError con
 * code/userMessage/internalMessage, middleware central con traceId y mapeo
 * Prisma/Zod). Este archivo re-exporta para no tocar los imports existentes.
 * Código nuevo: importar desde "../errors/..." directamente.
 */
export { AppError, type AppErrorOptions } from "../errors/AppError.js";
export { errorHandler, notFoundHandler } from "../errors/error.middleware.js";
export { asyncHandler } from "../errors/async-handler.js";
export { ERROR_CODES, type ErrorCode } from "../errors/error-codes.js";
export { USER_MESSAGES } from "../errors/error-messages.js";
