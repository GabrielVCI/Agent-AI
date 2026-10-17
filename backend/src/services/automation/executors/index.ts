/**
 * Registro de executors. Única puerta de entrada del motor a las acciones.
 *
 * Agregar una acción nueva:
 *   1. valor en el enum AutomationActionType (Prisma)
 *   2. executor en esta carpeta
 *   3. entrada en EXECUTORS
 * El worker, los reintentos, la idempotencia y la auditoría no cambian.
 */
import type { AutomationActionType } from "@prisma/client";
import type { AutomationExecutor } from "./executor.types.js";
import { whatsappMessageExecutor } from "./whatsapp-message.executor.js";
import { emailExecutor } from "./email.executor.js";
import { internalNotificationExecutor } from "./internal-notification.executor.js";
import { customerTagExecutor } from "./customer-tag.executor.js";
import {
  assignCustomerCategoryExecutor,
  removeCustomerCategoryExecutor,
} from "./customer-category.executor.js";

const EXECUTORS: Record<AutomationActionType, AutomationExecutor> = {
  SEND_WHATSAPP_MESSAGE: whatsappMessageExecutor,
  SEND_EMAIL: emailExecutor,
  CREATE_INTERNAL_NOTIFICATION: internalNotificationExecutor,
  UPDATE_CUSTOMER_TAG: customerTagExecutor,
  ASSIGN_CUSTOMER_CATEGORY: assignCustomerCategoryExecutor,
  REMOVE_CUSTOMER_CATEGORY: removeCustomerCategoryExecutor,
};

export function getExecutor(actionType: AutomationActionType): AutomationExecutor | null {
  return EXECUTORS[actionType] ?? null;
}

export function hasExecutor(actionType: string): actionType is AutomationActionType {
  return actionType in EXECUTORS;
}

export function listActionTypes(): AutomationActionType[] {
  return Object.keys(EXECUTORS) as AutomationActionType[];
}

/** Valida la configuración de la acción al crear/editar una regla. */
export function validateActionConfig(
  actionType: AutomationActionType,
  config: unknown
): string | null {
  const executor = getExecutor(actionType);
  if (!executor) return "Acción no soportada";
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return "La configuración de la acción debe ser un objeto";
  }
  return executor.validateConfig(config as Record<string, unknown>);
}

export type { AutomationExecutor, ExecutorContext, ExecutorResult } from "./executor.types.js";
