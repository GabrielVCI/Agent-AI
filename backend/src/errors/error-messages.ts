import type { ErrorCode } from "./error-codes.js";

/**
 * Mensajes amigables por código. Es LO ÚNICO que el usuario final ve — nunca
 * "Unauthorized", números de status ni stack traces. Los AppError legacy con
 * mensaje propio en español lo conservan (ya eran user-facing).
 */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  INVALID_CREDENTIALS: "Usuario o clave incorrecta.",
  UNAUTHENTICATED: "Tu sesión no está activa. Inicia sesión nuevamente.",
  SESSION_EXPIRED: "Tu sesión expiró. Inicia sesión nuevamente.",
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
  TENANT_REQUIRED: "No encontramos una empresa asociada a tu usuario.",
  RESOURCE_NOT_FOUND: "No encontramos la información solicitada.",
  VALIDATION_ERROR: "Revisa los datos ingresados.",
  CONFLICT: "Ya existe un registro con esos datos.",
  DATABASE_CONNECTION_ERROR: "No pudimos conectar con la base de datos. Intenta nuevamente.",
  DATABASE_QUERY_ERROR: "No pudimos cargar la información. Intenta nuevamente.",
  EXTERNAL_SERVICE_ERROR: "No pudimos comunicarnos con el servicio externo.",
  WHATSAPP_CONNECTION_ERROR: "No pudimos conectar con WhatsApp. Revisa la configuración.",
  OPENAI_SERVICE_ERROR: "El agente no pudo generar una respuesta en este momento.",
  ELEVENLABS_SERVICE_ERROR: "No pudimos procesar el audio o la llamada en este momento.",
  RATE_LIMIT_EXCEEDED: "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
  BILLING_LIMIT_REACHED: "Tu plan alcanzó el límite mensual. Revisa tu suscripción o contacta soporte.",
  SERVICE_NOT_CONFIGURED: "Este servicio no está disponible en este momento.",
  LEMON_CONFIGURATION_ERROR:
    "Los pagos en línea aún no están disponibles. Contacta a soporte para activar tu plan.",
  LEMON_AUTH_ERROR: "No pudimos iniciar el proceso de pago. Intenta nuevamente en unos minutos.",
  LEMON_API_ERROR: "No pudimos iniciar el proceso de pago. Intenta nuevamente en unos minutos.",
  LEMON_RATE_LIMITED: "Hay demasiadas solicitudes de pago. Intenta nuevamente en unos minutos.",
  LEMON_VALIDATION_ERROR: "No pudimos iniciar el proceso de pago. Intenta nuevamente.",
  INVALID_WEBHOOK_SIGNATURE: "No pudimos verificar el origen de la notificación.",
  DUPLICATE_WEBHOOK: "Esta notificación ya fue procesada.",
  SUBSCRIPTION_NOT_FOUND: "No encontramos una suscripción activa para tu empresa.",
  PLAN_NOT_CONFIGURED:
    "Este plan aún no está disponible para pago en línea. Contacta a soporte.",
  CHECKOUT_CREATION_FAILED:
    "No pudimos iniciar el proceso de pago. Intenta nuevamente.",
  EMAIL_PROVIDER_NOT_CONFIGURED:
    "No pudimos enviar el correo en este momento. Intenta nuevamente.",
  EMAIL_SEND_FAILED: "No pudimos enviar el correo en este momento. Intenta nuevamente.",
  EMAIL_TEMPLATE_FAILED: "No pudimos preparar el correo. Intenta nuevamente.",
  UNKNOWN_ERROR: "Ocurrió un error inesperado. Intenta nuevamente.",
};

export function userMessageFor(code: ErrorCode): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN_ERROR;
}
