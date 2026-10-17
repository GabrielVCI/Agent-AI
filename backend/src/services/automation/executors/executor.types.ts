/**
 * Contrato de los executors de acciones.
 *
 * El motor NO conoce WhatsApp, correo ni etiquetas: solo sabe pedirle a un
 * executor que ejecute un job. Agregar una acción nueva = agregar un executor
 * y registrarlo; el worker, los retries y la auditoría no cambian.
 */
import type { AutomationJob, AutomationRule, Tenant } from "@prisma/client";
import type { AutomationJobPayload } from "../automation.types.js";

export interface ExecutorContext {
  job: AutomationJob;
  rule: AutomationRule;
  tenant: Pick<Tenant, "id" | "name" | "timezone" | "status">;
  payload: AutomationJobPayload;
  /** Config de la acción (actionConfigJson de la regla) ya como objeto. */
  actionConfig: Record<string, unknown>;
  correlationId: string | null;
}

export interface ExecutorResult {
  /** Resumen corto y seguro para el historial de ejecuciones. */
  summary: string;
  /**
   * true = la acción no aplicaba en este momento (ej. la conversación pasó a
   * modo humano). El job se cierra como SKIPPED, no como error.
   */
  skipped?: boolean;
}

export interface AutomationExecutor {
  /** Ejecuta la acción. Debe lanzar AutomationActionError ante fallo. */
  execute(context: ExecutorContext): Promise<ExecutorResult>;
  /** Valida la config de la acción al crear/editar la regla. null = ok. */
  validateConfig(config: Record<string, unknown>): string | null;
}
