import type { Product, ProductAlias } from "@prisma/client";

export type ProductWithAliases = Product & {
  aliases: ProductAlias[];
};

export type ProductSearchStatus =
  | "FOUND"
  | "MULTIPLE_MATCHES"
  | "NOT_FOUND"
  | "NEEDS_CONFIRMATION";

export type ProductSearchResult = {
  status: ProductSearchStatus;
  originalText: string;
  normalizedText: string;
  confidence: number;
  correctionApplied?: string;
  product?: ProductWithAliases;
  suggestions?: ProductWithAliases[];
};