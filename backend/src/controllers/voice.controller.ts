import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";
import * as voice from "../services/voice.service.js";

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new AppError("Usuario no asociado a ninguna empresa", 403);
  return tenantId;
}

export async function voiceEntitlementController(req: Request, res: Response, next: NextFunction) {
  try {
    const entitlement = await voice.getTenantVoiceEntitlement(tenantIdOf(req));
    res.json({ success: true, data: entitlement });
  } catch (err) {
    next(err);
  }
}

export async function voiceUsageController(req: Request, res: Response, next: NextFunction) {
  try {
    const usage = await voice.getVoicePeriodUsage(tenantIdOf(req));
    res.json({ success: true, data: usage });
  } catch (err) {
    next(err);
  }
}

export async function listCallsController(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Number(req.query.limit) || 50;
    const calls = await voice.listCalls(tenantIdOf(req), limit);
    res.json({ success: true, data: calls });
  } catch (err) {
    next(err);
  }
}

export async function getCallDetailController(req: Request, res: Response, next: NextFunction) {
  try {
    const call = await voice.getCallDetail(tenantIdOf(req), req.params.id);
    res.json({ success: true, data: call });
  } catch (err) {
    next(err);
  }
}

/** Sincroniza el prompt del agente Sendwary hacia ElevenLabs (OWNER/ADMIN). */
export async function syncAgentVoiceController(req: Request, res: Response, next: NextFunction) {
  try {
    const { syncAgentToElevenLabs } = await import("../services/elevenlabs.service.js");
    const result = await syncAgentToElevenLabs(req.params.id, tenantIdOf(req));
    res.json({ success: true, data: result, message: result.detail });
  } catch (err) {
    next(err);
  }
}

const testUsageSchema = z.object({
  durationSeconds: z.coerce.number().int().min(1).max(3600 * 4),
  agentId: z.string().nullish(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).default("INBOUND"),
  customerPhone: z.string().max(30).nullish(),
  summary: z.string().max(500).nullish(),
});

/**
 * Registro de consumo SIMULADO para probar la UI y el enforcement sin
 * ElevenLabs. Restringido: solo en desarrollo o para SUPER_ADMIN.
 */
export async function testRecordUsageController(req: Request, res: Response, next: NextFunction) {
  try {
    if (env.NODE_ENV === "production" && req.user?.role !== "SUPER_ADMIN") {
      throw new AppError("Solo disponible en desarrollo o para SUPER_ADMIN", 403);
    }

    const parsed = testUsageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Datos inválidos",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const tenantId = tenantIdOf(req);
    const result = await voice.recordVoiceUsage({
      tenantId,
      agentId: parsed.data.agentId,
      userId: req.user?.id ?? null,
      direction: parsed.data.direction,
      status: "COMPLETED",
      durationSeconds: parsed.data.durationSeconds,
      customerPhone: parsed.data.customerPhone,
      summary: parsed.data.summary ?? "Llamada simulada (prueba)",
      metadata: { simulated: true },
    });

    const entitlement = await voice.getTenantVoiceEntitlement(tenantId);
    res.status(201).json({
      success: true,
      data: { call: voice.serializeCall({ ...result.call, agent: null }), entitlement },
      message: "Consumo simulado registrado",
    });
  } catch (err) {
    next(err);
  }
}
