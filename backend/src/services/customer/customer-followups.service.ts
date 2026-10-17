/**
 * Próximos seguimientos de un cliente (Módulo 3).
 *
 * NO hay una tabla de recurrencias. Un seguimiento programado ES un
 * `AutomationJob` del Módulo 0: si lo duplicáramos en un modelo propio
 * tendríamos dos verdades sobre la misma cosa y un segundo scheduler que
 * mantener. Aquí solo se LEE lo que el motor ya tiene y se traduce a algo que
 * el panel pueda pintar.
 *
 * Por eso cancelar o mover un seguimiento tampoco borra filas: se delega en
 * `cancelJobById` / `rescheduleJob` del motor, que dejan el job en CANCELLED
 * con su motivo y conservan la trazabilidad.
 */
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import {
  cancelJobById,
  rescheduleJob,
} from "../automation/automation-jobs.service.js";
import { parseRecurrenceEntityId } from "../appointment/service-recurrence.js";

/** Estados de job que representan un seguimiento todavía por ocurrir. */
const PENDING_JOB_STATUSES = ["SCHEDULED", "PENDING", "RETRY_PENDING"] as const;

export interface CustomerFollowUp {
  id: string;
  scheduledFor: Date;
  status: string;
  /** Nombre de la automatización que lo programó. */
  ruleName: string;
  /** Servicio del que salió la recurrencia, si el job viene de SERVICE_USED. */
  serviceId: string | null;
  serviceName: string | null;
  eventType: string;
  actionType: string;
  /** Cita que originó el seguimiento, cuando el payload la conserva. */
  appointmentId: string | null;
}

/**
 * Seguimientos pendientes del cliente, ordenados por fecha.
 *
 * Se resuelven los nombres de servicio en UNA consulta: el detalle del cliente
 * no puede hacer una query por fila.
 */
export async function listCustomerFollowUps(
  tenantId: string,
  customerId: string,
  limit = 20
): Promise<CustomerFollowUp[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });
  if (!customer) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `cliente ${customerId} inexistente o de otro tenant (${tenantId})`,
    });
  }

  const jobs = await prisma.automationJob.findMany({
    where: {
      tenantId,
      customerId,
      status: { in: [...PENDING_JOB_STATUSES] },
      scheduledFor: { gte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: Math.min(Math.max(1, limit), 50),
    include: { rule: { select: { name: true } } },
  });

  // Los jobs de recurrencia llevan entityId "<clienteId>:<servicioId>".
  const serviceIds = new Set<string>();
  for (const job of jobs) {
    const parsed = parseRecurrenceEntityId(job.entityId);
    if (parsed && parsed.customerId === customerId) serviceIds.add(parsed.serviceId);
  }

  const services = serviceIds.size
    ? await prisma.product.findMany({
        where: { tenantId, id: { in: [...serviceIds] } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(services.map((service) => [service.id, service.name]));

  return jobs.map((job) => {
    const parsed = parseRecurrenceEntityId(job.entityId);
    const serviceId = parsed && parsed.customerId === customerId ? parsed.serviceId : null;
    const payload = (job.payloadJson ?? {}) as {
      eventPayload?: { appointmentId?: unknown; serviceName?: unknown };
    };

    return {
      id: job.id,
      scheduledFor: job.scheduledFor,
      status: job.status,
      ruleName: job.rule.name,
      serviceId,
      serviceName:
        (serviceId ? nameById.get(serviceId) : null) ??
        (typeof payload.eventPayload?.serviceName === "string"
          ? payload.eventPayload.serviceName
          : null),
      eventType: job.eventType,
      actionType: job.actionType,
      appointmentId:
        typeof payload.eventPayload?.appointmentId === "string"
          ? payload.eventPayload.appointmentId
          : null,
    };
  });
}

/**
 * Cancela un seguimiento desde la ficha del cliente.
 *
 * Delega en el motor: el job queda CANCELLED con motivo y su mensaje programado
 * también, en vez de desaparecer del historial.
 */
export async function cancelCustomerFollowUp(
  tenantId: string,
  customerId: string,
  jobId: string
): Promise<void> {
  await assertJobBelongsToCustomer(tenantId, customerId, jobId);
  const cancelled = await cancelJobById({
    tenantId,
    jobId,
    reason: "Cancelado desde la ficha del cliente",
  });
  if (!cancelled) {
    throw new AppError("Ese seguimiento ya no está pendiente.", 409, { code: "CONFLICT" });
  }
}

/** Mueve un seguimiento a otra fecha usando el reschedule del motor. */
export async function rescheduleCustomerFollowUp(
  tenantId: string,
  customerId: string,
  jobId: string,
  scheduledFor: Date
): Promise<Date> {
  await assertJobBelongsToCustomer(tenantId, customerId, jobId);
  if (scheduledFor.getTime() <= Date.now()) {
    throw new AppError("La nueva fecha del seguimiento debe estar en el futuro.", 400, {
      code: "VALIDATION_ERROR",
      details: { field: "scheduledFor" },
    });
  }
  const job = await rescheduleJob({ tenantId, jobId, scheduledFor });
  if (!job) {
    throw new AppError("Ese seguimiento ya no se puede mover.", 409, { code: "CONFLICT" });
  }
  return job.scheduledFor;
}

/**
 * El job tiene que ser del tenant Y de ese cliente. Comprobar solo el tenant
 * dejaría que alguien moviera el seguimiento de otro contacto conociendo su id.
 */
async function assertJobBelongsToCustomer(
  tenantId: string,
  customerId: string,
  jobId: string
): Promise<void> {
  const job = await prisma.automationJob.findFirst({
    where: { id: jobId, tenantId, customerId },
    select: { id: true },
  });
  if (!job) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `job ${jobId} inexistente, de otro tenant o de otro cliente`,
    });
  }
}
