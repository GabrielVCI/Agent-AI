/**
 * Normalización telefónica central de Sendwary (Módulo 1).
 *
 * TODO teléfono que entre al dominio Customer pasa por aquí. La representación
 * canónica es E.164 (+18095555555) y es la clave real de deduplicación:
 *
 *   8095555555 · +18095555555 · 1-809-555-5555 · (809) 555-5555
 *      → +18095555555
 *
 * Se apoya en libphonenumber-js (metadata oficial de Google) en vez de una
 * limpieza casera de símbolos: quitar guiones no distingue un móvil dominicano
 * de un fijo español ni valida longitudes por país.
 *
 * País por defecto: NO está hardcodeado a República Dominicana en el dominio.
 * El caller pasa el país del tenant (Tenant.timezone → países candidatos, o el
 * país explícito de la integración). DEFAULT_PHONE_COUNTRY solo es el último
 * recurso y es configurable por variable de entorno.
 */
import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * País asumido cuando el número llega sin código internacional y el tenant no
 * declaró ninguno. Configurable (DEFAULT_PHONE_COUNTRY) para no atar el
 * producto a un solo mercado.
 *
 * Se lee de process.env directamente (y no de config/env.ts) a propósito:
 * este módulo debe poder usarse sin la configuración completa del backend
 * —los tests unitarios lo ejercitan sin DATABASE_URL ni SESSION_SECRET—.
 * La validación del valor sí ocurre al arrancar, en config/env.ts.
 */
export const DEFAULT_PHONE_COUNTRY = (
  process.env.DEFAULT_PHONE_COUNTRY || "DO"
).toUpperCase() as CountryCode;

/**
 * Zona horaria del tenant → país probable. Sendwary ya guarda
 * Tenant.timezone (no guarda país), así que este mapa es el puente hasta que
 * exista un campo `country` explícito. Sin coincidencia se usa el default.
 */
const TIMEZONE_TO_COUNTRY: Record<string, CountryCode> = {
  "America/Santo_Domingo": "DO",
  "America/Port-au-Prince": "HT",
  "America/Puerto_Rico": "PR",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Mexico_City": "MX",
  "America/Bogota": "CO",
  "America/Lima": "PE",
  "America/Caracas": "VE",
  "America/Panama": "PA",
  "America/Guatemala": "GT",
  "America/Tegucigalpa": "HN",
  "America/Managua": "NI",
  "America/Costa_Rica": "CR",
  "America/El_Salvador": "SV",
  "America/Havana": "CU",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL",
  "America/Montevideo": "UY",
  "America/Asuncion": "PY",
  "America/La_Paz": "BO",
  "America/Guayaquil": "EC",
  "America/Sao_Paulo": "BR",
  "Europe/Madrid": "ES",
};

/** País por defecto de un tenant a partir de su zona horaria. */
export function countryForTimezone(timezone?: string | null): CountryCode {
  if (!timezone) return DEFAULT_PHONE_COUNTRY;
  return TIMEZONE_TO_COUNTRY[timezone] ?? DEFAULT_PHONE_COUNTRY;
}

export interface NormalizedPhone {
  /** E.164 (+18095555555) o null si el número no es interpretable. */
  e164: string | null;
  /** ISO-3166 alpha-2 del número (DO, US, ES...) o null. */
  country: string | null;
  /** true si libphonenumber lo considera un número válido de ese país. */
  valid: boolean;
  /** Formato legible para la UI ("+1 809-555-5555"); cae al original. */
  formatted: string;
  /** Lo que escribió el usuario, con espacios recortados. */
  raw: string;
}

const EMPTY: NormalizedPhone = {
  e164: null,
  country: null,
  valid: false,
  formatted: "",
  raw: "",
};

/**
 * Normaliza un teléfono a E.164.
 *
 * `defaultCountry` solo se usa cuando el número NO trae código internacional:
 * un "+34..." siempre se interpreta como España aunque el tenant sea
 * dominicano.
 *
 * Caso WhatsApp: Meta entrega el `wa_id` en formato internacional SIN "+"
 * (18095551234). Un número así, sin prefijo, se intentaría interpretar como
 * local; por eso se reintenta anteponiendo "+" cuando la primera lectura
 * falla y el texto son solo dígitos de longitud internacional plausible.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode | string = DEFAULT_PHONE_COUNTRY
): NormalizedPhone {
  const raw = (input ?? "").trim();
  if (!raw) return { ...EMPTY };

  const country = String(defaultCountry).toUpperCase() as CountryCode;

  const attempt = (value: string): NormalizedPhone | null => {
    let parsed;
    try {
      parsed = parsePhoneNumberFromString(value, country);
    } catch {
      return null;
    }
    if (!parsed) return null;
    return {
      e164: parsed.number,
      country: parsed.country ?? null,
      valid: parsed.isValid(),
      formatted: parsed.formatInternational(),
      raw,
    };
  };

  const direct = attempt(raw);
  if (direct?.valid) return direct;

  // Segundo intento: dígitos "pelados" que en realidad son internacionales
  // (wa_id de Meta, exports de CRM). Solo si tiene pinta de serlo.
  const digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    const withPlus = attempt(`+${digits}`);
    if (withPlus?.valid) return withPlus;
  }

  // No es válido: devolvemos lo mejor que se pudo interpretar sin mentir
  // (valid = false). El caller decide si lo rechaza o lo guarda sin canónico.
  return direct ?? { ...EMPTY, raw, formatted: raw };
}

/**
 * Atajo para deduplicar: E.164 o null.
 * null significa "no se puede deduplicar por teléfono", nunca "sin teléfono".
 */
export function toE164(
  input: string | null | undefined,
  defaultCountry: CountryCode | string = DEFAULT_PHONE_COUNTRY
): string | null {
  const result = normalizePhone(input, defaultCountry);
  return result.valid ? result.e164 : null;
}

/**
 * Variantes con las que buscar un teléfono en BD cuando la normalización no
 * es concluyente (búsqueda tolerante del listado). Devuelve fragmentos, no
 * claves: el caller los usa con `contains`.
 */
export function phoneSearchVariants(
  input: string,
  defaultCountry: CountryCode | string = DEFAULT_PHONE_COUNTRY
): string[] {
  const variants = new Set<string>();
  const raw = input.trim();
  if (raw) variants.add(raw);

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) {
    variants.add(digits);
    // Últimos 7-10 dígitos: encuentra "+18095551234" buscando "8095551234"
    if (digits.length > 7) variants.add(digits.slice(-10));
  }

  const normalized = normalizePhone(raw, defaultCountry);
  if (normalized.e164) {
    variants.add(normalized.e164);
    variants.add(normalized.e164.replace("+", ""));
  }

  return [...variants].filter((v) => v.length >= 3);
}

/** Enmascara un teléfono para logs y mensajes: "•••••1234". */
export function maskPhone(phone: string | null | undefined): string {
  const value = (phone ?? "").trim();
  if (value.length <= 4) return "••••";
  return `•••••${value.slice(-4)}`;
}
