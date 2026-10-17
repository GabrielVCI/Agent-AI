/**
 * Pruebas HTTP del registro self-service: POST /api/auth/register.
 *
 * Es la puerta de entrada de todo cliente nuevo y hasta ahora no tenía ninguna
 * prueba (hueco #4 de TEST_INVENTORY).
 *
 * Comportamiento REAL verificado aquí (leído en
 * `src/services/auth.service.ts` → `registerUser` y confirmado ejecutando):
 *   · El registro NO crea empresa: el usuario nace con `tenantId: null` y rol
 *     OWNER. La empresa la crea el onboarding después.
 *   · `emailVerifiedAt` queda null: el flujo comercial exige verificar.
 *   · Devuelve 201 y ya deja la sesión iniciada (cookie `sid`).
 *   · El correo de verificación NUNCA rompe el registro; en pruebas
 *     `EMAIL_PROVIDER=log` solo escribe un preview, no sale nada a internet.
 *
 * Ejecutar: npm run test:http:register
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../../src/config/prisma.js";
import { closeRedis } from "../../src/config/redis.js";
import { cleanupTestData, PREFIX } from "../helpers/factories.js";
import { anon, COOKIE_NAME, sessionCookie } from "../helpers/http.js";

/** Contraseña que cumple TODAS las reglas de `strongPassword`. */
const VALID_PASSWORD = "Prueba-Local-1234";

/** Correo con el prefijo de prueba: `cleanupTestData()` lo borra por él. */
function testEmail(label: string): string {
  return `${PREFIX}register-${label}-${Date.now()}${Math.floor(Math.random() * 1000)}@example.test`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: `${PREFIX}Nombre`,
    lastName: "Apellido",
    email: testEmail("ok"),
    password: VALID_PASSWORD,
    confirmPassword: VALID_PASSWORD,
    ...overrides,
  };
}

function register(payload: Record<string, unknown>) {
  return anon().post("/api/auth/register").send(payload);
}

before(async () => {
  // Nada que preparar: cada caso crea lo suyo. Se limpia por prefijo al final.
});

after(async () => {
  await cleanupTestData();
  await closeRedis();
  await prisma.$disconnect();
});

describe("registro correcto", () => {
  test("devuelve 201 con los datos de la cuenta creada", async () => {
    const payload = validPayload();
    const res = await register(payload);

    assert.equal(res.status, 201, `respuesta inesperada: ${JSON.stringify(res.body)}`);
    const data = res.body?.data;
    assert.ok(data, "la respuesta no trae data");
    assert.equal(data.email, payload.email.toLowerCase());
    assert.equal(data.role, "OWNER");
    assert.equal(data.emailVerified, false, "una cuenta nueva no puede nacer verificada");
  });

  test("el usuario queda en la base con rol OWNER y SIN empresa", async () => {
    const payload = validPayload();
    await register(payload);

    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { role: true, tenantId: true, status: true, emailVerifiedAt: true, passwordHash: true },
    });

    assert.ok(user, "el usuario no se guardó");
    assert.equal(user!.role, "OWNER");
    // Documentado: la empresa la crea el ONBOARDING, no el registro.
    assert.equal(user!.tenantId, null, "el registro no debe crear empresa todavía");
    assert.equal(user!.status, "ACTIVE");
    assert.equal(user!.emailVerifiedAt, null, "el correo no puede quedar verificado solo");
  });

  test("la contraseña se guarda hasheada, nunca en claro", async () => {
    const payload = validPayload();
    await register(payload);

    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { passwordHash: true },
    });

    assert.ok(user?.passwordHash, "no se guardó ningún hash");
    assert.notEqual(user!.passwordHash, VALID_PASSWORD, "¡la contraseña está en claro!");
    assert.match(user!.passwordHash!, /^\$2[aby]\$/, "el hash no parece bcrypt");
  });

  test("deja la sesión iniciada: cookie sid HttpOnly y /api/auth/me responde", async () => {
    const payload = validPayload();
    const res = await register(payload);

    const raw = res.headers["set-cookie"];
    const setCookie = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cookieRaw = setCookie.find((c: string) => c.startsWith(`${COOKIE_NAME}=`));

    assert.ok(cookieRaw, `el registro no envió la cookie ${COOKIE_NAME}`);
    assert.match(cookieRaw!, /HttpOnly/i);

    const cookie = sessionCookie(setCookie)!;
    const me = await anon().get("/api/auth/me").set("Cookie", cookie);

    assert.equal(me.status, 200);
    assert.equal(me.body.data.email, payload.email.toLowerCase());
    assert.equal(me.body.data.tenantId, null);
  });

  test("el token de sesión no viaja en el cuerpo de la respuesta", async () => {
    const res = await register(validPayload());
    const body = JSON.stringify(res.body);

    assert.ok(!body.includes("sessionToken"), "el cuerpo menciona sessionToken");
    assert.ok(!/"token"\s*:/.test(body), "el cuerpo devuelve un token");
  });

  test("emite un token de verificación de un solo uso y guarda solo su hash", async () => {
    const payload = validPayload();
    await register(payload);

    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { id: true, emailVerificationSentAt: true },
    });
    const tokens = await prisma.emailVerificationToken.findMany({
      where: { userId: user!.id },
      select: { tokenHash: true, usedAt: true, expiresAt: true },
    });

    assert.equal(tokens.length, 1, "debe existir exactamente un token activo");
    assert.equal(tokens[0].usedAt, null);
    assert.ok(tokens[0].expiresAt.getTime() > Date.now(), "el token nace caducado");
    assert.ok(tokens[0].tokenHash.length >= 32, "el hash es demasiado corto");
    assert.ok(user!.emailVerificationSentAt, "no se registró el envío");
  });

  test("el correo se normaliza a minúsculas", async () => {
    const email = testEmail("mayus").toUpperCase();
    const res = await register(validPayload({ email }));

    assert.equal(res.status, 201);
    assert.equal(res.body.data.email, email.toLowerCase());
  });
});

describe("email duplicado", () => {
  test("un segundo registro con el mismo correo devuelve 409", async () => {
    const payload = validPayload();

    const primero = await register(payload);
    assert.equal(primero.status, 201);

    const segundo = await register({ ...payload, email: payload.email });
    assert.equal(segundo.status, 409, `se permitió duplicar el correo: ${JSON.stringify(segundo.body)}`);
  });

  test("el duplicado no crea un segundo usuario ni una segunda sesión", async () => {
    const payload = validPayload();
    await register(payload);
    const res = await register(payload);

    const usuarios = await prisma.user.count({ where: { email: payload.email.toLowerCase() } });
    assert.equal(usuarios, 1, "se crearon dos usuarios con el mismo correo");

    const raw = res.headers["set-cookie"];
    const setCookie = Array.isArray(raw) ? raw : raw ? [raw] : [];
    assert.equal(
      setCookie.filter((c: string) => c.startsWith(`${COOKIE_NAME}=`)).length,
      0,
      "un registro rechazado no puede devolver sesión"
    );
  });

  test("distingue mayúsculas: MISMO@correo también choca", async () => {
    const payload = validPayload();
    await register(payload);

    const res = await register({ ...payload, email: payload.email.toUpperCase() });
    assert.equal(res.status, 409, "el correo en mayúsculas esquivó la unicidad");
  });
});

describe("payload incompleto", () => {
  const camposObligatorios = ["name", "lastName", "email", "password", "confirmPassword"] as const;

  for (const campo of camposObligatorios) {
    test(`sin "${campo}" devuelve 400`, async () => {
      const payload = validPayload();
      delete (payload as Record<string, unknown>)[campo];

      const res = await register(payload);
      assert.equal(res.status, 400, `faltando ${campo} respondió ${res.status}`);
      assert.equal(res.body.success, false);
    });
  }

  test("cuerpo vacío devuelve 400, no 500", async () => {
    const res = await register({});
    assert.equal(res.status, 400);
  });

  test("el 400 detalla qué campo falla, sin filtrar nada más", async () => {
    const res = await register(validPayload({ email: "esto-no-es-un-correo" }));

    assert.equal(res.status, 400);
    assert.ok(res.body.errors?.email, "no dice que el problema es el email");
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes(VALID_PASSWORD), "¡el error devuelve la contraseña!");
  });
});

describe("validaciones existentes", () => {
  const passwordsDebiles: Array<[string, string]> = [
    ["corta", "Ab1-x"],
    ["sin mayúscula", "prueba-local-1234"],
    ["sin minúscula", "PRUEBA-LOCAL-1234"],
    ["sin número", "Prueba-Local-Abcd"],
    ["sin símbolo", "PruebaLocal1234"],
  ];

  for (const [motivo, password] of passwordsDebiles) {
    test(`contraseña ${motivo} → 400`, async () => {
      const res = await register(validPayload({ password, confirmPassword: password }));

      assert.equal(res.status, 400, `se aceptó una contraseña ${motivo}`);
      assert.ok(res.body.errors?.password, "el error no señala el campo password");
    });
  }

  test("confirmPassword distinta → 400 señalando confirmPassword", async () => {
    const res = await register(
      validPayload({ password: VALID_PASSWORD, confirmPassword: `${VALID_PASSWORD}x` })
    );

    assert.equal(res.status, 400);
    assert.ok(res.body.errors?.confirmPassword, "no señala confirmPassword");
  });

  test("nombre de una sola letra → 400", async () => {
    const res = await register(validPayload({ name: "A" }));
    assert.equal(res.status, 400);
  });

  test("apellido de una sola letra → 400", async () => {
    const res = await register(validPayload({ lastName: "B" }));
    assert.equal(res.status, 400);
  });

  test("un rechazo por validación no crea ningún usuario", async () => {
    const email = testEmail("rechazado");
    await register(validPayload({ email, password: "debil", confirmPassword: "debil" }));

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    assert.equal(user, null, "un registro inválido creó el usuario igualmente");
  });

  test("el rol NO se puede elegir desde el payload", async () => {
    const payload = validPayload();
    const res = await register({ ...payload, role: "SUPER_ADMIN" });

    assert.equal(res.status, 201);
    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { role: true },
    });
    assert.equal(user!.role, "OWNER", "🚨 escalada de privilegios: el payload fijó el rol");
  });

  test("el tenantId NO se puede elegir desde el payload", async () => {
    const payload = validPayload();
    const res = await register({ ...payload, tenantId: "tenant-inventado" });

    assert.equal(res.status, 201);
    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { tenantId: true },
    });
    assert.equal(user!.tenantId, null, "🚨 el payload metió al usuario en una empresa");
  });
});

describe("el usuario recién registrado puede iniciar sesión", () => {
  test("login con las credenciales del registro devuelve 200", async () => {
    const payload = validPayload();
    await register(payload);

    const res = await anon()
      .post("/api/auth/login")
      .send({ email: payload.email, password: VALID_PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, "OWNER");
    assert.equal(res.body.data.tenantId, null);
  });

  test("login con otra contraseña sigue fallando", async () => {
    const payload = validPayload();
    await register(payload);

    const res = await anon()
      .post("/api/auth/login")
      .send({ email: payload.email, password: `${VALID_PASSWORD}-mal` });

    assert.equal(res.status, 401);
  });
});
