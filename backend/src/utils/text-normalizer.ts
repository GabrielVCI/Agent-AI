export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[×]/g, "x")
    .replace(/\s+/g, " ")
    .trim();
}

export function removeCommonNoise(value: string): string {
  return normalizeText(value)
    .replace(/\bde\b/g, " ")
    .replace(/\bla\b/g, " ")
    .replace(/\bel\b/g, " ")
    .replace(/\blos\b/g, " ")
    .replace(/\blas\b/g, " ")
    .replace(/\bpor\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return removeCommonNoise(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}