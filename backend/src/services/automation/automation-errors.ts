/**
 * Clasificación y saneamiento de errores del motor de automatizaciones.
 *
 * Regla dura de seguridad: NADA de lo que se persiste (AutomationJob.lastError,
 * AutomationExecution.errorMessage, ScheduledMessage.lastError) ni de lo que se
 * loguea puede contener tokens, headers Authorization, App Secrets ni claves de
 * API. Los errores de axios traen `config.headers.Authorization` con el token
 * de Meta del tenant: por eso NUNCA se serializa el error completo.
 */

export type AutomationErrorKind = "RETRYABLE" | "NON_RETRYABLE";

export class AutomationActionError extends Error {
  public readonly kind: AutomationErrorKind;
  public readonly errorType: string;

  constructor(message: string, options: { kind: AutomationErrorKind; errorType: string }) {
    super(message);
    this.name = "AutomationActionError";
    this.kind = options.kind;
    this.errorType = options.errorType;
  }

  static retryable(errorType: string, message: string): AutomationActionError {
    return new AutomationActionError(message, { kind: "RETRYABLE", errorType });
  }

  static nonRetryable(errorType: string, message: string): AutomationActionError {
    return new AutomationActionError(message, { kind: "NON_RETRYABLE", errorType });
  }
}

const MAX_ERROR_LENGTH = 500;

/** Patrones de secretos que jamás deben quedar en BD ni en logs. */
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /EAA[A-Za-z0-9]{20,}/g, // access tokens de Meta
  /sk-[A-Za-z0-9_\-]{20,}/g, // OpenAI
  /re_[A-Za-z0-9_\-]{20,}/g, // Resend
  /xkeysib-[A-Za-z0-9_\-]{20,}/g,
  /"?(access_?token|api_?key|authorization|password|secret|token)"?\s*[:=]\s*"?[^"\s,}]+/gi,
];

/** Reemplaza cualquier rastro de credencial por [REDACTED]. */
export function sanitizeErrorText(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output.length > MAX_ERROR_LENGTH ? `${output.slice(0, MAX_ERROR_LENGTH)}…` : output;
}

interface AxiosLikeError {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: { status?: number; data?: unknown };
}

function asAxiosLike(error: unknown): AxiosLikeError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as AxiosLikeError;
  if (candidate.isAxiosError) return candidate;
  return null;
}

/** Mensaje corto y seguro del cuerpo de error de un servicio externo. */
function describeResponseData(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return sanitizeErrorText(data.slice(0, 200));
  if (typeof data === "object") {
    const metaError = (data as { error?: { message?: string; code?: number; type?: string } }).error;
    if (metaError?.message) {
      return sanitizeErrorText(
        `${metaError.type ?? "error"}${metaError.code ? ` ${metaError.code}` : ""}: ${metaError.message}`
      );
    }
    const message = (data as { message?: string }).message;
    if (typeof message === "string") return sanitizeErrorText(message.slice(0, 200));
  }
  return "";
}

export interface ClassifiedError {
  kind: AutomationErrorKind;
  errorType: string;
  /** Ya sanitizado: apto para persistir y loguear. */
  message: string;
}

/**
 * Clasifica cualquier error en RETRYABLE / NON_RETRYABLE.
 *
 * RETRYABLE: timeouts, red caída, 429 y 5xx (dependencia temporalmente mal).
 * NON_RETRYABLE: 4xx de negocio (número inválido, integración deshabilitada,
 * tenant/cliente inexistente, configuración inválida) — reintentar no cambia
 * el resultado y solo gasta cuota.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof AutomationActionError) {
    return {
      kind: error.kind,
      errorType: error.errorType,
      message: sanitizeErrorText(error.message),
    };
  }

  const axiosError = asAxiosLike(error);
  if (axiosError) {
    const status = axiosError.response?.status;
    const detail = describeResponseData(axiosError.response?.data);

    if (status === undefined) {
      // Sin respuesta: DNS, timeout, conexión rechazada → reintentable.
      return {
        kind: "RETRYABLE",
        errorType: axiosError.code ?? "NETWORK_ERROR",
        message: sanitizeErrorText(axiosError.message ?? "Fallo de red"),
      };
    }
    if (status === 429) {
      return {
        kind: "RETRYABLE",
        errorType: "HTTP_429",
        message: sanitizeErrorText(`Rate limit del proveedor. ${detail}`.trim()),
      };
    }
    if (status >= 500) {
      return {
        kind: "RETRYABLE",
        errorType: `HTTP_${status}`,
        message: sanitizeErrorText(`Error del proveedor (${status}). ${detail}`.trim()),
      };
    }
    return {
      kind: "NON_RETRYABLE",
      errorType: `HTTP_${status}`,
      message: sanitizeErrorText(`Solicitud rechazada por el proveedor (${status}). ${detail}`.trim()),
    };
  }

  if (error instanceof Error) {
    const message = error.message ?? "";
    const retryableHint = /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(
      message
    );
    return {
      kind: retryableHint ? "RETRYABLE" : "NON_RETRYABLE",
      errorType: error.name || "ERROR",
      message: sanitizeErrorText(message || "Error desconocido"),
    };
  }

  return {
    kind: "NON_RETRYABLE",
    errorType: "UNKNOWN",
    message: "Error desconocido",
  };
}
