/**
 * Pruebas HTTP de autenticación y de la cookie de sesión.
 *
 * Cubren los invariantes de LOCKED_DECISIONS que hasta ahora no tenían ninguna
 * verificación automática: la sesión viaja en una cookie httpOnly `sid`, el
 * token nunca aparece en el cuerpo de la respuesta, y un 401 sin cookie no
 * revela si el correo existe.
 *
 * Ejecutar: npm run test:http:auth
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import {
  cleanupTestData,
  createTenantWithOwner,
  createTestUser,
  PREFIX,
  TEST_PASSWORD,
  type TestUser,
} from "../helpers/factories.js";
import {
  anon,
  COOKIE_NAME,
  errorCode,
  getAs,
  login,
  loginAs,
  sessionCookie,
} from "../helpers/http.js";

let owner: TestUser;
let tenantId: string;

before(async () => {
  const created = await createTenantWithOwner("auth");
  tenantId = created.tenantId;
  owner = created.owner;
});

after(async () => {
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

describe("login", () => {
  test("credenciales correctas devuelven 200 y los datos del usuario", async () => {
    const { status, body } = await login(owner.email, TEST_PASSWORD);

    assert.equal(status, 200);
    const data = (body as { data: { email: string; role: string; tenantId: string } }).data;
    assert.equal(data.email, owner.email);
    assert.equal(data.role, "OWNER");
    assert.equal(data.tenantId, tenantId);
  });

  test("el token de sesión NUNCA viaja en el cuerpo de la respuesta", async () => {
    const { body } = await login(owner.email, TEST_PASSWORD);

    // El token solo debe existir dentro de la cookie httpOnly. Si apareciera
    // aquí, el JavaScript de la página podría leerlo.
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /token/i, "la respuesta menciona un token");
    assert.equal(
      (body as { data?: { passwordHash?: string } }).data?.passwordHash,
      undefined,
      "la respuesta expone el hash de la contraseña"
    );
  });

  test("contraseña incorrecta devuelve 401 y no crea cookie", async () => {
    const { status, setCookie } = await login(owner.email, "clave-que-no-es");

    assert.equal(status, 401);
    assert.equal(sessionCookie(setCookie), null);
  });

  test("un correo inexistente da el MISMO mensaje que una clave mala", async () => {
    // Anti-enumeración de usuarios: las dos respuestas deben ser
    // indistinguibles, o un atacante puede averiguar qué correos existen.
    // Ojo: el correo inexistente debe tener formato VÁLIDO. Uno malformado se
    // queda en la validación de entrada (400) y no llega a comprobar nada.
    const malaClave = await login(owner.email, "clave-que-no-es");
    const noExiste = await login(`${PREFIX}fantasma-${Date.now()}@example.test`, TEST_PASSWORD);

    assert.equal(noExiste.status, malaClave.status);

    // El traceId es único por petición a propósito (sirve para correlacionar
    // logs), así que se compara todo lo demás.
    const sinTrace = (body: unknown) => {
      const b = structuredClone(body) as { error?: { traceId?: string } };
      if (b.error) delete b.error.traceId;
      return b;
    };

    assert.deepEqual(sinTrace(noExiste.body), sinTrace(malaClave.body));
  });

  test("un usuario DISABLED no puede iniciar sesión", async () => {
    const disabled = await createTestUser({
      role: "ADMIN",
      tenantId,
      label: "disabled",
      status: "DISABLED",
    });

    const { status, setCookie } = await login(disabled.email, TEST_PASSWORD);

    assert.equal(status, 401);
    assert.equal(sessionCookie(setCookie), null);
  });

  test("datos inválidos devuelven 400, no 500", async () => {
    const res = await anon()
      .post("/api/auth/login")
      .send({ email: "esto-no-es-un-correo" });

    assert.equal(res.status, 400);
  });
});

describe("cookie de sesión", () => {
  test("se llama `sid`, es HttpOnly y tiene Path=/", async () => {
    const { setCookie } = await login(owner.email, TEST_PASSWORD);
    const raw = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`));

    assert.ok(raw, `no se envió la cookie ${COOKIE_NAME}`);
    assert.equal(COOKIE_NAME, "sid", "el nombre de la cookie cambió");
    assert.match(raw!, /HttpOnly/i, "la cookie NO es HttpOnly: el JS podría leerla");
    assert.match(raw!, /Path=\//i);
  });

  test("declara SameSite", async () => {
    const { setCookie } = await login(owner.email, TEST_PASSWORD);
    const raw = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`))!;

    // En pruebas COOKIE_SAMESITE=lax. En producción con frontend y API en
    // dominios distintos debe ser None+Secure (ver config/env.ts).
    assert.match(raw, /SameSite=/i, "la cookie no declara SameSite");
  });

  test("el valor de la cookie no es el hash guardado en la base", async () => {
    const { setCookie } = await login(owner.email, TEST_PASSWORD);
    const value = sessionCookie(setCookie)!.split("=")[1];

    const sesiones = await prisma.session.findMany({
      where: { userId: owner.id },
      select: { sessionTokenHash: true },
    });

    assert.ok(sesiones.length > 0, "no se creó ninguna sesión");
    for (const s of sesiones) {
      assert.notEqual(
        s.sessionTokenHash,
        value,
        "la base guarda el token tal cual, no su hash"
      );
    }
  });
});

describe("rutas protegidas", () => {
  test("sin cookie, /api/auth/me devuelve 401", async () => {
    const res = await anon().get("/api/auth/me");

    assert.equal(res.status, 401);
    assert.equal(errorCode(res.body), "UNAUTHENTICATED");
  });

  test("con una cookie inventada devuelve 401", async () => {
    const res = await anon()
      .get("/api/auth/me")
      .set("Cookie", `${COOKIE_NAME}=token-falsificado-123`);

    assert.equal(res.status, 401);
  });

  test("con la cookie real devuelve el usuario", async () => {
    const cookie = await loginAs(owner);
    const res = await getAs(cookie, "/api/auth/me");

    assert.equal(res.status, 200);
    const body = res.body as { data?: { email?: string } };
    const email = body.data?.email ?? (res.body as { email?: string }).email;
    assert.equal(email, owner.email);
  });
});

describe("logout", () => {
  test("invalida la sesión: la misma cookie deja de servir", async () => {
    const cookie = await loginAs(owner);

    // La cookie funciona antes...
    assert.equal((await getAs(cookie, "/api/auth/me")).status, 200);

    const out = await anon().post("/api/auth/logout").set("Cookie", cookie);
    assert.equal(out.status, 200);

    // ...y deja de funcionar después. Si esto falla, cerrar sesión no cierra
    // nada: la sesión sigue viva del lado del servidor.
    const after = await getAs(cookie, "/api/auth/me");
    assert.equal(after.status, 401);
  });

  test("marca la sesión como revocada en la base de datos", async () => {
    const cookie = await loginAs(owner);
    await anon().post("/api/auth/logout").set("Cookie", cookie);

    const revocadas = await prisma.session.count({
      where: { userId: owner.id, revokedAt: { not: null } },
    });

    assert.ok(revocadas > 0, "ninguna sesión quedó marcada como revocada");
  });

  test("borra la cookie con los MISMOS atributos con que la creó", async () => {
    // Si `clearCookie` no coincide con `res.cookie` (Path, SameSite, Secure,
    // Domain), el navegador no borra nada y la sesión revive al recargar.
    const { setCookie: alEntrar } = await login(owner.email, TEST_PASSWORD);
    const cookie = sessionCookie(alEntrar)!;
    const puesta = alEntrar.find((c) => c.startsWith(`${COOKIE_NAME}=`))!;

    const out = await anon().post("/api/auth/logout").set("Cookie", cookie);
    const raw = out.headers["set-cookie"];
    const alSalir = (Array.isArray(raw) ? raw : raw ? [raw] : []).find((c) =>
      c.startsWith(`${COOKIE_NAME}=`)
    );

    assert.ok(alSalir, "el logout no envió ninguna cabecera para borrar la cookie");

    const atributos = (c: string) =>
      c
        .split(";")
        .slice(1)
        .map((a) => a.trim().toLowerCase())
        .filter((a) => !a.startsWith("expires=") && !a.startsWith("max-age="))
        .sort();

    assert.deepEqual(
      atributos(alSalir!),
      atributos(puesta),
      "los atributos de borrado no coinciden con los de creación: el navegador no borraría la cookie"
    );
    assert.match(alSalir!, /Expires=Thu, 01 Jan 1970|Max-Age=0/i, "la cookie no se invalida en el navegador");
  });

  test("sin cookie responde 200: cerrar sesión dos veces no rompe nada", async () => {
    const res = await anon().post("/api/auth/logout");
    assert.equal(res.status, 200);
  });

  test("cierra SOLO la sesión usada, no las demás del mismo usuario", async () => {
    const navegador1 = await loginAs(owner);
    const navegador2 = await loginAs(owner);

    await anon().post("/api/auth/logout").set("Cookie", navegador1);

    assert.equal((await getAs(navegador1, "/api/auth/me")).status, 401);
    assert.equal(
      (await getAs(navegador2, "/api/auth/me")).status,
      200,
      "cerrar sesión en un dispositivo cerró también el otro"
    );
  });
});

describe("la cookie en LOCAL", () => {
  test("NO lleva Secure: en http://localhost el navegador la descartaría", async () => {
    // En producción `NODE_ENV=production` la activa (config/env.ts). Aquí, con
    // NODE_ENV=test y sin COOKIE_SECURE, debe venir sin Secure.
    const { setCookie } = await login(owner.email, TEST_PASSWORD);
    const raw = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`))!;

    assert.ok(
      !/;\s*Secure/i.test(raw),
      "la cookie llega con Secure en local: por http nunca se guardaría y nadie podría entrar"
    );
  });

  test("SameSite=Lax en local (el valor de .env.test)", async () => {
    const { setCookie } = await login(owner.email, TEST_PASSWORD);
    const raw = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`))!;

    assert.match(raw, /SameSite=Lax/i, "SameSite dejó de ser Lax en el entorno de pruebas");
  });

  test("declara Max-Age coherente con SESSION_TTL_SECONDS", async () => {
    const { setCookie } = await login(owner.email, TEST_PASSWORD);
    const raw = setCookie.find((c) => c.startsWith(`${COOKIE_NAME}=`))!;
    const maxAge = raw.match(/Max-Age=(\d+)/i);

    assert.ok(maxAge, "la cookie no declara Max-Age: sería de sesión de navegador");
    assert.equal(Number(maxAge![1]), Number(process.env.SESSION_TTL_SECONDS ?? 3600));
  });

  test("la cookie de otro usuario no sirve para leer datos ajenos", async () => {
    const otro = await createTestUser({ role: "OWNER", tenantId, label: "auth-otro" });
    const cookieOtro = await loginAs(otro);

    const res = await getAs(cookieOtro, "/api/auth/me");

    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, otro.email, "la cookie devolvió el usuario equivocado");
    assert.notEqual(res.body.data.email, owner.email);
  });
});
