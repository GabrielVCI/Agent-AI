import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);

    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(
  error: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = error instanceof AppError ? error.statusCode : 500;

  const response = {
    success: false,
    message:
      statusCode === 500
        ? "Error interno del servidor"
        : error.message
  };

  if (process.env.NODE_ENV !== "production") {
    Object.assign(response, {
      stack: error.stack
    });
  }

  res.status(statusCode).json(response);
}