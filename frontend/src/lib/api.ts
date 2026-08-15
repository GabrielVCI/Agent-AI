import { CONNECTION_ERROR_MESSAGE, friendlyMessageForStatus } from './errors'

const BASE_URL = import.meta.env.VITE_API_URL || ''

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>
}

/**
 * Sobre estándar del backend. TODAS las respuestas lo usan:
 *   éxito -> { success: true, data: ... }
 *   error -> { success: false, message, error: { code, message, details? }, errors? }
 * (error como string es el formato legacy; se sigue aceptando)
 */
type ApiEnvelope<T> = {
  success?: boolean
  data?: T
  message?: string
  error?: string | { code?: string; message?: string; details?: Record<string, unknown> }
  errors?: Record<string, string[] | string>
}

export class ApiError extends Error {
  statusCode?: number
  /** Código estable del backend (INVALID_CREDENTIALS, FORBIDDEN...). */
  code?: string
  fieldErrors?: Record<string, string[] | string>
  constructor(
    message: string,
    statusCode?: number,
    fieldErrors?: Record<string, string[] | string>,
    code?: string
  ) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

/** Aplana { campo: ["err1","err2"] } a un texto legible. */
function flattenFieldErrors(errors?: Record<string, string[] | string>): string | undefined {
  if (!errors) return undefined
  const parts = Object.values(errors)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  let url = `${BASE_URL}${path}`
  if (params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (query) url += `?${query}`
  }
  return url
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options
  const url = buildUrl(path, params)

  // Con FormData el navegador debe fijar el Content-Type (incluye el boundary)
  const isFormData = init.body instanceof FormData
  const headers: HeadersInit = isFormData
    ? { ...init.headers }
    : { 'Content-Type': 'application/json', ...init.headers }

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers,
    })
  } catch {
    // El servidor no respondió (caído, sin red, CORS).
    throw new ApiError(CONNECTION_ERROR_MESSAGE, 0)
  }

  if (response.status === 204) return undefined as T

  // SIEMPRE parseamos el body primero (también en 401/403): el backend manda
  // mensajes amigables (ej. "Usuario o clave incorrecta.") que la UI debe
  // mostrar. Nunca lanzamos textos crudos como "Unauthorized" o "Error 500".
  let body: ApiEnvelope<T> | null = null
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    body = null
  }

  if (!response.ok) {
    const errorObj = typeof body?.error === 'object' && body.error !== null ? body.error : null
    const message =
      body?.message ||
      errorObj?.message ||
      (typeof body?.error === 'string' ? body.error : '') ||
      flattenFieldErrors(body?.errors) ||
      friendlyMessageForStatus(response.status)
    throw new ApiError(message, response.status, body?.errors, errorObj?.code)
  }

  // 2xx pero el backend marcó success:false (siempre revisamos el sobre).
  if (body && body.success === false) {
    const errorObj = typeof body.error === 'object' && body.error !== null ? body.error : null
    const message =
      body.message ||
      errorObj?.message ||
      (typeof body.error === 'string' ? body.error : '') ||
      flattenFieldErrors(body.errors) ||
      'La operación no fue exitosa'
    throw new ApiError(message, response.status, body.errors, errorObj?.code)
  }

  // Desenvolvemos el sobre: el consumidor recibe directamente `data`.
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data as T
  }

  // Respuesta sin sobre (compatibilidad): devolvemos el cuerpo tal cual.
  return body as unknown as T
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(path, { method: 'GET', params }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, formData: FormData, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
      params,
    }),

  /**
   * Descarga un archivo binario (ej. Excel) respetando la sesión por cookie.
   * Dispara la descarga del navegador con el nombre sugerido por el servidor.
   */
  download: async (path: string, params?: Record<string, string | number | boolean | undefined>, fallbackName = 'archivo') => {
    const url = buildUrl(path, params)
    let response: Response
    try {
      response = await fetch(url, { credentials: 'include' })
    } catch {
      throw new ApiError(CONNECTION_ERROR_MESSAGE, 0)
    }
    if (!response.ok) {
      let message = friendlyMessageForStatus(response.status)
      try {
        const body = (await response.json()) as ApiEnvelope<unknown>
        const errorObj = typeof body?.error === 'object' && body.error !== null ? body.error : null
        message =
          body?.message ||
          errorObj?.message ||
          (typeof body?.error === 'string' ? body.error : '') ||
          message
      } catch {
        // cuerpo no-JSON: usamos el mensaje amigable por status
      }
      throw new ApiError(message, response.status)
    }
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/)
    const filename = match?.[1] || fallbackName
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  },
}

export default api
