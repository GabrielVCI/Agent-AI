/**
 * Fixtures de recursos con dueño (tenant) para las pruebas de aislamiento.
 *
 * Complementa `factories.ts`, que crea empresas y usuarios. Aquí vive lo que
 * cuelga de una empresa y que un usuario de OTRA empresa jamás debería poder
 * leer ni modificar: agentes, clientes, conversaciones, ítems de catálogo
 * (productos y servicios), citas e integraciones de WhatsApp.
 *
 * Reglas (las mismas de factories.ts):
 *   · Todo lleva el prefijo `__http_test__` y un sufijo aleatorio.
 *   · Nada lee ni modifica datos preexistentes.
 *   · El borrado se apoya en los `onDelete: Cascade` hacia Tenant: al borrar
 *     el tenant de prueba cae todo esto con él. `cleanupTestData()` sigue
 *     siendo el único punto de limpieza.
 *
 * Se crean con Prisma y no por HTTP a propósito: la prueba de aislamiento debe
 * partir de datos que existen SEGURO, sin depender de que el endpoint de alta
 * funcione. Si el alta se rompiera, la prueba de aislamiento debe seguir
 * diciendo la verdad.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../../src/config/prisma.js";
import { PREFIX } from "./factories.js";

function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/** Teléfono E.164 único y claramente falso (rango de ejemplo de la NANP). */
function fakePhone(): string {
  const n = Math.floor(1_000_000 + Math.random() * 8_999_999).toString().slice(0, 7);
  return `+1809555${n.slice(0, 4)}`;
}

export type TenantResources = {
  tenantId: string;
  agentId: string;
  customerId: string;
  conversationId: string;
  serviceId: string;
  productId: string;
  appointmentId: string;
  whatsappIntegrationId: string;
  planName: string;
};

export async function createTestAgent(tenantId: string, label: string): Promise<string> {
  const agent = await prisma.agent.create({
    data: {
      tenantId,
      name: `${PREFIX}agent-${label}-${uniqueSuffix()}`,
      type: "SALES",
      status: "ACTIVE",
    },
  });
  return agent.id;
}

export async function createTestCustomer(tenantId: string, label: string): Promise<string> {
  const phone = fakePhone();
  const customer = await prisma.customer.create({
    data: {
      tenantId,
      name: `${PREFIX}customer-${label}-${uniqueSuffix()}`,
      firstName: `${PREFIX}${label}`,
      lastName: "Prueba",
      phone,
      phoneNormalized: phone,
      phoneCountry: "DO",
      stage: "CLIENT",
      source: "MANUAL",
    },
  });
  return customer.id;
}

export async function createTestConversation(
  tenantId: string,
  customerId: string,
  agentId: string
): Promise<string> {
  const conversation = await prisma.conversation.create({
    data: {
      tenantId,
      customerId,
      agentId,
      channel: "WHATSAPP",
      status: "OPEN",
      customerName: `${PREFIX}conv-${uniqueSuffix()}`,
      whatsappPhone: fakePhone(),
      lastMessageAt: new Date(),
    },
  });
  return conversation.id;
}

/** Ítem de catálogo. `itemType: "SERVICE"` es lo que el producto llama servicio. */
export async function createTestCatalogItem(
  tenantId: string,
  label: string,
  itemType: "PRODUCT" | "SERVICE" = "SERVICE"
): Promise<string> {
  const item = await prisma.product.create({
    data: {
      tenantId,
      name: `${PREFIX}${itemType.toLowerCase()}-${label}-${uniqueSuffix()}`,
      sku: `${PREFIX}sku-${uniqueSuffix()}`,
      itemType,
      price: 100,
      unit: itemType === "SERVICE" ? "servicio" : "unidad",
      stock: itemType === "SERVICE" ? null : 10,
      isActive: true,
    },
  });
  return item.id;
}

export async function createTestAppointment(
  tenantId: string,
  params: { customerId: string; catalogItemId: string; label: string }
): Promise<string> {
  const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      customerId: params.customerId,
      catalogItemId: params.catalogItemId,
      customerName: `${PREFIX}appt-${params.label}-${uniqueSuffix()}`,
      customerPhone: fakePhone(),
      serviceOrProduct: `${PREFIX}servicio`,
      scheduledAt: inAWeek,
      status: "PENDING",
      source: "MANUAL",
    },
  });
  return appointment.id;
}

/**
 * Integración de WhatsApp en estado DRAFT. Sin token real: `accessTokenEncrypted`
 * queda null, así que ninguna prueba puede intentar hablar con Meta.
 */
export async function createTestWhatsAppIntegration(
  tenantId: string,
  label: string
): Promise<string> {
  const integration = await prisma.whatsAppIntegration.create({
    data: {
      tenantId,
      provider: "META_CLOUD",
      mode: "MANUAL_CLOUD_API",
      status: "DRAFT",
      businessName: `${PREFIX}waba-${label}-${uniqueSuffix()}`,
      phoneNumberId: `${PREFIX}pnid-${uniqueSuffix()}`,
      displayPhoneNumber: fakePhone(),
      verifyToken: `${PREFIX}verify-${uniqueSuffix()}`,
    },
  });
  return integration.id;
}

/**
 * Empresa completa y aislable: un recurso de cada tipo, todos suyos.
 * `label` acaba dentro de los nombres, así que la prueba puede afirmar
 * "el nombre que veo es el MÍO" y no solo "veo algo".
 */
export async function createTenantResources(
  tenantId: string,
  label: string
): Promise<Omit<TenantResources, "planName">> {
  const agentId = await createTestAgent(tenantId, label);
  const customerId = await createTestCustomer(tenantId, label);
  const conversationId = await createTestConversation(tenantId, customerId, agentId);
  const serviceId = await createTestCatalogItem(tenantId, label, "SERVICE");
  const productId = await createTestCatalogItem(tenantId, label, "PRODUCT");
  const appointmentId = await createTestAppointment(tenantId, {
    customerId,
    catalogItemId: serviceId,
    label,
  });
  const whatsappIntegrationId = await createTestWhatsAppIntegration(tenantId, label);

  return {
    tenantId,
    agentId,
    customerId,
    conversationId,
    serviceId,
    productId,
    appointmentId,
    whatsappIntegrationId,
  };
}
