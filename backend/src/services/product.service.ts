import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { applyProductCorrections } from "../utils/product-corrections.js";
import {
  normalizeText,
  removeCommonNoise,
  tokenize,
} from "../utils/text-normalizer.js";
import type {
  ProductSearchResult,
  ProductWithAliases,
} from "../types/product-search.types.js";

export async function listProducts(tenantId: string) {
  return prisma.product.findMany({
    where: { tenantId, isActive: true },
    include: { aliases: true },
    orderBy: { name: "asc" },
  });
}

export async function searchProductForTenant(
  query: string,
  tenantId: string
): Promise<ProductSearchResult> {
  const cleanedQuery = query.trim();

  if (!cleanedQuery) {
    return { status: "NOT_FOUND", originalText: query, normalizedText: "", confidence: 0 };
  }

  const correction = applyProductCorrections(cleanedQuery);
  const normalizedQuery = correction.normalizedText;

  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    include: { aliases: true },
  });

  const scoredProducts = products
    .map((product) => ({ product, score: scoreProductMatch(product, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredProducts.length === 0) {
    return {
      status: "NOT_FOUND",
      originalText: cleanedQuery,
      normalizedText: normalizedQuery,
      confidence: 0,
      correctionApplied: correction.correctionApplied,
    };
  }

  const best = scoredProducts[0];
  const second = scoredProducts[1];

  if (!best) {
    return { status: "NOT_FOUND", originalText: cleanedQuery, normalizedText: normalizedQuery, confidence: 0 };
  }

  const confidence = Math.min(best.score, 1);

  if (confidence >= 0.85) {
    return {
      status: "FOUND",
      originalText: cleanedQuery,
      normalizedText: normalizedQuery,
      confidence,
      correctionApplied: correction.correctionApplied,
      product: best.product,
    };
  }

  if (second && Math.abs(best.score - second.score) < 0.15) {
    return {
      status: "MULTIPLE_MATCHES",
      originalText: cleanedQuery,
      normalizedText: normalizedQuery,
      confidence,
      correctionApplied: correction.correctionApplied,
      suggestions: scoredProducts.slice(0, 5).map((item) => item.product),
    };
  }

  if (confidence >= 0.55) {
    return {
      status: "NEEDS_CONFIRMATION",
      originalText: cleanedQuery,
      normalizedText: normalizedQuery,
      confidence,
      correctionApplied: correction.correctionApplied,
      product: best.product,
      suggestions: scoredProducts.slice(0, 3).map((item) => item.product),
    };
  }

  return {
    status: "NOT_FOUND",
    originalText: cleanedQuery,
    normalizedText: normalizedQuery,
    confidence,
    correctionApplied: correction.correctionApplied,
    suggestions: scoredProducts.slice(0, 3).map((item) => item.product),
  };
}

// Legacy alias for backward compatibility within this module
export const searchProduct = searchProductForTenant;

function scoreProductMatch(
  product: ProductWithAliases,
  normalizedQuery: string
): number {
  const query = removeCommonNoise(normalizedQuery);
  const productName = removeCommonNoise(product.name);
  const productCategory = product.category ? removeCommonNoise(product.category) : "";
  const productBrand = product.brand ? removeCommonNoise(product.brand) : "";
  const productDescription = product.description ? removeCommonNoise(product.description) : "";
  const aliases = product.aliases.map((a) => removeCommonNoise(a.alias));

  let score = 0;

  if (productName === query) score = Math.max(score, 1);
  for (const alias of aliases) {
    if (alias === query) score = Math.max(score, 0.98);
  }
  if (productName.includes(query) || query.includes(productName)) {
    score = Math.max(score, 0.88);
  }
  for (const alias of aliases) {
    if (alias.includes(query) || query.includes(alias)) {
      score = Math.max(score, 0.86);
    }
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length > 0) {
    const searchableText = [productName, productCategory, productBrand, productDescription, ...aliases].join(" ");
    const matchedTokens = queryTokens.filter((t) => searchableText.includes(t));
    score = Math.max(score, (matchedTokens.length / queryTokens.length) * 0.82);
  }

  const technicalScore = scoreTechnicalMeasurements(query, [productName, ...aliases]);
  score = Math.max(score, technicalScore);

  return Number(score.toFixed(4));
}

function scoreTechnicalMeasurements(query: string, candidates: string[]): number {
  const normalizedQuery = normalizeText(query);
  const queryNumbers = extractNumbersAndFractions(normalizedQuery);
  if (queryNumbers.length === 0) return 0;

  let bestScore = 0;
  for (const candidate of candidates) {
    const candidateNumbers = extractNumbersAndFractions(normalizeText(candidate));
    if (candidateNumbers.length === 0) continue;
    const matches = queryNumbers.filter((n) => candidateNumbers.includes(n));
    const ratio = matches.length / Math.max(queryNumbers.length, 1);
    if (ratio > 0) bestScore = Math.max(bestScore, 0.45 + ratio * 0.35);
  }
  return Number(bestScore.toFixed(4));
}

function extractNumbersAndFractions(value: string): string[] {
  const matches = value.match(/\d+\s*\/\s*\d+|\d+(\.\d+)?/g);
  if (!matches) return [];
  return matches.map((item) => item.replace(/\s+/g, ""));
}

export function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

export type TechnicalListSearchItem = {
  line: string;
  quantity: number | null;
  productText: string;
  result: ProductSearchResult;
};

export async function searchTechnicalList(
  text: string,
  tenantId: string
): Promise<TechnicalListSearchItem[]> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: TechnicalListSearchItem[] = [];
  for (const line of lines) {
    const parsedLine = parseTechnicalLine(line);
    const result = await searchProductForTenant(parsedLine.productText, tenantId);
    results.push({ line, quantity: parsedLine.quantity, productText: parsedLine.productText, result });
  }
  return results;
}

function parseTechnicalLine(line: string): { quantity: number | null; productText: string } {
  const normalized = line.trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) return { quantity: null, productText: normalized };
  return { quantity: Number(match[1]), productText: match[2].trim() };
}
