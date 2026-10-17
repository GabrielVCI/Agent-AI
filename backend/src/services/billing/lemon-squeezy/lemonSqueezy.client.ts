import axios, { type AxiosResponse } from "axios";

import { logger } from "../../../config/logger.js";
import { AppError } from "../../../errors/AppError.js";
import {
  buildLemonSqueezyHeaders,
  requireLemonSqueezyCredentials,
  type LemonSqueezyCredentials,
} from "./lemonSqueezy.config.js";
import { extractProviderHints, mapLemonSqueezyError } from "./lemonSqueezy.errors.js";

/**
 * Cliente HTTP ÚNICO contra la API de LemonSqueezy.
 *
 * Todo lo que habla con LS pasa por aquí: base URL, Authorization, cabeceras
 * JSON:API, timeout, parseo y traducción de errores. Ningún servicio ni
 * controller vuelve a construir un `fetch`/`axios` con `Bearer ...`.
 *
 * Se usa la instancia por defecto de axios (no `axios.create()`) a propósito:
 * es la que las pruebas interceptan con `axios.defaults.adapter`, así ninguna
 * suite puede salir a internet sin querer.
 */

/** Timeout duro: una request colgada no puede bloquear el checkout del usuario. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface LemonSqueezyRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path relativo a la base, empezando por "/": "/v1/checkouts". */
  path: string;
  /** Cuerpo JSON:API ya armado. */
  body?: unknown;
  /** Nombre de la operación para logs y errores ("createCheckout"). */
  operation: string;
}

/** Sobre JSON:API de LemonSqueezy (solo lo que consumimos). */
export interface LemonSqueezyResource<A = Record<string, unknown>> {
  type?: string;
  id?: string;
  attributes?: A;
}

export interface LemonSqueezyDocument<A = Record<string, unknown>> {
  data?: LemonSqueezyResource<A>;
}

/**
 * Ejecuta una llamada a LemonSqueezy y devuelve el cuerpo parseado.
 * Cualquier fallo sale como AppError ya traducido (ver lemonSqueezy.errors).
 */
export async function lemonSqueezyRequest<T>(req: LemonSqueezyRequest): Promise<T> {
  const credentials: LemonSqueezyCredentials = requireLemonSqueezyCredentials();
  const url = `${credentials.apiUrl}${req.path}`;

  let response: AxiosResponse<T>;
  try {
    response = await axios.request<T>({
      method: req.method,
      url,
      data: req.body,
      headers: buildLemonSqueezyHeaders(credentials),
      timeout: REQUEST_TIMEOUT_MS,
      // Nosotros decidimos qué es un fallo: así el mapper ve el body del error.
      validateStatus: () => true,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const transport = code === "ECONNABORTED" || code === "ETIMEDOUT" ? "timeout" : "network";
    // El objeto de axios lleva `config.headers.Authorization`: NUNCA se loguea
    // el error crudo, solo operación, path y tipo de fallo de transporte.
    logger.error(
      `[LEMONSQUEEZY] ${req.operation} falló sin respuesta (${transport}) en ${req.path}`
    );
    throw mapLemonSqueezyError({ transport, operation: req.operation, path: req.path });
  }

  if (response.status >= 400) {
    const hints = extractProviderHints(response.data);
    const appError = mapLemonSqueezyError({
      status: response.status,
      operation: req.operation,
      path: req.path,
      providerHints: hints,
    });
    logger.error(`[LEMONSQUEEZY] ${req.operation} HTTP ${response.status} en ${req.path}`, {
      code: appError.code,
      // hints ya vienen recortados y sin cabeceras
      providerHints: hints,
    });
    throw appError;
  }

  if (response.data == null) {
    throw AppError.fromCode("LEMON_API_ERROR", {
      internalMessage: `LemonSqueezy ${req.operation} ${req.path}: respuesta vacía (HTTP ${response.status})`,
    });
  }

  return response.data;
}
