import { searchProductForTenant } from "../product.service.js";
import { searchKnowledge } from "../knowledge.service.js";
import {
  getAppointmentSettings,
  describeAvailability,
  type AppointmentSettings,
} from "../appointment.service.js";
import { logger } from "../../config/logger.js";
import type { ProductWithAliases } from "../../types/product-search.types.js";

/**
 * Recuperación de contexto para el runtime IA (pre-retrieval simple, sin
 * embeddings): antes de llamar al modelo se buscan datos REALES del negocio
 * (catálogo, documentos, disponibilidad) y se inyectan al prompt como bloque
 * de "datos verificados". Así el modelo responde con información de la BD y
 * las reglas anti-invención tienen una fuente concreta que citar.
 */

function formatCatalogLine(product: ProductWithAliases): string {
  const price = Number(product.price.toString());
  const taxRate = Number(product.taxRate.toString());
  const isService = product.itemType === "SERVICE";

  const priceText = `RD$${price.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`;
  const taxText =
    taxRate > 0
      ? product.priceIncludesTax
        ? " (ITBIS incluido)"
        : ` + ITBIS ${Math.round(taxRate * 10000) / 100}%`
      : "";

  let availabilityText: string;
  if (isService) {
    availabilityText = "servicio (sin inventario)";
  } else if (product.stock === null || product.stock === 0) {
    availabilityText = "disponibilidad debe confirmarse con un asesor";
  } else {
    availabilityText = `${product.stock} ${product.unit} disponibles`;
  }

  const parts = [
    `${product.name} [${isService ? "SERVICIO" : "PRODUCTO"}]`,
    `precio: ${priceText}${taxText}`,
    availabilityText,
  ];
  if (product.category) parts.push(`categoría: ${product.category}`);
  if (product.description) parts.push(product.description.slice(0, 120));

  return `- ${parts.join(" | ")}`;
}

/** Top de coincidencias del catálogo para el mensaje actual (máx. 4 líneas). */
async function buildCatalogBlock(tenantId: string, message: string): Promise<string> {
  try {
    const result = await searchProductForTenant(message, tenantId);
    const products: ProductWithAliases[] = [];

    if (result.product) products.push(result.product);
    for (const s of result.suggestions ?? []) {
      if (!products.some((p) => p.id === s.id)) products.push(s);
    }

    if (products.length === 0) return "";

    return `CATÁLOGO — coincidencias verificadas para este mensaje:\n${products
      .slice(0, 4)
      .map(formatCatalogLine)
      .join("\n")}`;
  } catch (err) {
    logger.warn(`[RUNTIME] búsqueda de catálogo falló: ${String(err)}`);
    return "";
  }
}

async function buildKnowledgeBlock(
  tenantId: string,
  agentId: string | null,
  message: string
): Promise<string> {
  try {
    const excerpts = await searchKnowledge(tenantId, agentId, message);
    if (excerpts.length === 0) return "";
    return `DOCUMENTOS DEL NEGOCIO — extractos relevantes:\n${excerpts
      .map((e) => `[${e.title}]\n${e.excerpt}`)
      .join("\n---\n")}`;
  } catch (err) {
    logger.warn(`[RUNTIME] búsqueda de conocimiento falló: ${String(err)}`);
    return "";
  }
}

export interface RuntimeContext {
  extraContext: string;
  appointmentSettings: AppointmentSettings;
}

/**
 * Construye el bloque de contexto verificado que se anexa al system prompt.
 * Cualquier fuente que falle se omite: el agente sigue funcionando con menos
 * contexto en lugar de romperse.
 */
export async function buildRuntimeContext(input: {
  tenantId: string;
  agentId: string | null;
  customerMessage: string;
}): Promise<RuntimeContext> {
  const [catalogBlock, knowledgeBlock, appointmentSettings] = await Promise.all([
    buildCatalogBlock(input.tenantId, input.customerMessage),
    buildKnowledgeBlock(input.tenantId, input.agentId, input.customerMessage),
    getAppointmentSettings(input.tenantId).catch(
      () => null as unknown as AppointmentSettings
    ),
  ]);

  const availabilityBlock = appointmentSettings
    ? `DISPONIBILIDAD PARA CITAS:\n${describeAvailability(appointmentSettings)}`
    : "";

  const sections = [catalogBlock, knowledgeBlock, availabilityBlock].filter(Boolean);

  const extraContext = sections.length
    ? [
        "=== DATOS VERIFICADOS DEL NEGOCIO (única fuente válida para precios, stock, políticas y horarios) ===",
        sections.join("\n\n"),
        "Cuando el precio, ITBIS o la disponibilidad de un ítem aparezcan arriba, cítalos DIRECTAMENTE en tu respuesta (no hagas al cliente pedir una cotización solo para saber el precio).",
        "Si lo que pregunta el cliente NO aparece aquí ni en el contexto del negocio, dilo con honestidad y ofrece consultarlo con un asesor. NUNCA completes con datos supuestos.",
        "=== FIN DE DATOS VERIFICADOS ===",
      ].join("\n\n")
    : "";

  return { extraContext, appointmentSettings };
}
