import type { ProductWithAliases } from "../types/product-search.types.js";

export function presentProduct(product: ProductWithAliases) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    unit: product.unit,
    type: product.itemType,
    price: Number(product.price.toString()),
    taxRate: Number(product.taxRate.toString()) * 100,
    priceIncludesTax: product.priceIncludesTax,
    stock: product.stock,
    imageUrl: product.imageUrl
  };
}

function formatDOP(value: number): string {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * Respuesta determinística del agente cuando encuentra un ítem del catálogo.
 * Reglas: no inventar precios/stock, ITBIS explícito solo si aplica, los
 * servicios no hablan de existencia, y stock 0/desconocido escala a un asesor.
 */
export function formatCatalogItemReply(product: ProductWithAliases): string {
  const price = Number(product.price.toString());
  const taxRate = Number(product.taxRate.toString());
  const isService = product.itemType === "SERVICE";

  let priceLine = `Precio: ${formatDOP(price)}`;
  if (taxRate > 0) {
    priceLine += product.priceIncludesTax
      ? " (ITBIS incluido)"
      : ` + ITBIS (${Math.round(taxRate * 10000) / 100}%)`;
  }

  const lines = [`Sí, ${isService ? "ofrecemos" : "tenemos"} ${product.name}.`, "", priceLine];

  if (!isService) {
    if (product.stock === null || product.stock === 0) {
      lines.push(
        "Disponibilidad: debo confirmarla con un asesor antes de asegurarte la entrega."
      );
    } else {
      lines.push(`Disponibilidad: ${product.stock} ${product.unit}.`);
    }
  }

  lines.push("", "¿Deseas que te lo agregue a una cotización?");
  return lines.join("\n");
}
