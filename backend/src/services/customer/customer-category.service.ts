/**
 * CustomerCategoryService — servicio central del Módulo 2 (segmentación).
 *
 * TODA escritura de categorías y pertenencias pasa por aquí: controllers,
 * executors del Automation Core, importación y scripts. No hay una segunda
 * ruta ni lógica repartida por los controllers.
 *
 * Garantías:
 *  · Aislamiento: cada consulta lleva `tenantId`. Antes de asignar se comprueba
 *    que CLIENTE y CATEGORÍA pertenecen al MISMO tenant autenticado; conocer el
 *    id de una categoría ajena devuelve 404, no una asignación cruzada.
 *  · Unicidad: (tenantId, slug). "VIP", " vip " y "Vip" son la misma categoría
 *    dentro de un tenant; dos tenants distintos pueden tener ambos "vip".
 *  · Idempotencia: asignar dos veces deja UNA pertenencia y no lanza error. La
 *    barrera real es el índice único (customerId, categoryId) de PostgreSQL —
 *    el "buscar y crear" solo evita el trabajo, no la carrera.
 *  · Sin motor propio: la segmentación automática se configura como cualquier
 *    otra AutomationRule (Módulo 0) y se ejecuta con los executors
 *    ASSIGN_CUSTOMER_CATEGORY / REMOVE_CUSTOMER_CATEGORY.
 */
import { Prisma } from "@prisma/client";
import type {
  CustomerCategoryAssignmentSource,
  CustomerCategoryStatus,
  CustomerCategoryType,
} from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../errors/AppError.js";
import { emitAutomationEvent } from "../automation/automation-events.service.js";
import { invalidateDashboardCache } from "../dashboard.service.js";
import {
  categorySlug as slugOf,
  cleanCategoryDescription as cleanDescription,
  cleanCategoryName,
} from "./customer-category-names.js";
import {
  CATEGORY_NAME_MAX,
  MAX_ACTIVE_CATEGORIES_PER_TENANT,
  MAX_BULK_CUSTOMERS,
  SYSTEM_CATEGORY_DEFINITIONS,
  SYSTEM_CATEGORY_KEYS,
  isCategoryColor,
  type AssignmentContext,
  type CustomerCategoryAssignmentDTO,
  type CustomerCategoryBadge,
  type CustomerCategoryDTO,
  type CustomerCategoryListFilters,
  type CustomerCategoryRow,
  type CustomerCategoryWriteInput,
  type SystemCategoryKey,
} from "./customer-category.types.js";

// ─── Normalización y unicidad ────────────────────────────────────────────────

// La regla de normalización vive en un módulo puro (`customer-category-names`)
// para poder testearla sin base de datos; aquí solo se le añade el error de
// validación de cara al usuario.
export { categorySlug } from "./customer-category-names.js";

/** Nombre saneado que además EXIGE un mínimo utilizable. */
function cleanName(raw: string): string {
  const value = cleanCategoryName(raw);
  if (value.length < 2) {
    throw new AppError("El nombre de la categoría debe tener al menos 2 caracteres.", 400, {
      code: "VALIDATION_ERROR",
      details: { field: "name" },
    });
  }
  return value;
}

function cleanColor(raw: string | undefined, fallback = "purple"): string {
  return isCategoryColor(raw) ? raw : fallback;
}

// ─── Serialización ───────────────────────────────────────────────────────────

/**
 * Qué gestiona la pertenencia cuando la categoría es automática. La UI lo usa
 * para explicar por qué no se puede asignar a mano, en vez de dar un error seco.
 */
function managedByOf(category: CustomerCategoryRow): string | null {
  if (category.type !== "AUTOMATIC") return null;
  if (category.isSystem && category.systemKey) {
    const definition = SYSTEM_CATEGORY_DEFINITIONS[category.systemKey as SystemCategoryKey];
    if (definition) return definition.derivedFrom;
  }
  return "automation";
}

export function toCategoryDTO(
  category: CustomerCategoryRow,
  customerCount = 0
): CustomerCategoryDTO {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    type: category.type,
    status: category.status,
    color: category.color,
    isSystem: category.isSystem,
    managedBy: managedByOf(category),
    customerCount,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * Categoría del tenant o 404. Nunca se busca por id sin acotar el tenant: es
 * lo que convierte un id filtrado en "no existe" en lugar de en una fuga.
 */
export async function getOwnCategory(
  tenantId: string,
  id: string
): Promise<CustomerCategoryRow> {
  const category = await prisma.customerCategory.findFirst({ where: { id, tenantId } });
  if (!category) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `categoría ${id} inexistente o de otro tenant (${tenantId})`,
    });
  }
  return category;
}

/**
 * Listado de categorías con el número REAL de clientes en cada una.
 *
 * El conteo lo hace PostgreSQL (`_count`), no JavaScript: cargar las
 * asignaciones para contarlas se caería con el primer tenant que tenga miles
 * de clientes.
 */
export async function listCategories(
  tenantId: string,
  filters: CustomerCategoryListFilters = {}
): Promise<CustomerCategoryDTO[]> {
  await ensureSystemCategories(tenantId);

  const where: Prisma.CustomerCategoryWhereInput = { tenantId };
  if (filters.status) where.status = filters.status;
  else if (!filters.includeArchived) where.status = "ACTIVE";
  if (filters.type) where.type = filters.type;

  const search = filters.search?.trim();
  if (search) where.name = { contains: search, mode: "insensitive" };

  const rows = await prisma.customerCategory.findMany({
    where,
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { assignments: true } } },
  });

  return rows.map((row) => toCategoryDTO(row, row._count.assignments));
}

/** Una categoría con su conteo (ficha de categoría). */
export async function getCategory(
  tenantId: string,
  id: string
): Promise<CustomerCategoryDTO> {
  await getOwnCategory(tenantId, id);
  const row = await prisma.customerCategory.findFirstOrThrow({
    where: { id, tenantId },
    include: { _count: { select: { assignments: true } } },
  });
  return toCategoryDTO(row, row._count.assignments);
}

// ─── Escritura de categorías ─────────────────────────────────────────────────

function duplicateCategoryError(existing: CustomerCategoryRow): AppError {
  return new AppError(`Ya tienes una categoría llamada "${existing.name}".`, 409, {
    code: "CONFLICT",
    details: { duplicate: true, categoryId: existing.id, status: existing.status },
  });
}

/**
 * Crea una categoría MANUAL del tenant.
 *
 * No se pueden crear categorías AUTOMATIC desde la API: una categoría
 * automática sin nada que la mantenga sería una insignia muerta (§79). Las
 * automáticas nacen o bien de sistema (`ensureSystemCategories`) o bien de una
 * regla del Automation Core que las promueve.
 */
export async function createCategory(
  tenantId: string,
  input: CustomerCategoryWriteInput,
  userId?: string | null
): Promise<CustomerCategoryDTO> {
  const name = cleanName(input.name);
  const slug = slugOf(name);
  if (!slug) {
    throw new AppError("Ese nombre de categoría no es válido.", 400, {
      code: "VALIDATION_ERROR",
      details: { field: "name" },
    });
  }

  const existing = await prisma.customerCategory.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
  if (existing) throw duplicateCategoryError(existing);

  const activeCount = await prisma.customerCategory.count({
    where: { tenantId, status: "ACTIVE" },
  });
  if (activeCount >= MAX_ACTIVE_CATEGORIES_PER_TENANT) {
    throw new AppError(
      `Llegaste al máximo de ${MAX_ACTIVE_CATEGORIES_PER_TENANT} categorías activas. Archiva alguna para crear una nueva.`,
      400,
      { code: "VALIDATION_ERROR" }
    );
  }

  try {
    const category = await prisma.customerCategory.create({
      data: {
        tenantId,
        name,
        slug,
        description: cleanDescription(input.description),
        color: cleanColor(input.color),
        type: "MANUAL",
        status: "ACTIVE",
        createdByUserId: userId ?? null,
      },
    });
    logger.info(`[CATEGORIES] alta tenant=${tenantId} id=${category.id} slug=${slug}`);
    return toCategoryDTO(category, 0);
  } catch (error) {
    // Carrera entre dos pestañas: gana la constraint y devolvemos el duplicado.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.customerCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (winner) throw duplicateCategoryError(winner);
    }
    throw error;
  }
}

/**
 * Edición. El TIPO nunca se cambia por API (una manual llena de asignaciones
 * hechas a mano no puede convertirse en automática sin decidir qué pasa con
 * ellas) y las categorías de sistema conservan su slug: son la proyección de
 * un campo del Customer y otros módulos las resuelven por `systemKey`.
 */
export async function updateCategory(
  tenantId: string,
  id: string,
  input: Partial<CustomerCategoryWriteInput>
): Promise<CustomerCategoryDTO> {
  const current = await getOwnCategory(tenantId, id);
  const data: Prisma.CustomerCategoryUpdateInput = {};

  if (input.name !== undefined) {
    const name = cleanName(input.name);
    const slug = slugOf(name);
    if (!slug) {
      throw new AppError("Ese nombre de categoría no es válido.", 400, {
        code: "VALIDATION_ERROR",
        details: { field: "name" },
      });
    }
    if (slug !== current.slug) {
      const other = await prisma.customerCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (other && other.id !== current.id) throw duplicateCategoryError(other);
      // El slug de una categoría de sistema es su contrato con el resto del
      // producto: se puede renombrar la insignia, no la clave.
      if (!current.isSystem) data.slug = slug;
    }
    data.name = name;
  }

  if (input.description !== undefined) data.description = cleanDescription(input.description);
  if (input.color !== undefined) data.color = cleanColor(input.color, current.color);

  if (Object.keys(data).length === 0) return getCategory(tenantId, id);

  try {
    const updated = await prisma.customerCategory.update({ where: { id: current.id }, data });
    return getCategory(tenantId, updated.id);
  } catch (error) {
    // Carrera: otra pestaña se quedó con ese nombre entre la comprobación y el
    // update. Gana la constraint y se devuelve el 409 con el dueño real.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const slug = typeof data.slug === "string" ? data.slug : current.slug;
      const other = await prisma.customerCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (other && other.id !== current.id) throw duplicateCategoryError(other);
    }
    throw error;
  }
}

/**
 * Archiva (o restaura) una categoría. NO hay borrado físico de una categoría
 * que ya estuvo asignada: destruiría el historial de segmentación del negocio.
 *
 * Política del archivado (§38):
 *  · deja de ofrecerse para nuevas asignaciones;
 *  · las pertenencias existentes SE CONSERVAN — un cliente no pierde su
 *    historial porque el negocio deje de usar una categoría;
 *  · deja de mostrarse en el listado y en las insignias por defecto.
 *
 * Las categorías de sistema no se archivan: son la proyección de un campo de
 * la ficha que siempre existe, así que archivarlas dejaría al panel diciendo
 * una cosa y a la ficha otra.
 */
export async function setCategoryArchived(
  tenantId: string,
  id: string,
  archived: boolean
): Promise<CustomerCategoryDTO> {
  const current = await getOwnCategory(tenantId, id);

  if (current.isSystem) {
    throw new AppError(
      `"${current.name}" la mantiene Sendwary a partir de la ficha del cliente, así que no puede archivarse.`,
      409,
      { code: "CONFLICT", details: { isSystem: true } }
    );
  }

  const target: CustomerCategoryStatus = archived ? "ARCHIVED" : "ACTIVE";
  if (current.status === target) return getCategory(tenantId, id);

  await prisma.customerCategory.update({
    where: { id: current.id },
    data: { status: target },
  });
  logger.info(
    `[CATEGORIES] ${archived ? "archivada" : "restaurada"} tenant=${tenantId} id=${current.id}`
  );
  return getCategory(tenantId, current.id);
}

// ─── Categorías de sistema ───────────────────────────────────────────────────

/**
 * Tenants a los que ya se les aseguraron las categorías de sistema en este
 * proceso. Evita repetir dos upserts en cada listado sin añadir Redis para algo
 * que es idempotente por definición (mismo patrón que el caché de país del
 * Maestro de Clientes).
 */
const ensuredTenants = new Set<string>();

/** Solo para los tests: un tenant recreado no hereda el "ya asegurado". */
export function clearSystemCategoryCache(tenantId?: string): void {
  if (tenantId) ensuredTenants.delete(tenantId);
  else ensuredTenants.clear();
}

/**
 * Crea (una sola vez, idempotente) las categorías de sistema del tenant.
 *
 * Solo se provisionan las que tienen una fuente de verdad REAL en el Módulo 1:
 * VIP (`Customer.isVip`) y Riesgo de abandono (`Customer.riskStatus`).
 * "Nuevo", "Frecuente" e "Inactivo" NO se crean: Sendwary todavía no ha
 * definido sus umbrales y una insignia sin criterio sería una implementación
 * falsa. Cuando el negocio los defina se crean como reglas del Automation Core
 * sin tocar este código.
 *
 * No modifica nada de los tenants existentes salvo añadir las dos filas.
 */
export async function ensureSystemCategories(tenantId: string): Promise<void> {
  if (ensuredTenants.has(tenantId)) return;

  for (const key of SYSTEM_CATEGORY_KEYS) {
    const definition = SYSTEM_CATEGORY_DEFINITIONS[key];
    const slug = slugOf(definition.name);
    try {
      await prisma.customerCategory.upsert({
        where: { tenantId_systemKey: { tenantId, systemKey: key } },
        update: {},
        create: {
          tenantId,
          name: definition.name,
          slug,
          description: definition.description,
          color: definition.color,
          type: "AUTOMATIC",
          status: "ACTIVE",
          isSystem: true,
          systemKey: key,
        },
      });
    } catch (error) {
      // El tenant ya tenía una categoría MANUAL llamada "VIP" (muy probable
      // tras el backfill de etiquetas): se ADOPTA esa fila como la de sistema
      // en vez de crear una segunda "VIP" — que es justo el duplicado que este
      // módulo debe evitar. Sus asignaciones manuales se conservan.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await prisma.customerCategory.updateMany({
          where: { tenantId, slug, systemKey: null },
          data: {
            type: "AUTOMATIC",
            status: "ACTIVE",
            isSystem: true,
            systemKey: key,
            description: definition.description,
          },
        });
      } else {
        throw error;
      }
    }
  }

  ensuredTenants.add(tenantId);
}

async function getSystemCategoryId(
  tenantId: string,
  key: SystemCategoryKey
): Promise<string | null> {
  await ensureSystemCategories(tenantId);
  const row = await prisma.customerCategory.findUnique({
    where: { tenantId_systemKey: { tenantId, systemKey: key } },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Sincroniza las categorías de sistema con el estado de dominio del cliente.
 *
 * DECISIÓN (§25/§26): la fuente de verdad de VIP y del riesgo de abandono
 * siguen siendo `Customer.isVip` y `Customer.riskStatus` (Módulo 1). La
 * segmentación los REFLEJA; nunca al revés. Por eso no puede existir un
 * cliente con `isVip = false` y la insignia VIP puesta: cada vez que el campo
 * cambia, esta función alinea la pertenencia.
 *
 * Se llama desde `createCustomer` y `updateCustomer`, y desde el backfill.
 */
export async function syncDomainCategories(
  tenantId: string,
  customerId: string,
  state?: { isVip?: boolean; riskStatus?: string }
): Promise<void> {
  try {
    const customer =
      state?.isVip !== undefined && state?.riskStatus !== undefined
        ? { isVip: state.isVip, riskStatus: state.riskStatus }
        : await prisma.customer.findFirst({
            where: { id: customerId, tenantId },
            select: { isVip: true, riskStatus: true },
          });
    if (!customer) return;

    const desired: { key: SystemCategoryKey; active: boolean; reason: string }[] = [
      { key: "VIP", active: customer.isVip === true, reason: "estado VIP de la ficha" },
      {
        key: "CHURN_RISK",
        active: customer.riskStatus === "MEDIUM" || customer.riskStatus === "HIGH",
        reason: "riesgo de abandono de la ficha",
      },
    ];

    for (const item of desired) {
      const categoryId = await getSystemCategoryId(tenantId, item.key);
      if (!categoryId) continue;
      if (item.active) {
        await applyAssignment(tenantId, customerId, categoryId, {
          source: "SYSTEM",
          reason: item.reason,
        });
      } else {
        await applyRemoval(tenantId, customerId, categoryId, { source: "SYSTEM" });
      }
    }
  } catch (error) {
    // La segmentación NUNCA puede tumbar el alta o la edición de un cliente.
    logger.error(
      `[CATEGORIES] sync de dominio falló tenant=${tenantId} customer=${customerId} error=${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Pertenencias ────────────────────────────────────────────────────────────

/** Cliente del tenant o 404 (misma regla que en el Maestro de Clientes). */
export async function assertOwnCustomer(tenantId: string, customerId: string): Promise<string> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });
  if (!customer) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `cliente ${customerId} inexistente o de otro tenant (${tenantId})`,
    });
  }
  return customer.id;
}

/**
 * Asignación en crudo, SIN comprobar el tipo de la categoría.
 *
 * Es la que usan el sistema y los executors del Automation Core (que sí pueden
 * tocar categorías automáticas). La ruta de usuario es `assignCategory`, que
 * añade la política de "las automáticas no se editan a mano".
 *
 * Idempotente: si la pertenencia ya existe no crea otra, no lanza y NO emite
 * evento. Esa ausencia de evento es lo que corta cualquier realimentación
 * entre reglas de categorías (§54).
 */
async function applyAssignment(
  tenantId: string,
  customerId: string,
  categoryId: string,
  context: AssignmentContext = {}
): Promise<{ changed: boolean }> {
  try {
    await prisma.customerCategoryAssignment.create({
      data: {
        tenantId,
        customerId,
        categoryId,
        source: (context.source ?? "MANUAL") as CustomerCategoryAssignmentSource,
        reason: context.reason?.slice(0, 200) ?? null,
        assignedByUserId: context.userId ?? null,
      },
    });
  } catch (error) {
    // P2002 = ya estaba asignada (doble clic, retry del worker, dos reglas que
    // asignan lo mismo). Es el resultado esperado, no un fallo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { changed: false };
    }
    throw error;
  }

  await emitCategoryEvent("CUSTOMER_CATEGORY_ASSIGNED", tenantId, customerId, categoryId, context);
  void invalidateDashboardCache(tenantId);
  return { changed: true };
}

/** Baja en crudo. Idempotente y sin evento si no había nada que quitar. */
async function applyRemoval(
  tenantId: string,
  customerId: string,
  categoryId: string,
  context: AssignmentContext = {}
): Promise<{ changed: boolean }> {
  const result = await prisma.customerCategoryAssignment.deleteMany({
    where: { tenantId, customerId, categoryId },
  });
  if (result.count === 0) return { changed: false };

  await emitCategoryEvent("CUSTOMER_CATEGORY_REMOVED", tenantId, customerId, categoryId, context);
  void invalidateDashboardCache(tenantId);
  return { changed: true };
}

/**
 * Evento de segmentación para el Automation Core.
 *
 * El payload lleva `categoryIds` (todas las categorías activas del cliente
 * DESPUÉS del cambio) además de la categoría afectada: con eso el evaluador de
 * condiciones que ya existe resuelve "el cliente tiene la categoría X" con
 *   { "field": "categoryIds", "op": "contains", "value": "<id>" }
 * sin necesidad de parsear nombres ni de un evaluador nuevo (§53).
 */
async function emitCategoryEvent(
  type: "CUSTOMER_CATEGORY_ASSIGNED" | "CUSTOMER_CATEGORY_REMOVED",
  tenantId: string,
  customerId: string,
  categoryId: string,
  context: AssignmentContext
): Promise<void> {
  const [category, current] = await Promise.all([
    prisma.customerCategory.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true, name: true, slug: true, type: true },
    }),
    prisma.customerCategoryAssignment.findMany({
      where: { tenantId, customerId },
      select: { categoryId: true, category: { select: { slug: true } } },
    }),
  ]);

  await emitAutomationEvent({
    tenantId,
    type,
    source: "customer-categories",
    entityType: "CUSTOMER",
    entityId: customerId,
    customerId,
    payload: {
      categoryId,
      categoryName: category?.name ?? null,
      categorySlug: category?.slug ?? null,
      categoryType: category?.type ?? null,
      assignmentSource: context.source ?? "MANUAL",
      categoryIds: current.map((row) => row.categoryId),
      categorySlugs: current.map((row) => row.category.slug),
    },
    correlationId: context.correlationId ?? undefined,
    causationId: context.causationId ?? undefined,
  });
}

/**
 * Asignación pedida por una PERSONA (panel/API).
 *
 * Comprueba que cliente y categoría son del MISMO tenant autenticado antes de
 * escribir: no basta con buscar la categoría por tenant y aceptar cualquier
 * customerId que llegue en la URL (§49).
 */
export async function assignCategory(
  tenantId: string,
  customerId: string,
  categoryId: string,
  context: AssignmentContext = {}
): Promise<CustomerCategoryAssignmentDTO[]> {
  await assertOwnCustomer(tenantId, customerId);
  const category = await getOwnCategory(tenantId, categoryId);

  assertManuallyEditable(category);

  if (category.status !== "ACTIVE") {
    throw new AppError(
      `"${category.name}" está archivada. Restáurala para volver a usarla.`,
      409,
      { code: "CONFLICT", details: { archived: true } }
    );
  }

  await applyAssignment(tenantId, customerId, categoryId, {
    ...context,
    source: context.source ?? "MANUAL",
  });
  return getCustomerCategories(tenantId, customerId);
}

/** Baja pedida por una persona. Misma política y mismas comprobaciones. */
export async function removeCategory(
  tenantId: string,
  customerId: string,
  categoryId: string,
  context: AssignmentContext = {}
): Promise<CustomerCategoryAssignmentDTO[]> {
  await assertOwnCustomer(tenantId, customerId);
  const category = await getOwnCategory(tenantId, categoryId);

  assertManuallyEditable(category);

  await applyRemoval(tenantId, customerId, categoryId, {
    ...context,
    source: context.source ?? "MANUAL",
  });
  return getCustomerCategories(tenantId, customerId);
}

/**
 * Política de edición manual de una categoría AUTOMÁTICA (§23): se IMPIDE.
 *
 * Quitar a mano una categoría cuya condición sigue siendo cierta la devolvería
 * en la siguiente evaluación, así que el usuario vería la insignia "volver
 * sola" y perdería la confianza en el panel. Se explica el motivo y se le
 * indica dónde está el interruptor real (la ficha o la automatización). No se
 * construye un sistema de excepciones porque hoy nadie lo ha pedido.
 */
function assertManuallyEditable(category: CustomerCategoryRow): void {
  if (category.type !== "AUTOMATIC") return;

  const managedBy = managedByOf(category);
  const hint =
    managedBy === "Customer.isVip"
      ? "Se activa y desactiva con el botón VIP de la ficha del cliente."
      : managedBy === "Customer.riskStatus"
        ? "Cambia sola con el riesgo de abandono que fijes en la ficha del cliente."
        : "La gestiona una automatización; edítala desde sus reglas.";

  throw new AppError(`"${category.name}" es una categoría automática. ${hint}`, 409, {
    code: "CONFLICT",
    details: { automatic: true, managedBy },
  });
}

/** Categorías de un cliente, con su origen. Incluye las archivadas (§38). */
export async function getCustomerCategories(
  tenantId: string,
  customerId: string
): Promise<CustomerCategoryAssignmentDTO[]> {
  const rows = await prisma.customerCategoryAssignment.findMany({
    where: { tenantId, customerId },
    orderBy: { assignedAt: "asc" },
    include: {
      category: {
        select: { id: true, name: true, slug: true, color: true, type: true, status: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.category.id,
    name: row.category.name,
    slug: row.category.slug,
    color: row.category.color,
    type: row.category.type,
    status: row.category.status,
    source: row.source,
    reason: row.reason,
    assignedAt: row.assignedAt,
  }));
}

/**
 * Insignias de VARIOS clientes en UNA consulta.
 *
 * El listado del maestro la usa para no hacer N+1: una query por página, no
 * una por fila.
 */
export async function getCategoryBadgesFor(
  tenantId: string,
  customerIds: string[]
): Promise<Map<string, CustomerCategoryBadge[]>> {
  const result = new Map<string, CustomerCategoryBadge[]>();
  if (customerIds.length === 0) return result;

  const rows = await prisma.customerCategoryAssignment.findMany({
    where: { tenantId, customerId: { in: customerIds }, category: { status: "ACTIVE" } },
    orderBy: { assignedAt: "asc" },
    select: {
      customerId: true,
      category: { select: { id: true, name: true, color: true, type: true } },
    },
  });

  for (const row of rows) {
    const list = result.get(row.customerId) ?? [];
    list.push(row.category);
    result.set(row.customerId, list);
  }
  return result;
}

// ─── Operaciones masivas ─────────────────────────────────────────────────────

/**
 * Asigna o quita una categoría MANUAL a varios clientes de una vez.
 *
 * Acotada (`MAX_BULK_CUSTOMERS`), idempotente y con una sola consulta para
 * validar la pertenencia al tenant: los ids que no sean del tenant se ignoran
 * en silencio (no se confirma su existencia) y se reportan como omitidos.
 */
export async function bulkAssignCategory(
  tenantId: string,
  categoryId: string,
  customerIds: string[],
  action: "assign" | "remove",
  context: AssignmentContext = {}
): Promise<{ requested: number; applied: number; skipped: number; alreadyDone: number }> {
  const unique = [...new Set(customerIds)].slice(0, MAX_BULK_CUSTOMERS);
  const category = await getOwnCategory(tenantId, categoryId);
  assertManuallyEditable(category);

  if (action === "assign" && category.status !== "ACTIVE") {
    throw new AppError(
      `"${category.name}" está archivada. Restáurala para volver a usarla.`,
      409,
      { code: "CONFLICT", details: { archived: true } }
    );
  }

  const owned = await prisma.customer.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true },
  });
  const ownedIds = owned.map((row) => row.id);

  let applied = 0;
  let alreadyDone = 0;
  for (const customerId of ownedIds) {
    const result =
      action === "assign"
        ? await applyAssignment(tenantId, customerId, categoryId, {
            ...context,
            source: context.source ?? "MANUAL",
          })
        : await applyRemoval(tenantId, customerId, categoryId, {
            ...context,
            source: context.source ?? "MANUAL",
          });
    if (result.changed) applied += 1;
    else alreadyDone += 1;
  }

  return {
    requested: unique.length,
    applied,
    skipped: unique.length - ownedIds.length,
    alreadyDone,
  };
}

// ─── Puentes con otros módulos ───────────────────────────────────────────────

/**
 * Devuelve (creando si hace falta) la categoría MANUAL del tenant con ese
 * nombre. Es el puente para las etiquetas de texto libre: el executor
 * UPDATE_CUSTOMER_TAG y el backfill de `Customer.tags` la usan para que una
 * etiqueta y su categoría sean SIEMPRE la misma cosa, no dos sistemas.
 *
 * Devuelve null si el nombre no da un slug utilizable (etiqueta basura) o si el
 * tenant llegó a su tope de categorías: nunca lanza, porque la usan flujos
 * automáticos que no deben romperse por esto.
 */
export async function ensureManualCategory(
  tenantId: string,
  rawName: string
): Promise<CustomerCategoryRow | null> {
  const name = rawName.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, CATEGORY_NAME_MAX);
  const slug = slugOf(name);
  if (name.length < 2 || !slug) return null;

  const existing = await prisma.customerCategory.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
  if (existing) return existing;

  const activeCount = await prisma.customerCategory.count({
    where: { tenantId, status: "ACTIVE" },
  });
  if (activeCount >= MAX_ACTIVE_CATEGORIES_PER_TENANT) {
    logger.warn(`[CATEGORIES] tope de categorías alcanzado tenant=${tenantId}, "${name}" omitida`);
    return null;
  }

  try {
    return await prisma.customerCategory.create({
      data: { tenantId, name, slug, type: "MANUAL", status: "ACTIVE", color: "purple" },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.customerCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
    }
    throw error;
  }
}

/**
 * Asignación desde el Automation Core.
 *
 * A diferencia de `assignCategory`, SÍ puede tocar categorías automáticas —
 * son justamente las que gestiona el motor— pero nunca las de sistema, cuya
 * fuente de verdad es un campo de la ficha (dejar que una regla las moviera
 * crearía los estados contradictorios que el módulo debe evitar).
 */
export async function applyAutomationAssignment(
  tenantId: string,
  customerId: string,
  categoryId: string,
  action: "assign" | "remove",
  context: AssignmentContext = {}
): Promise<{ changed: boolean; category: CustomerCategoryRow }> {
  const category = await prisma.customerCategory.findFirst({
    where: { id: categoryId, tenantId },
  });
  if (!category) {
    throw AppError.fromCode("RESOURCE_NOT_FOUND", {
      internalMessage: `automatización: categoría ${categoryId} no es del tenant ${tenantId}`,
    });
  }
  if (category.isSystem) {
    throw new AppError(
      `"${category.name}" la mantiene Sendwary desde la ficha del cliente y no puede moverla una automatización.`,
      409,
      { code: "CONFLICT", details: { isSystem: true } }
    );
  }

  const ctx: AssignmentContext = { ...context, source: "AUTOMATION" };
  const result =
    action === "assign"
      ? await applyAssignment(tenantId, customerId, categoryId, ctx)
      : await applyRemoval(tenantId, customerId, categoryId, ctx);

  return { changed: result.changed, category };
}

/**
 * Recalcula qué categorías del tenant son AUTOMÁTICAS.
 *
 * Una categoría es automática cuando hay una AutomationRule VIVA que la asigna
 * o la quita. Se deriva del estado real de las reglas en vez de marcarse a mano
 * porque así el panel nunca puede mostrar una insignia "Automática" que no
 * tenga nada detrás manteniéndola (§79) ni una "Manual" que en realidad mueva
 * una regla a espaldas del usuario.
 *
 * La llama la API de automatizaciones tras crear, editar o archivar una regla.
 * Es idempotente y no toca las categorías de sistema.
 */
export async function syncCategoryManagement(tenantId: string): Promise<void> {
  const rules = await prisma.automationRule.findMany({
    where: {
      tenantId,
      status: { not: "ARCHIVED" },
      actionType: { in: ["ASSIGN_CUSTOMER_CATEGORY", "REMOVE_CUSTOMER_CATEGORY"] },
    },
    select: { actionConfigJson: true },
  });

  const managedIds = new Set<string>();
  for (const rule of rules) {
    const config = rule.actionConfigJson as { categoryId?: unknown } | null;
    if (config && typeof config.categoryId === "string") managedIds.add(config.categoryId);
  }

  const ids = [...managedIds];
  const promote: Prisma.CustomerCategoryWhereInput = {
    tenantId,
    isSystem: false,
    type: "MANUAL",
    id: { in: ids },
  };
  const demote: Prisma.CustomerCategoryWhereInput = {
    tenantId,
    isSystem: false,
    type: "AUTOMATIC",
    ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
  };

  if (ids.length > 0) {
    await prisma.customerCategory.updateMany({
      where: promote,
      data: { type: "AUTOMATIC" satisfies CustomerCategoryType },
    });
  }
  await prisma.customerCategory.updateMany({
    where: demote,
    data: { type: "MANUAL" satisfies CustomerCategoryType },
  });
}
