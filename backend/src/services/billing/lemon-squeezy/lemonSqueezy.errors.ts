import { AppError } from "../../../errors/AppError.js";

/**
 * Traductor central de errores de LemonSqueezy → AppError de Sendwary.
 *
 * Regla: el mensaje del proveedor NUNCA llega al cliente. Se traduce a un
 * código estable y a un mensaje amigable; el detalle técnico viaja en
 * `internalMessage` (solo logs) y siempre sanitizado — jamás cabeceras,
 * Authorization ni el JSON completo de la respuesta.
 */

export interface LemonSqueezyFailure {
  /** Status HTTP devuelto por LS; undefined si no hubo respuesta (red/timeout). */
  status?: number;
  /** "timeout" | "network" | undefined */
  transport?: "timeout" | "network";
  /** Operación de negocio, para el log: "createCheckout", "getSubscription"... */
  operation: string;
  /** Path relativo llamado, p. ej. "/v1/checkouts". Sin query con secretos. */
  path: string;
  /** Códigos/títulos de error de LS ya extraídos y recortados. Sin PII. */
  providerHints?: string[];
}

/** Máximo de caracteres del detalle del proveedor que se guarda en el log. */
const MAX_HINT_LENGTH = 300;

/**
 * Extrae los `errors[].title/detail/code` de una respuesta JSON:API de LS
 * sin arrastrar el objeto completo (puede traer PII del comprador).
 */
export function extractProviderHints(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .slice(0, 5)
    .map((e) => {
      const err = e as { title?: unknown; detail?: unknown; code?: unknown };
      return [err.code, err.title, err.detail]
        .filter((v): v is string => typeof v === "string")
        .join(": ");
    })
    .filter(Boolean)
    .map((hint) => hint.slice(0, MAX_HINT_LENGTH));
}

/**
 * Mapea el fallo a un AppError. Un solo `switch` para toda la app: ningún
 * servicio vuelve a decidir "esto es un 429, esto es un 5xx".
 */
export function mapLemonSqueezyError(failure: LemonSqueezyFailure): AppError {
  const { status, transport, operation, path } = failure;
  const hints = failure.providerHints?.length ? ` — ${failure.providerHints.join(" | ")}` : "";
  const where = `LemonSqueezy ${operation} ${path}`;

  if (transport === "timeout") {
    return AppError.fromCode("LEMON_API_ERROR", {
      internalMessage: `${where}: timeout sin respuesta`,
    });
  }
  if (transport === "network" || status === undefined) {
    return AppError.fromCode("LEMON_API_ERROR", {
      internalMessage: `${where}: error de red sin respuesta`,
    });
  }

  if (status === 401 || status === 403) {
    // La API key fue rechazada. NUNCA se incluye la key ni parte de ella.
    return AppError.fromCode("LEMON_AUTH_ERROR", {
      internalMessage: `${where}: credenciales rechazadas (HTTP ${status})${hints}`,
    });
  }
  if (status === 404) {
    // Un 404 de LS con nuestros ids = configuración mala (variant/store), no
    // "recurso del usuario no encontrado".
    return AppError.fromCode("LEMON_CONFIGURATION_ERROR", {
      internalMessage: `${where}: recurso inexistente en LemonSqueezy (HTTP 404)${hints}`,
    });
  }
  if (status === 422) {
    return AppError.fromCode("LEMON_VALIDATION_ERROR", {
      internalMessage: `${where}: payload rechazado (HTTP 422)${hints}`,
    });
  }
  if (status === 429) {
    return AppError.fromCode("LEMON_RATE_LIMITED", {
      internalMessage: `${where}: rate limit del proveedor (HTTP 429)`,
    });
  }
  if (status >= 500) {
    return AppError.fromCode("LEMON_API_ERROR", {
      internalMessage: `${where}: fallo del proveedor (HTTP ${status})${hints}`,
    });
  }

  return AppError.fromCode("LEMON_API_ERROR", {
    internalMessage: `${where}: respuesta inesperada (HTTP ${status})${hints}`,
  });
}
