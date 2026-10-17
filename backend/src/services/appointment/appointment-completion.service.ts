/**
 * Pipeline de cierre de una cita (Módulo 3).
 *
 * Es el único punto donde una cita se convierte en actividad comercial real:
 *
 *   Appointment COMPLETED
 *     → se congela el historial de servicios y productos (snapshots)
 *     → se calcula la próxima fecha recomendada de cada servicio recurrente
 *     → se recalculan las métricas de visita del cliente
 *     → se emiten los eventos de dominio
 *     → el Automation Core (Módulo 0) decide qué automatizar
 *     → la segmentación (Módulo 2) reevalúa por su cuenta
 *
 * Decisiones de diseño:
 *
 *  · NO hay tabla de visitas. Una cita COMPLETED *es* la visita, y sus métricas
 *    (`visitCount`, `firstVisitAt`, `lastVisitAt`) ya se recalculan enteras
 *    desde `Appointment(status = COMPLETED)` en el Módulo 1. Añadir un
 *    `CustomerVisit` crearía una segunda fuente de verdad para algo que ya es
 *    correcto y reconciliable.
 *
 *  · La marca `completedAt` es la barrera de idempotencia. La transición se
 *    hace con un UPDATE condicional (`completedAt IS NULL`): PostgreSQL decide
 *    quién gana, así que dos peticiones simultáneas producen UNA sola visita,
 *    UN solo juego de servicios y UN solo juego de recurrencias.
 *
 *  · Dentro de la transacción NO se llama a nada externo. Los eventos —y con
 *    ellos WhatsApp, correo y segmentación— se emiten DESPUÉS del commit: una
 *    transacción de PostgreSQL nunca queda abierta esperando a la API de Meta.
 */
import { Prisma } from "@prisma/client";
import type { Appointment, AppointmentLine } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../errors/AppError.js";
import { emitAutomationEvent } from "../automation/automation-events.service.js";
import { DEFAULT_TIMEZONE } from "../../utils/timezone.js";
import { ensureDefaultLine } from "./appointment-lines.service.js";
import {
  recurrenceEntityId,
  resolveNextRecommendedAt,
  type RecurrencePolicy,
} from "./service-recurrence.js";

function toNumber(value: Prisma.Decimal | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

export interface CompletionResult {
  /** false = la cita ya estaba cerrada; no se repitió ningún efecto. */
  changed: boolean;
  appointmentId: string;
  customerId: string | null;
  completedAt: Date;
  performedLines: AppointmentLine[];
}

/**
 * Parte TRANSACCIONAL del cierre. No emite eventos ni habla con nadie fuera de
 * PostgreSQL: o queda todo (estado + historial + snapshots), o no queda nada.
 */
export async function persistCompletion(
  tenantId: string,
  appointmentId: string,
  timezone: string
): Promise<CompletionResult> {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        status: true,
        completedAt: true,
        scheduledAt: true,
        serviceOrProduct: true,
        catalogItemId: true,
      },
    });
    if (!appointment) {
      throw AppError.fromCode("RESOURCE_NOT_FOUND", {
        internalMessage: `cita ${appointmentId} inexistente o de otro tenant (${tenantId})`,
      });
    }
    if (appointment.status === "CANCELLED") {
      throw new AppError("No se puede completar una cita cancelada", 409, { code: "CONFLICT" });
    }

    const now = new Date();

    // ── Transición atómica (Compare-And-Set) ──
    // El filtro `completedAt: null` es lo que resuelve la carrera: de dos
    // peticiones simultáneas, PostgreSQL solo deja pasar a una. La otra recibe
    // count = 0 y sale sin repetir efectos.
    const claimed = await tx.appointment.updateMany({
      where: { id: appointment.id, tenantId, completedAt: null, status: { not: "CANCELLED" } },
      data: { status: "COMPLETED", completedAt: now },
    });

    if (claimed.count === 0) {
      // Ya estaba cerrada: respuesta idempotente con el estado real, no un error.
      const lines = await tx.appointmentLine.findMany({
        where: { tenantId, appointmentId: appointment.id, status: "PERFORMED" },
      });
      return {
        changed: false,
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        completedAt: appointment.completedAt ?? now,
        performedLines: lines,
      };
    }

    // ── Historial: materializar y congelar ──
    // Una cita creada por WhatsApp o por el agente IA nunca pasó por la
    // pantalla de líneas: se materializa la suya con lo que se agendó.
    await ensureDefaultLine(tx, {
      id: appointment.id,
      tenantId,
      customerId: appointment.customerId,
      serviceOrProduct: appointment.serviceOrProduct,
      catalogItemId: appointment.catalogItemId,
    });

    const lines = await tx.appointmentLine.findMany({
      where: { tenantId, appointmentId: appointment.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            itemType: true,
            recurrenceEnabled: true,
            recurrenceInterval: true,
            recurrenceUnit: true,
          },
        },
      },
    });

    const performed: AppointmentLine[] = [];

    for (const line of lines) {
      // Lo que el negocio marcó como NO realizado no entra al historial: no se
      // inventa una ejecución que no ocurrió.
      if (line.status === "SKIPPED") continue;

      // Snapshot definitivo: se refresca desde el catálogo en ESTE momento y no
      // vuelve a tocarse nunca. Si mañana sube la tarifa, este importe no
      // cambia.
      const catalogPrice = line.product ? toNumber(line.product.price) : null;
      const unitPrice =
        line.kind === "PRODUCT_USED"
          ? 0
          : toNumber(line.unitPriceSnapshot) > 0
            ? toNumber(line.unitPriceSnapshot)
            : (catalogPrice ?? 0);
      const name = line.nameSnapshot || line.product?.name || "Servicio";

      // Recurrencia: sale de la CONFIGURACIÓN del ítem del catálogo, por id.
      // Nunca del nombre del servicio. Sin política configurada → null, y no se
      // programa absolutamente nada.
      const policy: RecurrencePolicy | null = line.product
        ? {
            recurrenceEnabled: line.product.recurrenceEnabled,
            recurrenceInterval: line.product.recurrenceInterval,
            recurrenceUnit: line.product.recurrenceUnit,
          }
        : null;

      const nextRecommendedAt =
        policy && line.kind === "SERVICE"
          ? resolveNextRecommendedAt({ policy, performedAt: now, timezone })
          : null;

      const updated = await tx.appointmentLine.update({
        where: { id: line.id },
        data: {
          status: "PERFORMED",
          performedAt: now,
          customerId: line.customerId ?? appointment.customerId,
          nameSnapshot: name,
          unitPriceSnapshot: new Prisma.Decimal(unitPrice.toFixed(2)),
          totalSnapshot: new Prisma.Decimal((unitPrice * line.quantity).toFixed(2)),
          nextRecommendedAt,
        },
      });
      performed.push(updated);
    }

    return {
      changed: true,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      completedAt: now,
      performedLines: performed,
    };
  });
}

/**
 * Eventos de dominio del cierre. Se ejecuta SIEMPRE después del commit.
 *
 * Cada evento lleva su propia clave de idempotencia derivada de la cita o de la
 * línea, así que un reintento del proceso no vuelve a disparar automatizaciones
 * aunque la persistencia ya estuviera hecha.
 */
export async function emitCompletionEvents(input: {
  tenantId: string;
  customerId: string | null;
  appointment: Pick<
    Appointment,
    "id" | "scheduledAt" | "serviceOrProduct" | "agentId" | "conversationId" | "customerName"
  >;
  completedAt: Date;
  performedLines: AppointmentLine[];
  correlationId?: string | null;
}): Promise<void> {
  const { tenantId, customerId, appointment, completedAt, performedLines } = input;
  if (!customerId) return;

  // ── La visita ──
  // Reinicia las secuencias de seguimiento (15/30/60/90) del contacto y es el
  // disparador con el que la segmentación (Módulo 2) reevalúa frecuencia,
  // inactividad y riesgo. Este módulo NO clasifica: solo informa el hecho.
  await emitAutomationEvent({
    tenantId,
    type: "CUSTOMER_VISITED",
    source: "appointments",
    entityType: "CUSTOMER",
    entityId: customerId,
    customerId,
    payload: {
      appointmentId: appointment.id,
      visitedAt: completedAt.toISOString(),
      serviceOrProduct: appointment.serviceOrProduct,
      customerName: appointment.customerName,
      serviceIds: performedLines
        .filter((line) => line.kind === "SERVICE" && line.productId)
        .map((line) => line.productId as string),
      ...(appointment.agentId ? { agentId: appointment.agentId } : {}),
      ...(appointment.conversationId ? { conversationId: appointment.conversationId } : {}),
    },
    idempotencyKey: `customer-visited:appointment:${appointment.id}`,
    correlationId: appointment.id,
  });

  // ── Un evento por servicio realizado ──
  for (const line of performedLines) {
    if (line.kind !== "SERVICE" || !line.productId) continue;

    // La recurrencia se identifica por la PAREJA cliente+servicio: repetir la
    // coloración mueve el retoque de coloración y deja intacto el mantenimiento
    // de keratina de la misma clienta. Por eso `cancelByCustomer: false`.
    await emitAutomationEvent({
      tenantId,
      type: "SERVICE_USED",
      source: "appointments",
      entityType: "CUSTOMER",
      entityId: recurrenceEntityId(customerId, line.productId),
      customerId,
      payload: {
        appointmentId: appointment.id,
        lineId: line.id,
        serviceId: line.productId,
        serviceName: line.nameSnapshot,
        quantity: line.quantity,
        amount: toNumber(line.totalSnapshot),
        performedAt: completedAt.toISOString(),
        customerName: appointment.customerName,
        // Fecha que consumen las reglas de mantenimiento con la estrategia
        // RELATIVE_TO_FIELD. Va vacía cuando el servicio no tiene recurrencia
        // configurada, y entonces simplemente no se programa nada.
        ...(line.nextRecommendedAt
          ? { nextRecommendedAt: line.nextRecommendedAt.toISOString() }
          : {}),
        ...(appointment.conversationId ? { conversationId: appointment.conversationId } : {}),
      },
      idempotencyKey: `service-used:line:${line.id}`,
      correlationId: appointment.id,
      cancelByCustomer: false,
    });
  }

  // ── Productos VENDIDOS (nunca los usados internamente) ──
  for (const line of performedLines) {
    if (line.kind !== "PRODUCT_SOLD" || !line.productId) continue;
    await emitAutomationEvent({
      tenantId,
      type: "PRODUCT_PURCHASED",
      source: "appointments",
      entityType: "CUSTOMER",
      entityId: recurrenceEntityId(customerId, line.productId),
      customerId,
      payload: {
        appointmentId: appointment.id,
        lineId: line.id,
        productId: line.productId,
        productName: line.nameSnapshot,
        quantity: line.quantity,
        amount: toNumber(line.totalSnapshot),
        purchasedAt: completedAt.toISOString(),
        customerName: appointment.customerName,
        ...(line.nextRecommendedAt
          ? { nextRecommendedAt: line.nextRecommendedAt.toISOString() }
          : {}),
      },
      idempotencyKey: `product-purchased:line:${line.id}`,
      correlationId: appointment.id,
      cancelByCustomer: false,
    });
  }

  logger.info(
    `[APPOINTMENTS] cierre procesado tenant=${tenantId} appointment=${appointment.id} customer=${customerId} lineas=${performedLines.length}`
  );
}

/**
 * Deshace el cierre de una cita mal cerrada.
 *
 * Sin esto, un clic equivocado dejaría métricas fantasma para siempre. Al
 * reabrir:
 *  · las líneas vuelven a PLANNED y sueltan su `performedAt`/recurrencia;
 *  · las métricas del cliente se RECALCULAN enteras (nunca `visitCount--`);
 *  · los seguimientos que había programado esa visita se cancelan por el
 *    Automation Core, no borrando filas a mano.
 */
export async function persistReopen(
  tenantId: string,
  appointmentId: string,
  targetStatus: "CONFIRMED" | "PENDING"
): Promise<{ changed: boolean; customerId: string | null; serviceIds: string[] }> {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { id: true, customerId: true, status: true, completedAt: true },
    });
    if (!appointment) {
      throw AppError.fromCode("RESOURCE_NOT_FOUND", {
        internalMessage: `cita ${appointmentId} inexistente o de otro tenant (${tenantId})`,
      });
    }
    if (appointment.status !== "COMPLETED") {
      return { changed: false, customerId: appointment.customerId, serviceIds: [] };
    }

    const lines = await tx.appointmentLine.findMany({
      where: { tenantId, appointmentId: appointment.id, status: "PERFORMED" },
      select: { id: true, productId: true, kind: true },
    });

    const reopened = await tx.appointment.updateMany({
      where: { id: appointment.id, tenantId, status: "COMPLETED" },
      data: { status: targetStatus, completedAt: null },
    });
    if (reopened.count === 0) {
      return { changed: false, customerId: appointment.customerId, serviceIds: [] };
    }

    await tx.appointmentLine.updateMany({
      where: { tenantId, appointmentId: appointment.id },
      data: { status: "PLANNED", performedAt: null, nextRecommendedAt: null },
    });

    return {
      changed: true,
      customerId: appointment.customerId,
      serviceIds: lines
        .filter((line) => line.kind === "SERVICE" && line.productId)
        .map((line) => line.productId as string),
    };
  });
}

/** Zona horaria del negocio; el intervalo de recurrencia es comercial. */
export async function getTenantTimezone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  return tenant?.timezone || DEFAULT_TIMEZONE;
}
