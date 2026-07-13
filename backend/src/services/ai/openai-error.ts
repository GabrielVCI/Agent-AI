import OpenAI from "openai";

/**
 * Mensaje de fallback enviado al cliente por WhatsApp cuando OpenAI falla.
 * Sugiere intervención humana sin exponer detalles técnicos.
 */
export const OPENAI_FAILURE_REPLY =
  "Dame un momento, voy a pasar tu solicitud a un asesor para ayudarte mejor.";

export type OpenAiErrorInfo = {
  /** Mensaje técnico para logs internos. NUNCA se expone al cliente final. */
  logMessage: string;
  /** Código de error de OpenAI si está disponible (ej: "insufficient_quota"). */
  code: string | null;
  /** HTTP status devuelto por OpenAI si aplica. */
  status: number | null;
  /** true si es un error transitorio que podría resolverse reintentando. */
  retryable: boolean;
  /** true si el problema es de configuración (API key / cuota) y requiere acción del operador. */
  configIssue: boolean;
};

/**
 * Normaliza cualquier error lanzado por el SDK de OpenAI a una forma
 * consistente para logging y métricas, sin filtrar datos sensibles.
 */
export function describeOpenAiError(error: unknown): OpenAiErrorInfo {
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? null;
    const code = (error.code as string | undefined) ?? null;

    return {
      logMessage: `OpenAI APIError ${status ?? "?"}${code ? ` (${code})` : ""}: ${error.message}`,
      code,
      status,
      retryable: status === 429 || (typeof status === "number" && status >= 500),
      configIssue:
        status === 401 ||
        status === 403 ||
        code === "insufficient_quota" ||
        code === "invalid_api_key",
    };
  }

  if (error instanceof Error) {
    const isTimeout = /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(error.message);
    return {
      logMessage: `OpenAI error: ${error.message}`,
      code: null,
      status: null,
      retryable: isTimeout,
      configIssue: false,
    };
  }

  return {
    logMessage: `OpenAI error desconocido: ${String(error)}`,
    code: null,
    status: null,
    retryable: false,
    configIssue: false,
  };
}
