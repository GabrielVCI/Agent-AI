/**
 * API de automatizaciones del TENANT.
 *
 * El tenantId sale SIEMPRE de la sesión (req.user.tenantId): nunca del body ni
 * de la query. Los endpoints de plataforma (jobs fallidos globales, salud del
 * worker, reintento manual) viven en /api/admin, no aquí.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import * as rules from "../services/automation/automation-rules.service.js";
import * as jobs from "../services/automation/automation-jobs.service.js";
import {
  AUTOMATION_EVENT_CATALOG,
  AUTOMATION_EVENT_TYPES,
} from "../services/automation/automation.types.js";
import { listActionTypes } from "../services/automation/executors/index.js";
import {
  instantiateTemplate,
  listRuleTemplates,
} from "../services/automation/automation-templates.js";
import { syncCategoryManagement } from "../services/customer/customer-category.service.js";

/**
 * Tras tocar una regla, recalcula qué categorías de clientes quedan marcadas
 * como automáticas (Módulo 2). Es best-effort: que el panel de segmentación
 * tarde un momento en reflejarlo no puede hacer fallar el guardado de la regla.
 */
function refreshManagedCategories(tenantId: string): void {
  void syncCategoryManagement(tenantId).catch(() => undefined);
}

function tenantIdOf(req: Request): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw AppError.fromCode("TENANT_REQUIRED", {
      internalMessage: "automations: usuario sin tenantId",
    });
  }
  return tenantId;
}

function invalid(res: Response, errors: Record<string, string[] | undefined>): void {
  res.status(400).json({ success: false, message: "Datos inválidos", errors });
}

const eventTypeEnum = z.enum(AUTOMATION_EVENT_TYPES as [string, ...string[]]);
const actionTypeEnum = z.enum(listActionTypes() as [string, ...string[]]);

const scheduleConfigSchema = z
  .object({
    field: z.string().max(80).optional(),
    offsetMinutes: z.number().int().min(-525_600).max(525_600).optional(),
    localTime: z.string().max(5).optional(),
    dedupeTag: z.string().max(40).optional(),
    dedupeWindow: z.enum(["entity", "day", "occurrence"]).optional(),
  })
  .nullable()
  .optional();

const ruleBodySchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres").max(120),
  description: z.string().max(500).nullish(),
  eventType: eventTypeEnum,
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  enabled: z.boolean().optional(),
  conditions: z.unknown().optional(),
  actionType: actionTypeEnum,
  actionConfig: z.record(z.unknown()),
  scheduleStrategy: z
    .enum(["IMMEDIATE", "DELAY", "RELATIVE_TO_FIELD", "DAILY_AT_LOCAL_TIME"])
    .optional(),
  delayMinutes: z.coerce.number().int().min(0).max(525_600).optional(),
  scheduleConfig: scheduleConfigSchema,
  cancelOnEventTypes: z.array(eventTypeEnum).max(10).optional(),
  priority: z.coerce.number().int().min(-100).max(100).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).nullish(),
});

const ruleListQuerySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  eventType: eventTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const jobListQuerySchema = z.object({
  status: z
    .enum([
      "PENDING",
      "SCHEDULED",
      "PROCESSING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "RETRY_PENDING",
    ])
    .optional(),
  eventType: eventTypeEnum.optional(),
  ruleId: z.string().max(40).optional(),
  entityId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const executionListQuerySchema = z.object({
  jobId: z.string().max(40).optional(),
  ruleId: z.string().max(40).optional(),
  status: z.enum(["SUCCESS", "FAILED", "RETRY_SCHEDULED", "SKIPPED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Catálogo ────────────────────────────────────────────────────────────────

export async function getAutomationCatalogController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    res.json({
      success: true,
      data: {
        events: Object.values(AUTOMATION_EVENT_CATALOG),
        actions: listActionTypes(),
        templates: listRuleTemplates(),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

export async function listRulesController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = ruleListQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await rules.listRules(tenantIdOf(req), parsed.data as never);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRuleController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await rules.getRule(tenantIdOf(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createRuleController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = ruleBodySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await rules.createRule(
      tenantIdOf(req),
      parsed.data as never,
      req.user?.id
    );
    refreshManagedCategories(tenantIdOf(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateRuleController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = ruleBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await rules.updateRule(tenantIdOf(req), req.params.id, parsed.data as never);
    refreshManagedCategories(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function archiveRuleController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await rules.archiveRule(tenantIdOf(req), req.params.id);
    refreshManagedCategories(tenantIdOf(req));
    res.json({
      success: true,
      data,
      message:
        data.cancelledJobs > 0
          ? `Automatización archivada. Se cancelaron ${data.cancelledJobs} envío(s) pendiente(s).`
          : "Automatización archivada.",
    });
  } catch (err) {
    next(err);
  }
}

export async function useTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    const key = z.string().min(2).max(80).safeParse(req.body?.templateKey);
    if (!key.success) return invalid(res, { templateKey: ["Plantilla requerida"] });

    const result = await instantiateTemplate(tenantIdOf(req), key.data, req.user?.id);
    refreshManagedCategories(tenantIdOf(req));
    if (!result) {
      throw AppError.fromCode("RESOURCE_NOT_FOUND", { message: "Esa plantilla no existe" });
    }
    res.status(result.created ? 201 : 200).json({
      success: true,
      data: result.rule,
      message: result.created
        ? "Automatización creada desde la plantilla (queda en borrador)."
        : "Ya tenías esta automatización.",
    });
  } catch (err) {
    next(err);
  }
}

// ─── Jobs y ejecuciones ──────────────────────────────────────────────────────

export async function listJobsController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = jobListQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await jobs.listJobs(tenantIdOf(req), parsed.data as never);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function cancelJobController(req: Request, res: Response, next: NextFunction) {
  try {
    const cancelled = await jobs.cancelJobById({
      tenantId: tenantIdOf(req),
      jobId: req.params.id,
      reason: "Cancelado desde el panel",
    });
    if (!cancelled) {
      throw AppError.fromCode("RESOURCE_NOT_FOUND", {
        message: "No encontramos ese envío pendiente o ya no se puede cancelar",
      });
    }
    res.json({ success: true, message: "Envío cancelado" });
  } catch (err) {
    next(err);
  }
}

export async function listExecutionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = executionListQuerySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error.flatten().fieldErrors);
    const data = await jobs.listExecutions(tenantIdOf(req), parsed.data as never);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAutomationHealthController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await jobs.getAutomationHealth(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
