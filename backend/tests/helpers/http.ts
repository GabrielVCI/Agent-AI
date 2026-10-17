/**
 * Cliente HTTP para las pruebas de endpoint.
 *
 * Monta la app de Express **sin abrir un puerto**: se importa `app` desde
 * `src/app.ts`, no `src/server.ts`. Esto importa porque `server.ts` es quien
 * llama a `startAutomationWorker()`; si las pruebas montaran el servidor
 * completo, procesarían jobs reales. Ver docs/qa/QA_INITIAL_AUDIT.md (R3).
 */
import cookieParser from "cookie-parser";
import express, { type RequestHandler } from "express";
import request from "supertest";

import { app } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { errorHandler } from "../../src/middlewares/error.middleware.js";
import type { TestUser } from "./factories.js";

export { app };

/** Nombre real de la cookie de sesión, tal como lo configura el backend. */
export const COOKIE_NAME = env.SESSION_COOKIE_NAME;

/** Petición sin autenticar. */
export function anon() {
  return request(app);
}

/**
 * Inicia sesión y devuelve la cabecera `Set-Cookie` completa, tal cual la envió
 * el servidor. Se devuelve entera (no solo el valor) para poder afirmar sobre
 * sus atributos: HttpOnly, SameSite, Path…
 */
export async function login(
  email: string,
  password: string
): Promise<{ status: number; setCookie: string[]; body: unknown }> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password })
    .set("Content-Type", "application/json");

  const raw = res.headers["set-cookie"];
  const setCookie = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return { status: res.status, setCookie, body: res.body };
}

/** La cookie de sesión en formato `nombre=valor`, lista para reenviar. */
export function sessionCookie(setCookie: string[]): string | null {
  const found = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!found) return null;
  return found.split(";")[0];
}

/**
 * Inicia sesión con un usuario de prueba y devuelve su cookie lista para usar.
 * Falla ruidosamente si el login no funcionó: una prueba que sigue con una
 * cookie vacía produce un 401 que parece un fallo de permisos y no lo es.
 */
export async function loginAs(user: TestUser): Promise<string> {
  const { status, setCookie, body } = await login(user.email, user.password);

  if (status !== 200) {
    throw new Error(
      `loginAs(${user.role}) falló con ${status}: ${JSON.stringify(body)}`
    );
  }

  const cookie = sessionCookie(setCookie);
  if (!cookie) {
    throw new Error(
      `loginAs(${user.role}): el login devolvió 200 pero sin cookie "${COOKIE_NAME}"`
    );
  }

  return cookie;
}

/** Atajo: GET autenticado con la cookie de sesión. */
export function getAs(cookie: string, path: string) {
  return request(app).get(path).set("Cookie", cookie);
}

/** Atajo: POST autenticado con la cookie de sesión. */
export function postAs(cookie: string, path: string, body: unknown = {}) {
  return request(app).post(path).set("Cookie", cookie).send(body as object);
}

/** Atajo: PUT autenticado con la cookie de sesión. */
export function putAs(cookie: string, path: string, body: unknown = {}) {
  return request(app).put(path).set("Cookie", cookie).send(body as object);
}

/** Atajo: PATCH autenticado con la cookie de sesión. */
export function patchAs(cookie: string, path: string, body: unknown = {}) {
  return request(app).patch(path).set("Cookie", cookie).send(body as object);
}

/** Atajo: DELETE autenticado con la cookie de sesión. */
export function deleteAs(cookie: string, path: string) {
  return request(app).delete(path).set("Cookie", cookie);
}

/**
 * Código de error del contrato de errores del backend: `{message, error:{code}}`.
 * Afirmar sobre el código y no sobre el texto evita que las pruebas se rompan
 * cada vez que alguien mejora la redacción de un mensaje.
 */
export function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } })?.error?.code;
}

/**
 * Monta una app mínima con los middlewares REALES del proyecto y un handler
 * que responde 200, para probar un middleware **aislado** de los controladores.
 *
 * Hace falta porque en las rutas reales el resultado se mezcla: por ejemplo, un
 * SUPER_ADMIN recibe 403 en `POST /api/agents`, pero se lo da `requireRole`
 * (no incluye ese rol) mucho antes de llegar al paywall. Probando contra la
 * ruta completa es imposible saber si el bypass del paywall sigue existiendo.
 *
 * La autenticación es la de verdad: `requireAuth` + cookie de sesión real.
 */
export function middlewareApp(
  ...middlewares: RequestHandler[]
): ReturnType<typeof express> {
  const mini = express();

  mini.use(cookieParser());
  mini.use(express.json());
  mini.get("/probe", ...middlewares, (_req, res) => {
    res.status(200).json({ paso: true });
  });
  mini.use(errorHandler);

  return mini;
}

/** GET autenticado contra una app construida con `middlewareApp`. */
export function probe(mini: ReturnType<typeof express>, cookie: string) {
  return request(mini).get("/probe").set("Cookie", cookie);
}
