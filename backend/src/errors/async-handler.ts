import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Envuelve un controller async para que cualquier throw/reject llegue al
 * errorHandler central sin try/catch manual. Los controllers existentes usan
 * try/catch + next(err) (equivalente); usar este helper en código nuevo.
 *
 *   router.get("/ruta", asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
