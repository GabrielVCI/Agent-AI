/**
 * Códigos de error estándar de Sendwary. El frontend puede hacer switch sobre
 * `error.code`; el usuario final solo ve el mensaje amigable asociado
 * (error-messages.ts). Agregar aquí el código + status default al crear uno.
 */
export const ERROR_CODES = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  TENANT_REQUIRED: 403,
  RESOURCE_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  DATABASE_CONNECTION_ERROR: 503,
  DATABASE_QUERY_ERROR: 500,
  EXTERNAL_SERVICE_ERROR: 502,
  WHATSAPP_CONNECTION_ERROR: 502,
  OPENAI_SERVICE_ERROR: 502,
  ELEVENLABS_SERVICE_ERROR: 502,
  RATE_LIMIT_EXCEEDED: 429,
  BILLING_LIMIT_REACHED: 402,
  SERVICE_NOT_CONFIGURED: 503,
  // ── Billing / LemonSqueezy ──
  // El proveedor no está configurado en este ambiente (falta API key/store/variant).
  LEMON_CONFIGURATION_ERROR: 503,
  // Nuestra API key fue rechazada por LemonSqueezy (401/403). Es culpa NUESTRA,
  // no del usuario: por eso 502 y no 401 (el usuario sí está autenticado).
  LEMON_AUTH_ERROR: 502,
  // Fallo genérico/temporal del proveedor (5xx, timeout, red).
  LEMON_API_ERROR: 502,
  LEMON_RATE_LIMITED: 429,
  // LemonSqueezy rechazó el payload (422): datos de checkout inválidos.
  LEMON_VALIDATION_ERROR: 502,
  // Webhook firmado mal o sin firma: nunca se procesa.
  INVALID_WEBHOOK_SIGNATURE: 401,
  // Evento ya procesado. No es un fallo del proveedor: el webhook responde 200.
  DUPLICATE_WEBHOOK: 409,
  SUBSCRIPTION_NOT_FOUND: 404,
  // El plan existe pero no tiene variante/producto de LemonSqueezy asociado.
  PLAN_NOT_CONFIGURED: 503,
  CHECKOUT_CREATION_FAILED: 502,
  // Correo transaccional (Resend/SMTP)
  EMAIL_PROVIDER_NOT_CONFIGURED: 503,
  EMAIL_SEND_FAILED: 502,
  EMAIL_TEMPLATE_FAILED: 500,
  UNKNOWN_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function defaultStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}

/**
 * Código por defecto cuando solo conocemos el status HTTP (compat con los
 * ~100 call sites legacy de `new AppError(mensaje, status)`).
 */
export function codeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHENTICATED";
    case 402:
      return "BILLING_LIMIT_REACHED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "RESOURCE_NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMIT_EXCEEDED";
    case 502:
      return "EXTERNAL_SERVICE_ERROR";
    case 503:
      return "SERVICE_NOT_CONFIGURED";
    default:
      return "UNKNOWN_ERROR";
  }
}
