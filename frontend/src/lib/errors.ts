/**
 * Normalización central de errores para la UI.
 *
 * Regla: el usuario NUNCA ve "Unauthorized", "Request failed with status
 * code 500", códigos crudos ni stack traces — solo mensajes en español.
 * El backend ya manda mensajes amigables ({ message, error: { code } });
 * esto es la red de seguridad para cuando no llegan (red caída, proxy, bugs).
 */

export interface NormalizedApiError {
  /** Mensaje amigable listo para mostrarse en un <Alert>. */
  message: string
  /** Código estable del backend (INVALID_CREDENTIALS, FORBIDDEN...) si vino. */
  code?: string
  /** Status HTTP para lógica (ej. 401 → redirigir a login). NO mostrar. */
  statusCode?: number
  fieldErrors?: Record<string, string[] | string>
}

export const CONNECTION_ERROR_MESSAGE =
  'Error de conexión. Revisa tu internet o intenta nuevamente.'

/** Fallbacks amigables por status cuando el backend no mandó mensaje. */
const FRIENDLY_BY_STATUS: Record<number, string> = {
  400: 'Revisa los datos ingresados.',
  401: 'Tu sesión no está activa. Inicia sesión nuevamente.',
  402: 'Tu plan alcanzó el límite mensual. Revisa tu suscripción o contacta soporte.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos la información solicitada.',
  409: 'Ya existe un registro con esos datos.',
  429: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.',
  500: 'Ocurrió un error inesperado. Intenta nuevamente.',
  502: 'No pudimos comunicarnos con el servicio externo.',
  503: 'El servicio no está disponible en este momento. Intenta nuevamente.',
}

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Intenta nuevamente.'

/** Mensajes técnicos que jamás deben llegar a la UI tal cual. */
function looksTechnical(message: string): boolean {
  return (
    /unauthorized|forbidden|request failed|status code|network error|fetch|ECONN|timeout of|<html/i.test(
      message
    ) || /^\d{3}$/.test(message.trim())
  )
}

export function friendlyMessageForStatus(status?: number): string {
  if (!status) return CONNECTION_ERROR_MESSAGE
  return FRIENDLY_BY_STATUS[status] ?? GENERIC_MESSAGE
}

/**
 * Convierte cualquier error (ApiError, Error, string, desconocido) en algo
 * mostrable. Úsalo en los catch de páginas/formularios:
 *
 *   catch (err) { setError(getUserFriendlyErrorMessage(err)) }
 */
export function normalizeApiError(err: unknown): NormalizedApiError {
  if (err && typeof err === 'object') {
    const e = err as {
      message?: string
      code?: string
      statusCode?: number
      fieldErrors?: Record<string, string[] | string>
    }
    const raw = typeof e.message === 'string' ? e.message.trim() : ''
    const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined
    // statusCode 0 = el fetch nunca llegó al backend (red caída / CORS)
    if (statusCode === 0) {
      return { message: CONNECTION_ERROR_MESSAGE, statusCode, code: e.code }
    }
    const message = raw && !looksTechnical(raw) ? raw : friendlyMessageForStatus(statusCode)
    return { message, code: e.code, statusCode, fieldErrors: e.fieldErrors }
  }
  if (typeof err === 'string' && err.trim() && !looksTechnical(err)) {
    return { message: err.trim() }
  }
  return { message: GENERIC_MESSAGE }
}

export function getUserFriendlyErrorMessage(err: unknown): string {
  return normalizeApiError(err).message
}
