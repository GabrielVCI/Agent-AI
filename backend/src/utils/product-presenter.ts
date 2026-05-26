import type { ProductWithAliases } from "../types/product-search.types.js";

export function presentProduct(product: ProductWithAliases) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    unit: product.unit,
    price: Number(product.price.toString()),
    stock: product.stock,
    imageUrl: product.imageUrl
  };
}