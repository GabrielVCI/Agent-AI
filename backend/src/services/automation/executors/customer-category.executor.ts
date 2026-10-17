/**
 * Executors ASSIGN_CUSTOMER_CATEGORY y REMOVE_CUSTOMER_CATEGORY (Módulo 2).
 *
 * Son la integración de la segmentación automática con el Automation Core: NO
 * existe un motor de reglas paralelo para categorías. Una categoría automática
 * es, literalmente, una AutomationRule normal:
 *
 *   evento (CUSTOMER_VISITED, APPOINTMENT_COMPLETED, CUSTOMER_BECAME_VIP…)
 *     → condiciones del DSL que ya existe
 *       → esta acción
 *
 * Por eso aquí no se calcula ningún criterio comercial ("VIP = gastó X"): el
 * criterio vive en la regla que configura el negocio, y este executor solo
 * aplica el resultado.
 *
 * Anti-bucle (§54): el servicio de categorías solo emite
 * CUSTOMER_CATEGORY_ASSIGNED/REMOVED cuando la pertenencia CAMBIA de verdad.
 * Reasignar algo ya asignado no emite evento, así que una cadena de reglas de
 * categorías se apaga sola en la primera repetición.
 */
import {
  applyAutomationAssignment,
} from "../../customer/customer-category.service.js";
import { AutomationActionError } from "../automation-errors.js";
import type { AutomationExecutor, ExecutorContext, ExecutorResult } from "./executor.types.js";
import type { CustomerCategoryActionConfig } from "../automation.types.js";

function validateConfig(config: Record<string, unknown>): string | null {
  const { categoryId, reason } = config as unknown as CustomerCategoryActionConfig;
  if (typeof categoryId !== "string" || categoryId.trim().length === 0) {
    return "Elige la categoría que debe aplicar esta automatización";
  }
  if (categoryId.length > 40) return "Identificador de categoría inválido";
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 200)) {
    return "El motivo no puede superar 200 caracteres";
  }
  // La pertenencia al tenant NO se puede comprobar aquí (validateConfig no
  // recibe tenant): se verifica al ejecutar, contra el tenantId del job, que es
  // el único que no viene del cliente.
  return null;
}

function build(action: "assign" | "remove"): AutomationExecutor {
  return {
    validateConfig,

    async execute(context: ExecutorContext): Promise<ExecutorResult> {
      const config = context.actionConfig as unknown as CustomerCategoryActionConfig;
      const { job } = context;

      if (!job.customerId) {
        throw AutomationActionError.nonRetryable(
          "NO_CUSTOMER",
          "Esta automatización necesita un cliente al que aplicar la categoría"
        );
      }

      try {
        const result = await applyAutomationAssignment(
          job.tenantId,
          job.customerId,
          config.categoryId.trim(),
          action,
          {
            reason: config.reason ?? `regla: ${context.rule.name}`,
            correlationId: context.correlationId,
            causationId: job.id,
          }
        );

        const verb = action === "assign" ? "aplicada" : "retirada";
        if (!result.changed) {
          // Idempotencia: el estado ya era el pedido. No es un fallo — el
          // objetivo de negocio se cumple igual.
          return {
            summary: `El cliente ya estaba ${
              action === "assign" ? "en" : "fuera de"
            } "${result.category.name}"`,
          };
        }
        return { summary: `Categoría "${result.category.name}" ${verb}` };
      } catch (error) {
        // Categoría borrada, archivada, de sistema o de otro tenant: reintentar
        // no lo va a arreglar.
        throw AutomationActionError.nonRetryable(
          "CATEGORY_UNAVAILABLE",
          error instanceof Error
            ? error.message
            : "No se pudo aplicar la categoría configurada"
        );
      }
    },
  };
}

export const assignCustomerCategoryExecutor = build("assign");
export const removeCustomerCategoryExecutor = build("remove");
