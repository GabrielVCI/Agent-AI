const BASE_URL = import.meta.env.VITE_API_URL || ''

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>
}

/**
 * Sobre estándar del backend. TODAS las respuestas lo usan:
 *   éxito -> { success: true, data: ... }
 *   error -> { success: false, message?/error?, errors? }
 */
type ApiEnvelope<T> = {
  success?: boolean
  data?: T
  message?: string
  error?: string
  errors?: Record<string, string[] | string>
}

export class ApiError extends Error {
  statusCode?: number
  fieldErrors?: Record<string, string[] | string>
  constructor(message: string, statusCode?: number, fieldErrors?: Record<string, string[] | string>) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.fieldErrors = fieldErrors
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options

  let url = `${BASE_URL}${path}`
  if (params) {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (query) url += `?${query}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
  } catch {
    // El servidor no respondió (caído, sin red, CORS).
    throw new ApiError('No se pudo conectar con el servidor. Verifica que el backend esté activo.', 0)
  }

  if (response.status === 401) {
    throw new ApiError('Unauthorized', 401)
  }
  if (response.status === 403) {
    throw new ApiError('Forbidden', 403)
  }

  if (response.status === 204) return undefined as T

  // Intentamos parsear el cuerpo (puede no ser JSON en errores de infra).
  let body: ApiEnvelope<T> | null = null
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    body = null
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      flattenFieldErrors(body?.errors) ||
      `Error ${response.status}`
    throw new ApiError(message, response.status, body?.errors)
  }

  // 2xx pero el backend marcó success:false (siempre revisamos el sobre).
  if (body && body.success === false) {
    const message =
      body.message || body.error || flattenFieldErrors(body.errors) || 'La operación no fue exitosa'
    throw new ApiError(message, response.status, body.errors)
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

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
      headers: {},
    }),
}

export default api
