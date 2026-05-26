import type { Request, Response } from "express";

export function healthController(_req: Request, res: Response) {
  res.json({
    status: "ok",
    service: "ferreteria-ai-agent-backend",
    timestamp: new Date().toISOString()
  });
}