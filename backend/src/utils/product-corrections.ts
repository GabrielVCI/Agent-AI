import { normalizeText } from "./text-normalizer.js";

export type CorrectionResult = {
  originalText: string;
  normalizedText: string;
  correctionApplied?: string;
};

const corrections: Array<{
  pattern: RegExp;
  replacement: string;
  label: string;
}> = [
  {
    pattern: /\btiner\b|\btinner\b|\btinel\b/g,
    replacement: "thinner",
    label: "tiner/tinner/tinel → thinner"
  },
  {
    pattern: /\bcalvanizado\b/g,
    replacement: "galvanizado",
    label: "calvanizado → galvanizado"
  },
  {
    pattern: /\bllame\b/g,
    replacement: "yale",
    label: "llame → yale"
  },
  {
    pattern: /\byales\b/g,
    replacement: "yale",
    label: "yales → yale"
  },
  {
    pattern: /\bllavin\b/g,
    replacement: "llavin",
    label: "llavín normalizado"
  },
  {
    pattern: /\boxido\b/g,
    replacement: "oxido",
    label: "óxido normalizado"
  },
  {
    pattern: /\bdisco\s*#\s*7\b/g,
    replacement: "disco de corte 7 pulgadas",
    label: "disco #7 → disco de corte 7 pulgadas"
  },
  {
    pattern: /\bdisco\s*#\s*4\b/g,
    replacement: "disco de pulir 4 pulgadas",
    label: "disco #4 → disco de pulir 4 pulgadas"
  }
];

export function applyProductCorrections(input: string): CorrectionResult {
  let normalizedText = normalizeText(input);
  const applied: string[] = [];

  for (const correction of corrections) {
    if (correction.pattern.test(normalizedText)) {
      normalizedText = normalizedText.replace(
        correction.pattern,
        correction.replacement
      );

      applied.push(correction.label);
    }

    correction.pattern.lastIndex = 0;
  }

  normalizedText = normalizedText.replace(/\s+/g, " ").trim();

  return {
    originalText: input,
    normalizedText,
    correctionApplied: applied.length > 0 ? applied.join(", ") : undefined
  };
}