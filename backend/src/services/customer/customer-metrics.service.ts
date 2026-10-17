/**
 * Métricas e historial del cliente (Módulo 1).
 *
 * REGLA: ninguna cifra se inventa. Cada número declara su fuente y, cuando
 * Sendwary todavía no registra un dato, NO se sustituye por una aproximación.
 *
 * Fuentes reales disponibles hoy en el dominio:
 *   · Visitas .......... Appointment(status = COMPLETED)     → una cita = una visita
 *   · Citas ............ Appointment por customerId
 *   · Importe .......... Quote(status SENT | NEEDS_CONFIRMATION) → COTIZADO
 *   · Productos ........ QuoteLine de esas cotizaciones       → cotizados
 *   · Actividad ........ Conversation / Message
 *   · Automatizaciones . AutomationJob + ScheduledMessage
 *
 * IMPORTANTE — "total consumido": Sendwary NO tiene todavía módulo de ventas
 * ni de cobros (QuoteStatus solo llega hasta SENT/NEEDS_CONFIRMATION; no hay
 * ACCEPTED ni PAID). Por eso el maestro expone `totalQuoted` ("total
 * cotizado"), que sí tiene respaldo real, y NO un "total gastado" fabricado a
 * partir de cotizaciones que quizá nunca se cerraron. Cuando exista el módulo
 * de ventas, esta es la única función que hay que ampliar.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type {
  CustomerCommercialSummary,
  CustomerTimelineEntry,
  CustomerTimelineType,
} from "./customer.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cotizaciones que llegaron al cliente. DRAFT y CANCELLED no cuentan. */
const ISSUED_QUOTE_STATUSES = ["SENT", "NEEDS_CONFIRMATION"] as const;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Resumen comercial del cliente. Una sola tanda de consultas agregadas: nada
 * de N+1 recorriendo citas o cotizaciones en JavaScript.
 */
export async function getCustomerCommercialSummary(
  tenantId: string,
  customerId: string
): Promise<CustomerCommercialSummary> {
  const now = new Date();

  const [
    appointmentsByStatus,
    upcoming,
    completedAppointments,
    quotesAgg,
    quoteIds,
    conversations,
    customer,
  ] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: { tenantId, customerId },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: {
        tenantId,
        customerId,
        status: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
        scheduledAt: { gte: now },
      },
    }),
    prisma.appointment.findMany({
      where: { tenantId, customerId, status: "COMPLETED" },
      select: { id: true, serviceOrProduct: true, scheduledAt: true },
      orderBy: { scheduledAt: "desc" },
      take: 500,
    }),
    prisma.quote.aggregate({
      where: { tenantId, customerId, status: { in: [...ISSUED_QUOTE_STATUSES] } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.quote.findMany({
      where: { tenantId, customerId, status: { in: [...ISSUED_QUOTE_STATUSES] } },
      select: { id: true, currency: true },
      take: 500,
    }),
    prisma.conversation.findMany({
      where: { tenantId, customerId },
      select: { id: true },
    }),
    prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { visitCount: true, firstVisitAt: true, lastVisitAt: true },
    }),
  ]);

  const countFor = (status: string): number =>
    appointmentsByStatus.find((row) => row.status === status)?._count._all ?? 0;

  // ── Servicios realizados (Módulo 3) ──
  // Fuente: las LÍNEAS realizadas, que llevan el snapshot del nombre y del
  // precio del día. Las citas antiguas (anteriores al módulo, o cerradas sin
  // pasar por líneas) siguen contando por su `serviceOrProduct`, así que
  // ninguna ficha se queda vacía tras el despliegue.
  const performedLines = await prisma.appointmentLine.findMany({
    where: { tenantId, customerId, status: "PERFORMED" },
    select: {
      kind: true,
      productId: true,
      nameSnapshot: true,
      quantity: true,
      totalSnapshot: true,
      performedAt: true,
      appointmentId: true,
    },
    orderBy: { performedAt: "desc" },
    take: 1000,
  });

  const serviceMap = new Map<string, { name: string; count: number; lastAt: Date }>();
  const addService = (name: string, at: Date, count = 1) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    const current = serviceMap.get(key);
    if (current) {
      current.count += count;
      if (at > current.lastAt) current.lastAt = at;
    } else {
      serviceMap.set(key, { name: name.trim(), count, lastAt: at });
    }
  };

  const appointmentsWithLines = new Set(performedLines.map((line) => line.appointmentId));
  for (const line of performedLines) {
    if (line.kind !== "SERVICE") continue;
    addService(line.nameSnapshot, line.performedAt ?? now, line.quantity);
  }
  for (const appointment of completedAppointments) {
    // Solo las citas que NO tienen líneas: si las tiene, ya están contadas y
    // duplicarlas inflaría el historial.
    if (appointmentsWithLines.has(appointment.id)) continue;
    addService(appointment.serviceOrProduct, appointment.scheduledAt);
  }

  // ── Productos ──
  // VENDIDOS en una visita (PRODUCT_SOLD) con su importe real del día. El uso
  // interno (PRODUCT_USED) queda fuera a propósito: el tinte que gastó el salón
  // no es una compra de la clienta y contarlo sería inventarle un gasto.
  const productMap = new Map<string, { id: string; name: string; quantity: number; amount: number }>();
  for (const line of performedLines) {
    if (line.kind !== "PRODUCT_SOLD") continue;
    const key = line.productId ?? line.nameSnapshot.toLowerCase();
    const current = productMap.get(key);
    const amount = toNumber(line.totalSnapshot);
    if (current) {
      current.quantity += line.quantity;
      current.amount += amount;
    } else {
      productMap.set(key, {
        id: line.productId ?? line.nameSnapshot,
        name: line.nameSnapshot,
        quantity: line.quantity,
        amount,
      });
    }
  }

  // Valor de lo REALIZADO según el catálogo del día. NO es dinero cobrado:
  // Sendwary todavía no tiene pagos de cliente final, así que no existe un
  // `totalSpent` y no se inventa uno. La UI lo etiqueta como "valor de lo
  // realizado", no como "total pagado".
  const servicedLines = performedLines.filter((line) => line.kind !== "PRODUCT_USED");
  const totalServiced = servicedLines.reduce(
    (sum, line) => sum + toNumber(line.totalSnapshot),
    0
  );
  const visitsWithValue = new Set(
    servicedLines.filter((line) => toNumber(line.totalSnapshot) > 0).map((l) => l.appointmentId)
  ).size;

  const conversationIds = conversations.map((c) => c.id);
  const messages = conversationIds.length
    ? await prisma.message.count({ where: { tenantId, conversationId: { in: conversationIds } } })
    : 0;

  const issued = quotesAgg._count._all;
  const totalQuoted = toNumber(quotesAgg._sum.total);

  return {
    visitCount: customer?.visitCount ?? 0,
    firstVisitAt: customer?.firstVisitAt ?? null,
    lastVisitAt: customer?.lastVisitAt ?? null,
    daysSinceLastVisit: customer?.lastVisitAt
      ? Math.max(0, Math.floor((Date.now() - customer.lastVisitAt.getTime()) / DAY_MS))
      : null,
    appointments: {
      total: appointmentsByStatus.reduce((sum, row) => sum + row._count._all, 0),
      completed: countFor("COMPLETED"),
      cancelled: countFor("CANCELLED"),
      noShow: countFor("NO_SHOW"),
      upcoming,
    },
    quotes: {
      issued,
      totalQuoted,
      // Promedio POR COTIZACIÓN EMITIDA (definición documentada): no se divide
      // entre visitas porque cotizar y visitar son hechos distintos.
      averageQuoted: issued > 0 ? Number((totalQuoted / issued).toFixed(2)) : 0,
      currency: quoteIds[0]?.currency ?? "DOP",
    },
    services: [...serviceMap.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    products: [...productMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 20),
    serviced: {
      /**
       * Valor de los servicios y productos REALIZADOS, con el precio que tenía
       * el catálogo el día de cada visita. NO es dinero cobrado: Sendwary no
       * registra pagos de cliente final todavía.
       */
      total: Number(totalServiced.toFixed(2)),
      /** Promedio por visita CON valor (las visitas sin importe no diluyen). */
      averagePerVisit:
        visitsWithValue > 0 ? Number((totalServiced / visitsWithValue).toFixed(2)) : 0,
      visitsWithValue,
      currency: quoteIds[0]?.currency ?? "DOP",
    },
    conversations: conversations.length,
    messages,
  };
}

// ─── Timeline ────────────────────────────────────────────────────────────────

const APPOINTMENT_TITLES: Record<string, string> = {
  PENDING: "Cita solicitada",
  CONFIRMED: "Cita confirmada",
  RESCHEDULED: "Cita pospuesta",
  CANCELLED: "Cita cancelada",
  NO_SHOW: "No asistió a la cita",
  COMPLETED: "Visita completada",
};

/**
 * Historial unificado y PAGINADO del cliente.
 *
 * No se copia nada a una tabla "timeline": las entradas se derivan de las
 * fuentes reales y se mezclan por fecha. Para servir la página [offset,
 * offset+limit) basta con pedir offset+limit a cada fuente, así que la
 * memoria está acotada aunque el cliente tenga años de historia.
 */
export async function getCustomerTimeline(
  tenantId: string,
  customerId: string,
  options: { page?: number; limit?: number; types?: CustomerTimelineType[] } = {}
): Promise<{
  items: CustomerTimelineEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(1, options.limit ?? 20), 50);
  const offset = (page - 1) * limit;
  // Techo defensivo: nadie pagina 500 entradas hacia atrás en una ficha.
  const window = Math.min(offset + limit, 500);

  const wanted = (type: CustomerTimelineType): boolean =>
    !options.types || options.types.length === 0 || options.types.includes(type);

  const [appointments, quotes, conversations, scheduled, counts] = await Promise.all([
    wanted("APPOINTMENT")
      ? prisma.appointment.findMany({
          where: { tenantId, customerId },
          orderBy: { scheduledAt: "desc" },
          take: window,
          select: {
            id: true,
            scheduledAt: true,
            serviceOrProduct: true,
            status: true,
            source: true,
            agent: { select: { id: true, name: true } },
          },
        })
      : [],
    wanted("QUOTE")
      ? prisma.quote.findMany({
          where: { tenantId, customerId },
          orderBy: { createdAt: "desc" },
          take: window,
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            total: true,
            currency: true,
            createdAt: true,
          },
        })
      : [],
    wanted("CONVERSATION")
      ? prisma.conversation.findMany({
          where: { tenantId, customerId },
          orderBy: { createdAt: "desc" },
          take: window,
          select: {
            id: true,
            createdAt: true,
            channel: true,
            status: true,
            lastMessagePreview: true,
          },
        })
      : [],
    wanted("AUTOMATION")
      ? prisma.scheduledMessage.findMany({
          where: { tenantId, customerId },
          orderBy: { scheduledFor: "desc" },
          take: window,
          select: {
            id: true,
            scheduledFor: true,
            sentAt: true,
            status: true,
            channel: true,
            templateKey: true,
          },
        })
      : [],
    Promise.all([
      wanted("APPOINTMENT") ? prisma.appointment.count({ where: { tenantId, customerId } }) : 0,
      wanted("QUOTE") ? prisma.quote.count({ where: { tenantId, customerId } }) : 0,
      wanted("CONVERSATION") ? prisma.conversation.count({ where: { tenantId, customerId } }) : 0,
      wanted("AUTOMATION") ? prisma.scheduledMessage.count({ where: { tenantId, customerId } }) : 0,
    ]),
  ]);

  const entries: CustomerTimelineEntry[] = [];

  for (const a of appointments) {
    entries.push({
      id: `appointment:${a.id}`,
      type: "APPOINTMENT",
      occurredAt: a.scheduledAt,
      title: APPOINTMENT_TITLES[a.status] ?? "Cita",
      summary: a.serviceOrProduct,
      referenceId: a.id,
      metadata: {
        status: a.status,
        source: a.source,
        agentName: a.agent?.name ?? null,
      },
    });
  }

  for (const q of quotes) {
    entries.push({
      id: `quote:${q.id}`,
      type: "QUOTE",
      occurredAt: q.createdAt,
      title: `Cotización ${q.quoteNumber}`,
      summary: `${q.currency} ${toNumber(q.total).toLocaleString("es-DO", {
        minimumFractionDigits: 2,
      })}`,
      referenceId: q.id,
      metadata: { status: q.status, total: toNumber(q.total), currency: q.currency },
    });
  }

  for (const c of conversations) {
    entries.push({
      id: `conversation:${c.id}`,
      type: "CONVERSATION",
      occurredAt: c.createdAt,
      title: `Conversación por ${c.channel === "WHATSAPP" ? "WhatsApp" : c.channel.toLowerCase()}`,
      summary: c.lastMessagePreview,
      referenceId: c.id,
      metadata: { status: c.status, channel: c.channel },
    });
  }

  for (const s of scheduled) {
    entries.push({
      id: `scheduled:${s.id}`,
      type: "AUTOMATION",
      occurredAt: s.sentAt ?? s.scheduledFor,
      title: s.sentAt ? "Mensaje automático enviado" : "Mensaje automático programado",
      // El destino y el contenido NO se exponen aquí: el outbox solo guarda a
      // dónde va, y repetirlo en la ficha no aporta y multiplica la PII.
      summary: s.templateKey ? `Automatización: ${s.templateKey}` : null,
      referenceId: s.id,
      metadata: { status: s.status, channel: s.channel },
    });
  }

  entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const total = counts.reduce<number>((sum, value) => sum + value, 0);
  return {
    items: entries.slice(offset, offset + limit),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Citas del cliente, paginadas (pestaña "Citas" de la ficha). */
export async function getCustomerAppointments(
  tenantId: string,
  customerId: string,
  options: { page?: number; limit?: number } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(1, options.limit ?? 20), 100);

  const where: Prisma.AppointmentWhereInput = { tenantId, customerId };
  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        scheduledAt: true,
        serviceOrProduct: true,
        status: true,
        confirmationStatus: true,
        priority: true,
        source: true,
        notes: true,
        conversationId: true,
        agent: { select: { id: true, name: true } },
        catalogItem: { select: { id: true, name: true } },
      },
    }),
    prisma.appointment.count({ where }),
  ]);

  return { items: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
