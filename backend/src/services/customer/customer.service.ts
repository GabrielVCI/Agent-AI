/**
 * CustomerService — fuente de verdad del Maestro de Clientes (Módulo 1).
 *
 * TODA alta de cliente del producto entra por aquí (WhatsApp, llamadas, citas,
 * alta manual, importación). No existe una segunda ruta: conversation.service
 * reexporta `findOrCreateCustomer` desde este módulo para no duplicar lógica.
 *
 * Garantías:
 *  · Identidad canónica: teléfono normalizado a E.164 (utils/phone.ts).
 *  · Unicidad real: índice único (tenantId, phoneNormalized) en PostgreSQL.
 *    El find+create NO es la barrera contra duplicados — la carrera se resuelve
 *    capturando P2002 y releyendo la fila del ganador.
 *  · Aislamiento: cada consulta lleva tenantId; nunca se busca un cliente por
 *    id sin acotar el tenant.
 *  · Datos automáticos: política "solo rellenar vacíos". Un flujo automático
 *    jamás pisa un dato que escribió una persona.
 */
import { Prisma } from "@prisma/client";
import type { CustomerSource, CustomerStage } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../errors/AppError.js";
import { emitAutomationEvent } from "../automation/automation-events.service.js";
import { invalidateDashboardCache } from "../dashboard.service.js";
import {
  countryForTimezone,
  maskPhone,
  normalizePhone,
  phoneSearchVariants,
} from "../../utils/phone.js";
import {
  composeName,
  displayName,
  isPlaceholderName,
  splitFullName,
} from "./customer-names.js";
import {
  applyAutomationAssignment,
  ensureManualCategory,
  getCategoryBadgesFor,
  syncDomainCategories,
} from "./customer-category.service.js";
import { MAX_FILTER_CATEGORIES } from "./customer-category.types.js";
import {
  CUSTOMER_SORT_FIELDS,
  type CustomerCategoryBadge,
  type CustomerListFilters,
  type CustomerListItem,
  type CustomerProfile,
  type CustomerRow,
  type CustomerSortField,
  type CustomerWriteInput,
} from "./customer.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── País del tenant ─────────────────────────────────────────────────────────

/**
 * País telefónico por defecto del tenant. Sendwary todavía no tiene un campo
 * `country` en Tenant, así que se deriva de Tenant.timezone (que sí existe y
 * el negocio configura). Cache en memoria de 5 min: se consulta en cada
 * mensaje entrante de WhatsApp.
 */
const countryCache = new Map<string, { country: string; expiresAt: number }>();
const COUNTRY_TTL_MS = 5 * 60 * 1000;

export async function getTenantPhoneCountry(tenantId: string): Promise<string> {
  const cached = countryCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.country;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  const country = countryForTimezone(tenant?.timezone);
  countryCache.set(tenantId, { country, expiresAt: Date.now() + COUNTRY_TTL_MS });
  return country;
}

/** Solo para los tests: evita que un tenant recreado herede el país cacheado. */
export function clearTenantPhoneCountryCache(tenantId?: string): void {
  if (tenantId) countryCache.delete(tenantId);
  else countryCache.clear();
}

// ─── Serialización (DTOs) ────────────────────────────────────────────────────

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY_MS));
}

/** Teléfono legible para la UI: internacional si es canónico, si no el crudo. */
function phoneDisplayOf(customer: Pick<CustomerRow, "phone" | "phoneNormalized">): string {
  if (!customer.phoneNormalized) return customer.phone;
  const parsed = normalizePhone(customer.phoneNormalized);
  return parsed.formatted || customer.phoneNormalized;
}

/**
 * DTO del listado: SIN cédula, dirección, cumpleaños ni notas (§57/§58).
 *
 * `categories` llega vacío salvo que el llamante las resuelva (el listado y la
 * ficha lo hacen en UNA consulta, ver `attachCategories`): serializar no puede
 * disparar una query por fila.
 */
export function toListItem(
  customer: CustomerRow,
  categories: CustomerCategoryBadge[] = []
): CustomerListItem {
  return {
    id: customer.id,
    name: displayName(customer),
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    phoneNormalized: customer.phoneNormalized,
    phoneDisplay: phoneDisplayOf(customer),
    email: customer.email,
    stage: customer.stage,
    source: customer.source,
    tags: customer.tags,
    categories,
    isVip: customer.isVip,
    riskStatus: customer.riskStatus,
    firstVisitAt: customer.firstVisitAt,
    lastVisitAt: customer.lastVisitAt,
    visitCount: customer.visitCount,
    daysSinceLastVisit: daysSince(customer.lastVisitAt),
    lastActivityAt: customer.lastActivityAt,
    createdAt: customer.createdAt,
  };
}

/** DTO de la ficha: incluye los datos sensibles, solo en el perfil. */
export function toProfile(
  customer: CustomerRow,
  categories: CustomerCategoryBadge[] = []
): CustomerProfile {
  return {
    ...toListItem(customer, categories),
    documentId: customer.documentId,
    address: customer.address,
    // Date de PostgreSQL: se entrega como "AAAA-MM-DD" sin hora ni zona, para
    // que el navegador no lo desplace un día según el huso del visitante.
    birthDate: customer.birthDate ? customer.birthDate.toISOString().slice(0, 10) : null,
    notes: customer.notes,
    clientSince: customer.clientSince,
    vipSince: customer.vipSince,
    archivedAt: customer.archivedAt,
    updatedAt: customer.updatedAt,
  };
}

/**
 * Ficha con sus categorías resueltas. Se usa en todo lo que devuelve un perfil
 * (alta, edición, archivado, ficha) para que la UI no tenga que pedirlas aparte
 * y no pueda quedarse pintando insignias viejas tras un cambio.
 */
async function profileWithCategories(customer: CustomerRow): Promise<CustomerProfile> {
  const badges = await getCategoryBadgesFor(customer.tenantId, [customer.id]);
  return toProfile(customer, badges.get(customer.id) ?? []);
}

// ─── Acceso con aislamiento de tenant ────────────────────────────────────────

/**
 * Carga un cliente EXIGIENDO el tenant. Es el único punto de lectura por id:
 * conocer el UUID de un cliente de otro tenant no sirve de nada (404, no 403,
 * para no confirmar siquiera que ese id existe).
 */
export async function getOwnCustomer(tenantId: string, id: string): Promise<CustomerRow> {
  const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
  if (!customer) {
    throw new AppError("Cliente no encontrado", 404, { code: "RESOURCE_NOT_FOUND" });
  }
  return customer;
}

export async function getCustomerProfile(tenantId: string, id: string): Promise<CustomerProfile> {
  return profileWithCategories(await getOwnCustomer(tenantId, id));
}

// ─── Alta automática / deduplicación ─────────────────────────────────────────

export interface FindOrCreateCustomerInput {
  tenantId: string;
  phone: string;
  customerName?: string;
  /** Origen del alta; solo aplica si la fila se CREA. */
  source?: CustomerSource;
  /** Etapa inicial; solo aplica si la fila se CREA. Default CONTACT. */
  stage?: CustomerStage;
  email?: string | null;
}

/**
 * Busca o crea el contacto del tenant a partir de su teléfono.
 *
 * Etapa inicial CONTACT a propósito: alguien que escribe "Hola" por WhatsApp
 * queda registrado como contacto, NO como cliente. La promoción a CLIENT
 * ocurre en un momento de negocio explícito (cita confirmada, alta manual,
 * importación) vía promoteToClient().
 *
 * Emite CUSTOMER_CREATED al motor SOLO cuando la fila se creó de verdad, con
 * clave de idempotencia por id: un reintento del webhook no dispara dos veces.
 */
export async function findOrCreateCustomer(
  input: FindOrCreateCustomerInput
): Promise<CustomerRow> {
  const tenantId = input.tenantId;
  const rawPhone = input.phone.trim();
  if (!rawPhone) throw new AppError("El teléfono del contacto es obligatorio", 400);

  const country = await getTenantPhoneCountry(tenantId);
  const normalized = normalizePhone(rawPhone, country);
  const canonical = normalized.valid ? normalized.e164 : null;

  const existing = await findByPhone(tenantId, rawPhone, canonical);
  if (existing) {
    return applyAutomaticData(existing, {
      canonical,
      country: normalized.country,
      name: input.customerName,
      email: input.email ?? null,
    });
  }

  const { firstName, lastName } = splitFullName(input.customerName);

  try {
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        phone: rawPhone,
        phoneNormalized: canonical,
        phoneCountry: normalized.country,
        name: input.customerName?.trim() || composeName(firstName, lastName),
        firstName,
        lastName,
        email: input.email?.trim().toLowerCase() || null,
        stage: input.stage ?? "CONTACT",
        source: input.source ?? "WHATSAPP",
        clientSince: (input.stage ?? "CONTACT") === "CLIENT" ? new Date() : null,
      },
    });

    await emitCustomerCreated(customer);
    void invalidateDashboardCache(tenantId);
    return customer;
  } catch (error) {
    // Carrera real: otro proceso (webhook, cita, alta manual) ganó. La unique
    // constraint es la barrera; aquí solo se relee al ganador SIN emitir un
    // segundo CUSTOMER_CREATED.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await findByPhone(tenantId, rawPhone, canonical);
      if (winner) {
        logger.info(
          `[CUSTOMERS] carrera resuelta tenant=${tenantId} phone=${maskPhone(canonical ?? rawPhone)}`
        );
        return applyAutomaticData(winner, {
          canonical,
          country: normalized.country,
          name: input.customerName,
          email: input.email ?? null,
        });
      }
    }
    throw error;
  }
}

/** Alias explícito del contrato pedido: upsert por teléfono. */
export const upsertByPhone = findOrCreateCustomer;

/**
 * Busca por teléfono dentro del tenant: primero por la clave canónica y, si no
 * hay, por el texto exacto (contactos legados con teléfono no interpretable).
 */
export async function findByPhone(
  tenantId: string,
  rawPhone: string,
  canonical?: string | null
): Promise<CustomerRow | null> {
  const key =
    canonical === undefined
      ? normalizePhone(rawPhone, await getTenantPhoneCountry(tenantId)).e164
      : canonical;

  if (key) {
    const byCanonical = await prisma.customer.findUnique({
      where: { tenantId_phoneNormalized: { tenantId, phoneNormalized: key } },
    });
    if (byCanonical) return byCanonical;
  }

  const trimmed = rawPhone.trim();
  if (!trimmed) return null;
  return prisma.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: trimmed } },
  });
}

/**
 * Política de enriquecimiento automático (§68): un flujo automático SOLO
 * rellena huecos. Nunca sobrescribe un nombre, correo o etiqueta que el
 * negocio escribió a mano. La única excepción es el placeholder "Cliente",
 * que no es un dato: si llega un nombre real, lo reemplaza.
 */
async function applyAutomaticData(
  customer: CustomerRow,
  incoming: {
    canonical: string | null;
    country: string | null;
    name?: string | null;
    email?: string | null;
  }
): Promise<CustomerRow> {
  const data: Prisma.CustomerUpdateInput = {};

  // Backfill del canónico: contactos creados antes del Módulo 1.
  if (incoming.canonical && !customer.phoneNormalized) {
    data.phoneNormalized = incoming.canonical;
    data.phoneCountry = incoming.country;
  }

  const incomingName = incoming.name?.trim();
  if (incomingName && !isPlaceholderName(incomingName)) {
    if (isPlaceholderName(customer.name) && incomingName !== customer.name) {
      data.name = incomingName;
    }
    if (!customer.firstName) {
      const { firstName, lastName } = splitFullName(incomingName);
      if (firstName) data.firstName = firstName;
      if (lastName && !customer.lastName) data.lastName = lastName;
    }
  }

  const incomingEmail = incoming.email?.trim().toLowerCase();
  if (incomingEmail && !customer.email) data.email = incomingEmail;

  if (Object.keys(data).length === 0) return customer;

  try {
    return await prisma.customer.update({ where: { id: customer.id }, data });
  } catch (error) {
    // Otro proceso completó el mismo hueco con el mismo canónico: no es un
    // fallo del flujo de negocio, se sigue con la fila que ya teníamos.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return customer;
    }
    throw error;
  }
}

/** Evento de alta al motor (Módulo 0). Sin PII más allá del nombre. */
async function emitCustomerCreated(customer: CustomerRow): Promise<void> {
  await emitAutomationEvent({
    tenantId: customer.tenantId,
    type: "CUSTOMER_CREATED",
    source: "customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    customerId: customer.id,
    payload: {
      customerName: displayName(customer),
      phone: customer.phoneNormalized ?? customer.phone,
      stage: customer.stage,
      source: customer.source,
    },
    idempotencyKey: `customer-created:${customer.id}`,
  });
}

/**
 * Promueve un contacto a CLIENTE confirmado.
 *
 * Es el único punto donde un contacto pasa a cliente. Idempotente: si ya es
 * CLIENT no hace nada. Un cliente ARCHIVED no se "resucita" en silencio desde
 * un flujo automático — eso lo decide el negocio.
 */
export async function promoteToClient(
  tenantId: string,
  customerId: string,
  reason: string
): Promise<CustomerRow | null> {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!customer) return null;
  if (customer.stage !== "CONTACT") return customer;

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { stage: "CLIENT", clientSince: new Date() },
  });
  logger.info(`[CUSTOMERS] contacto promovido a cliente id=${customer.id} motivo=${reason}`);
  void invalidateDashboardCache(tenantId);
  return updated;
}

// ─── Métricas de visita (derivadas, nunca incrementales) ─────────────────────

/**
 * Recalcula firstVisitAt / lastVisitAt / visitCount desde la fuente de verdad.
 *
 * DEFINICIÓN DE VISITA (documentada en docs/CUSTOMER_MASTER.md):
 *   una visita = una cita con status COMPLETED.
 *   La fecha de la visita = Appointment.scheduledAt (el día que se atendió).
 *   NO cuentan: citas canceladas, no-show, pendientes ni mensajes de WhatsApp.
 *   Una cita = una visita, aunque incluya varios servicios (§37).
 *
 * Se RECALCULA entero con un aggregate en lugar de sumar +1, para que la
 * columna denormalizada no pueda quedar a la deriva si una cita cambia de
 * estado, se reasigna de contacto o entra por importación.
 */
export async function recalculateCustomerVisitStats(
  tenantId: string,
  customerId: string
): Promise<{ visitCount: number; firstVisitAt: Date | null; lastVisitAt: Date | null }> {
  const stats = await prisma.appointment.aggregate({
    where: { tenantId, customerId, status: "COMPLETED" },
    _count: { _all: true },
    _min: { scheduledAt: true },
    _max: { scheduledAt: true },
  });

  const result = {
    visitCount: stats._count._all,
    firstVisitAt: stats._min.scheduledAt ?? null,
    lastVisitAt: stats._max.scheduledAt ?? null,
  };

  await prisma.customer.updateMany({ where: { id: customerId, tenantId }, data: result });
  return result;
}

// ─── Listado ─────────────────────────────────────────────────────────────────

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function buildListWhere(
  tenantId: string,
  filters: CustomerListFilters
): Promise<Prisma.CustomerWhereInput> {
  const where: Prisma.CustomerWhereInput = { tenantId };
  const and: Prisma.CustomerWhereInput[] = [];

  if (filters.stage) {
    where.stage = filters.stage;
  } else if (!filters.includeArchived) {
    // El maestro muestra contactos y clientes; los archivados solo si se piden.
    where.stage = { not: "ARCHIVED" };
  }

  if (filters.isVip !== undefined) where.isVip = filters.isVip;
  if (filters.riskStatus) where.riskStatus = filters.riskStatus;
  if (filters.source) where.source = filters.source;
  if (filters.tag) where.tags = { has: filters.tag };

  // Filtro por categorías (Módulo 2). Se resuelve en PostgreSQL con EXISTS
  // sobre la tabla de asignaciones; nunca se traen clientes para filtrarlos en
  // el navegador, así que la paginación y el `total` siguen siendo reales.
  const categoryIds = [...new Set(filters.categoryIds ?? [])].slice(0, MAX_FILTER_CATEGORIES);
  if (categoryIds.length > 0) {
    if ((filters.categoryMatch ?? "all") === "any") {
      // ANY: pertenece a alguna de las seleccionadas.
      and.push({ categories: { some: { categoryId: { in: categoryIds } } } });
    } else {
      // ALL (por defecto): una condición por categoría, así que solo salen los
      // clientes que están en TODAS. "VIP + Coloración" no devuelve a quien
      // solo tiene VIP.
      for (const categoryId of categoryIds) {
        and.push({ categories: { some: { categoryId } } });
      }
    }
  }

  // Búsqueda: nombre, apellido, nombre para mostrar, email y teléfono. El
  // teléfono es TOLERANTE al formato: "8095555555" encuentra "+18095555555"
  // porque se buscan también las variantes canónicas del texto tecleado.
  const search = filters.search?.trim();
  if (search) {
    const country = await getTenantPhoneCountry(tenantId);
    const or: Prisma.CustomerWhereInput[] = [
      { name: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
    for (const variant of phoneSearchVariants(search, country)) {
      or.push({ phone: { contains: variant } });
      or.push({ phoneNormalized: { contains: variant } });
    }
    and.push({ OR: or });
  }

  // "Sin regresar": última visita anterior al corte. Los que nunca visitaron
  // NO entran aquí (tienen su propio filtro hasVisits=false): mezclarlos daría
  // un seguimiento a alguien que jamás vino.
  if (filters.inactiveDays && filters.inactiveDays > 0) {
    and.push({ lastVisitAt: { not: null, lte: new Date(Date.now() - filters.inactiveDays * DAY_MS) } });
  }

  if (filters.hasVisits === true) and.push({ lastVisitAt: { not: null } });
  if (filters.hasVisits === false) and.push({ lastVisitAt: null });

  const lastVisitFrom = parseDate(filters.lastVisitFrom);
  const lastVisitTo = parseDate(filters.lastVisitTo);
  if (lastVisitFrom || lastVisitTo) {
    and.push({
      lastVisitAt: {
        ...(lastVisitFrom ? { gte: lastVisitFrom } : {}),
        ...(lastVisitTo ? { lte: new Date(lastVisitTo.getTime() + DAY_MS - 1) } : {}),
      },
    });
  }

  const createdFrom = parseDate(filters.createdFrom);
  const createdTo = parseDate(filters.createdTo);
  if (createdFrom || createdTo) {
    and.push({
      createdAt: {
        ...(createdFrom ? { gte: createdFrom } : {}),
        ...(createdTo ? { lte: new Date(createdTo.getTime() + DAY_MS - 1) } : {}),
      },
    });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

function orderByFor(
  sortBy: CustomerSortField,
  sortOrder: "asc" | "desc"
): Prisma.CustomerOrderByWithRelationInput[] {
  // nulls last siempre: un cliente sin visitas no debe encabezar el orden por
  // "última visita" ni en asc ni en desc.
  if (sortBy === "lastVisitAt" || sortBy === "firstVisitAt") {
    return [{ [sortBy]: { sort: sortOrder, nulls: "last" } }, { createdAt: "desc" }];
  }
  if (sortBy === "name") {
    return [{ name: sortOrder }, { createdAt: "desc" }];
  }
  return [{ [sortBy]: sortOrder }, { id: "desc" }];
}

export async function listCustomers(tenantId: string, filters: CustomerListFilters) {
  const where = await buildListWhere(tenantId, filters);

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 20), 200);
  const sortBy = CUSTOMER_SORT_FIELDS.includes(filters.sortBy as CustomerSortField)
    ? (filters.sortBy as CustomerSortField)
    : "lastVisitAt";
  const sortOrder = filters.sortOrder === "asc" ? "asc" : "desc";

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: orderByFor(sortBy, sortOrder),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  // Insignias de TODA la página en una sola consulta (nada de N+1).
  const badges = await getCategoryBadgesFor(
    tenantId,
    rows.map((row) => row.id)
  );

  return {
    items: rows.map((row) => toListItem(row, badges.get(row.id) ?? [])),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    filters: {
      search: filters.search ?? null,
      stage: filters.stage ?? null,
      inactiveDays: filters.inactiveDays ?? null,
      categoryIds: filters.categoryIds ?? [],
      categoryMatch: filters.categoryMatch ?? "all",
      sortBy,
      sortOrder,
    },
  };
}

/** Etiquetas realmente en uso en el tenant (alimenta el filtro del listado). */
export async function listCustomerTags(tenantId: string): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: { tenantId, NOT: { tags: { isEmpty: true } } },
    select: { tags: true },
    take: 5000,
  });
  const unique = new Set<string>();
  for (const row of rows) for (const tag of row.tags) unique.add(tag);
  return [...unique].sort((a, b) => a.localeCompare(b, "es"));
}

/** Contadores del encabezado del maestro (sin traerse las filas). */
export async function getCustomerCounters(tenantId: string) {
  const notArchived: Prisma.CustomerWhereInput = { tenantId, stage: { not: "ARCHIVED" } };
  const [total, clients, contacts, vip, atRisk, withoutVisits] = await Promise.all([
    prisma.customer.count({ where: notArchived }),
    prisma.customer.count({ where: { tenantId, stage: "CLIENT" } }),
    prisma.customer.count({ where: { tenantId, stage: "CONTACT" } }),
    prisma.customer.count({ where: { ...notArchived, isVip: true } }),
    prisma.customer.count({ where: { ...notArchived, riskStatus: { in: ["MEDIUM", "HIGH"] } } }),
    prisma.customer.count({ where: { ...notArchived, lastVisitAt: null } }),
  ]);
  return { total, clients, contacts, vip, atRisk, withoutVisits };
}

// ─── Alta y edición manual ───────────────────────────────────────────────────

function normalizeBirthDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "AAAA-MM-DD" a medianoche UTC: la columna es DATE, no tiene hora ni zona.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new AppError("La fecha de nacimiento debe tener el formato AAAA-MM-DD", 400);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) throw new AppError("Fecha de nacimiento inválida", 400);
  if (date.getUTCDate() !== Number(match[3]) || date.getUTCMonth() !== Number(match[2]) - 1) {
    throw new AppError("Esa fecha de nacimiento no existe en el calendario", 400);
  }
  if (date.getTime() > Date.now()) {
    throw new AppError("La fecha de nacimiento no puede estar en el futuro", 400);
  }
  if (date.getUTCFullYear() < 1900) {
    throw new AppError("Revisa la fecha de nacimiento: el año parece incorrecto", 400);
  }
  return date;
}

function cleanTags(tags?: string[]): string[] | undefined {
  if (!tags) return undefined;
  const unique = new Set<string>();
  for (const tag of tags) {
    const value = tag.trim().slice(0, 40);
    if (value) unique.add(value);
  }
  return [...unique].slice(0, 20);
}

/** Error de duplicado que la UI sabe convertir en "ver cliente existente". */
function duplicateError(existing: CustomerRow): AppError {
  return new AppError("Ya existe un cliente con este número de teléfono.", 409, {
    code: "CONFLICT",
    details: {
      duplicate: true,
      customerId: existing.id,
      customerName: displayName(existing),
      phone: existing.phoneNormalized ?? existing.phone,
    },
  });
}

/**
 * Alta manual desde el panel. Exige nombre, apellido y teléfono con WhatsApp.
 * El teléfono se valida de verdad (no solo "tiene dígitos") y el duplicado
 * devuelve 409 con el id del cliente existente, no un 500.
 */
export async function createCustomer(
  tenantId: string,
  input: CustomerWriteInput,
  options: { source?: CustomerSource; stage?: CustomerStage } = {}
): Promise<CustomerProfile> {
  const country = await getTenantPhoneCountry(tenantId);
  const normalized = normalizePhone(input.phone, country);
  if (!normalized.valid || !normalized.e164) {
    throw new AppError(
      "El número de teléfono no parece válido. Escríbelo con su código de país (ej. +1 809 555 5555).",
      400,
      { code: "VALIDATION_ERROR", details: { field: "phone" } }
    );
  }

  const existing = await findByPhone(tenantId, input.phone, normalized.e164);
  if (existing) throw duplicateError(existing);

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  try {
    const customer = await prisma.customer.create({
      data: {
        tenantId,
        firstName,
        lastName,
        name: composeName(firstName, lastName),
        phone: normalized.e164,
        phoneNormalized: normalized.e164,
        phoneCountry: normalized.country,
        email: input.email?.trim().toLowerCase() || null,
        birthDate: normalizeBirthDate(input.birthDate),
        documentId: input.documentId?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        tags: cleanTags(input.tags) ?? [],
        isVip: input.isVip ?? false,
        vipSince: input.isVip ? new Date() : null,
        riskStatus: input.riskStatus ?? "NONE",
        stage: options.stage ?? "CLIENT",
        source: options.source ?? "MANUAL",
        clientSince: (options.stage ?? "CLIENT") === "CLIENT" ? new Date() : null,
      },
    });

    await emitCustomerCreated(customer);
    // La segmentación refleja el estado de la ficha: si nace VIP, nace con su
    // categoría VIP (Módulo 2). Nunca lanza hacia aquí.
    await syncDomainCategories(tenantId, customer.id, {
      isVip: customer.isVip,
      riskStatus: customer.riskStatus,
    });
    void invalidateDashboardCache(tenantId);
    logger.info(`[CUSTOMERS] alta manual tenant=${tenantId} id=${customer.id}`);
    return profileWithCategories(customer);
  } catch (error) {
    // Carrera con WhatsApp/citas: la constraint gana y devolvemos el duplicado
    // con su id para que la UI ofrezca abrir la ficha existente.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await findByPhone(tenantId, input.phone, normalized.e164);
      if (winner) throw duplicateError(winner);
    }
    throw error;
  }
}

/**
 * Edición manual. El teléfono también puede cambiar: se revalida, se
 * renormaliza y se comprueba que no colisione con otro cliente del tenant.
 */
export async function updateCustomer(
  tenantId: string,
  id: string,
  input: Partial<CustomerWriteInput>
): Promise<CustomerProfile> {
  const current = await getOwnCustomer(tenantId, id);
  const data: Prisma.CustomerUpdateInput = {};

  if (input.phone !== undefined) {
    const country = await getTenantPhoneCountry(tenantId);
    const normalized = normalizePhone(input.phone, country);
    if (!normalized.valid || !normalized.e164) {
      throw new AppError(
        "El número de teléfono no parece válido. Escríbelo con su código de país (ej. +1 809 555 5555).",
        400,
        { code: "VALIDATION_ERROR", details: { field: "phone" } }
      );
    }
    if (normalized.e164 !== current.phoneNormalized) {
      const other = await findByPhone(tenantId, input.phone, normalized.e164);
      if (other && other.id !== current.id) throw duplicateError(other);
      data.phone = normalized.e164;
      data.phoneNormalized = normalized.e164;
      data.phoneCountry = normalized.country;
    }
  }

  const firstName = input.firstName?.trim() ?? current.firstName;
  const lastName = input.lastName?.trim() ?? current.lastName;
  if (input.firstName !== undefined) data.firstName = firstName;
  if (input.lastName !== undefined) data.lastName = lastName;
  if (input.firstName !== undefined || input.lastName !== undefined) {
    data.name = composeName(firstName, lastName, current.name ?? undefined);
  }

  if (input.email !== undefined) data.email = input.email?.trim().toLowerCase() || null;
  if (input.birthDate !== undefined) data.birthDate = normalizeBirthDate(input.birthDate);
  if (input.documentId !== undefined) data.documentId = input.documentId?.trim() || null;
  if (input.address !== undefined) data.address = input.address?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.tags !== undefined) data.tags = cleanTags(input.tags) ?? [];
  if (input.riskStatus !== undefined) data.riskStatus = input.riskStatus;
  if (input.isVip !== undefined && input.isVip !== current.isVip) {
    data.isVip = input.isVip;
    data.vipSince = input.isVip ? current.vipSince ?? new Date() : null;
  }

  if (Object.keys(data).length === 0) return profileWithCategories(current);

  try {
    const updated = await prisma.customer.update({ where: { id: current.id }, data });

    // El nombre del contacto viaja denormalizado en la conversación: se
    // mantiene en sincronía como ya hace el inbox.
    if (data.name !== undefined) {
      await prisma.conversation.updateMany({
        where: { tenantId, customerId: current.id },
        data: { customerName: updated.name },
      });
    }

    // VIP y riesgo son estados de DOMINIO del cliente (Módulo 1) y esa es la
    // fuente de verdad; la segmentación los refleja. Al cambiarlos aquí se
    // alinea la categoría, así que nunca queda un `isVip = false` con la
    // insignia VIP puesta (§25/§26 del módulo).
    if (input.isVip !== undefined || input.riskStatus !== undefined) {
      await syncDomainCategories(tenantId, current.id, {
        isVip: updated.isVip,
        riskStatus: updated.riskStatus,
      });
    }

    void invalidateDashboardCache(tenantId);
    return profileWithCategories(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const other = await findByPhone(tenantId, input.phone ?? current.phone);
      if (other && other.id !== current.id) throw duplicateError(other);
    }
    throw error;
  }
}

/**
 * Archiva o restaura. NO existe borrado físico: de un cliente cuelgan
 * conversaciones, mensajes, citas, cotizaciones y jobs de automatización;
 * borrarlo destruiría historial real del negocio.
 */
export async function setCustomerArchived(
  tenantId: string,
  id: string,
  archived: boolean
): Promise<CustomerProfile> {
  const current = await getOwnCustomer(tenantId, id);
  if (archived === (current.stage === "ARCHIVED")) return profileWithCategories(current);

  const updated = await prisma.customer.update({
    where: { id: current.id },
    data: archived
      ? { stage: "ARCHIVED", archivedAt: new Date() }
      : { stage: current.clientSince ? "CLIENT" : "CONTACT", archivedAt: null },
  });
  void invalidateDashboardCache(tenantId);
  return profileWithCategories(updated);
}

/**
 * Añade etiquetas sin borrar las existentes (lo usa el motor de automatizaciones).
 *
 * Además crea/asigna la CATEGORÍA equivalente del Módulo 2. Es deliberado: una
 * etiqueta y su categoría deben ser la misma cosa, no dos sistemas de
 * clasificación conviviendo. `Customer.tags` se conserva porque lo escriben la
 * importación y este executor desde antes, pero el eje consultable (filtros,
 * conteos, segmentos) es la categoría.
 */
export async function addCustomerTags(
  tenantId: string,
  customerId: string,
  tags: string[]
): Promise<string[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true, tags: true },
  });
  if (!customer) return [];

  const incoming = cleanTags(tags) ?? [];
  for (const tag of incoming) {
    const category = await ensureManualCategory(tenantId, tag);
    if (category && category.status === "ACTIVE") {
      await applyAutomationAssignment(tenantId, customer.id, category.id, "assign", {
        reason: "etiqueta aplicada por una automatización",
      }).catch((error) => {
        // Una categoría de sistema con ese nombre no la mueve una regla: la
        // etiqueta se guarda igual y no se rompe la automatización.
        logger.warn(
          `[CUSTOMERS] etiqueta "${tag}" sin categoría tenant=${tenantId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
    }
  }

  const merged = cleanTags([...customer.tags, ...tags]) ?? customer.tags;
  if (merged.length === customer.tags.length && merged.every((t) => customer.tags.includes(t))) {
    return customer.tags;
  }
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { tags: merged },
    select: { tags: true },
  });
  return updated.tags;
}
