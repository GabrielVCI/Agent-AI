# Sendwary — Pruebas HTTP (Supertest)

> **Creado:** 2026-09-09 · Paso 5 del plan de QA (`QA_INITIAL_AUDIT.md` §13).
> Ataca el hallazgo **H3**: 226 endpoints sin una sola prueba, y ninguna
> verificación de los middlewares de autenticación, roles y paywall.

---

## 1. Comandos

```bash
cd backend
npm run test:http              # las 6 suites (127 casos)
npm run test:http:auth         # login, cookie sid, logout
npm run test:http:register     # registro self-service
npm run test:http:roles        # requireRole, aislamiento entre empresas
npm run test:http:superadmin   # el invariante de SUPER_ADMIN
npm run test:http:gates        # SUPER_ADMIN vs los 3 gates comerciales
npm run test:http:isolation    # aislamiento entre empresas, módulo a módulo
npm test                       # unit + integración + HTTP (300 casos)
```

Requieren la base de pruebas del paso 2 (`npm run test:db:setup`). Pasan por la
misma guarda: si `DATABASE_URL` no termina en `_test`, abortan.

---

## 2. Qué se cubrió

> Esta sección describe el **paso 5 (2026-09-09)**, cuando nacieron las tres
> primeras suites. Las tres añadidas el 2026-09-10 (`register`, `gates`,
> `isolation`) están en `TEST_INVENTORY.md` y en §5 de este documento.

**38 casos nuevos**, todos verdes.

| Suite | Casos | Cubre |
|---|---|---|
| `auth.http.test.ts` | 14 | Login, anti-enumeración de usuarios, atributos de la cookie, sesión revocada al salir |
| `roles.http.test.ts` | 12 | `requireAuth`, `requireRole`, `requireSuperAdmin`, aislamiento entre empresas |
| `superadmin.http.test.ts` | 12 | El invariante de SUPER_ADMIN frente a paywall, empresa y verificación |

### Invariantes que ahora tienen prueba de regresión

Antes solo estaban escritos en `LOCKED_DECISIONS.md`. Ahora fallan solos si se rompen:

- La cookie se llama `sid`, es **HttpOnly** y tiene `Path=/`.
- **El token de sesión nunca viaja en el cuerpo** de la respuesta de login.
- La base guarda el **hash** del token, no el token.
- Un correo inexistente y una contraseña incorrecta dan **respuestas
  indistinguibles** (salvo el `traceId`, que es único por petición a propósito).
- Un usuario `DISABLED` no puede entrar.
- El logout **revoca la sesión del lado del servidor**: la misma cookie deja de
  servir (no basta con borrarla en el navegador).
- Un `AGENT_OPERATOR` no puede crear agentes; un `OWNER` y un `ADMIN` sí.
- **`ADMIN` ≠ `SUPER_ADMIN`**: un ADMIN de empresa no entra al panel de
  administración.
- Sin sesión, una ruta de administración responde **401, no 403** (primero quién
  eres, después qué puedes).
- **Una empresa no ve los agentes de otra**, ni listándolos ni pidiendo uno por
  su id directamente.
- **SUPER_ADMIN atraviesa el paywall** y **`requireTenantAccess`**, con y sin el
  correo verificado.

---

## 3. Cómo están hechas

**Sin abrir puertos.** Se importa `app` desde `src/app.ts`, nunca `server.ts`.
Es la razón por la que las pruebas no arrancan el worker de automatizaciones:
`startAutomationWorker()` vive en `server.ts`. La guarda además fija
`AUTOMATION_WORKER_ENABLED=false` como segunda barrera.

**Autenticación real.** No se falsifica `req.user` ni se firma un token a mano:
cada prueba hace un `POST /api/auth/login` de verdad y reenvía la cookie que
devuelve el servidor. Si el login se rompe, estas pruebas se enteran.

**Helpers** (base del paso 4, construida aquí porque sin ella no hay pruebas HTTP):

| Archivo | Qué aporta |
|---|---|
| `tests/helpers/factories.ts` | `createTestTenant`, `createTestUser`, `createTenantWithOwner`, `giveActiveSubscription`, `cleanupTestData` |
| `tests/helpers/http.ts` | `login`, `loginAs`, `getAs`, `postAs`, `errorCode`, `middlewareApp`, `probe` |

Todo lo creado lleva el prefijo `__http_test__` y se borra en el `after()`. El
borrado filtra **siempre** por ese prefijo: no puede alcanzar datos que no creó.

**Se afirma sobre códigos de error, no sobre textos.** El backend responde
`{message, error:{code}}`, así que las pruebas comprueban `UNAUTHENTICATED`,
`FORBIDDEN` o `TENANT_REQUIRED`. Mejorar la redacción de un mensaje no rompe
ninguna prueba.

---

## 4. Por qué el invariante de SUPER_ADMIN se prueba con middlewares aislados

Es la decisión de diseño más importante de esta suite, y viene de un error real
cometido al escribirla.

La primera versión probaba `POST /api/agents` con un SUPER_ADMIN y esperaba que
**no** diera 403. Dio 403 — pero **no por el paywall**: lo frenaba
`requireRole("OWNER","ADMIN")`, que no incluye SUPER_ADMIN, mucho antes de
llegar a `checkPlanLimit`. La prueba parecía verificar el paywall y en realidad
no lo tocaba: habría seguido en rojo aunque el bypass funcionara, y en verde
aunque desapareciera.

Por eso el helper `middlewareApp()` monta una app mínima con **los middlewares
reales** y un handler que responde 200. Cuando esa app responde 403, hay una sola
explicación posible.

Cada bypass se prueba **por contraste**, con tres casos:

```
empresa SIN suscripción  → 403   (si esto no falla, el control no está aplicando)
empresa CON suscripción  → 200   (el control no frena de más)
SUPER_ADMIN sin nada     → 200   ← el invariante
```

El primer caso es el que impide un falso verde: sin él, un paywall que dejara
pasar a todo el mundo también dejaría pasar al SUPER_ADMIN, y la prueba estaría
verde por la razón equivocada.

---

## 5. Hallazgos de comportamiento (no son bugs)

Al escribir las pruebas se comprobó lo que hace el sistema de verdad. Nada de
esto contradice los invariantes, pero conviene tenerlo escrito:

**Un SUPER_ADMIN recibe 403 en las rutas de empresa.** `GET /api/agents`
responde *"Empresa no identificada"* — y lo da el **controlador**, no el
middleware (`requireTenantAccess` sí hace el bypass; si no lo hiciera, el código
sería `TENANT_REQUIRED`). Es coherente: sin empresa, no hay agentes que listar.
El equipo administra desde `/api/admin/*`. El invariante habla de paywall,
verificación e implementación — no de acceder a datos de una empresa concreta
sin decir cuál.

**`requireRole` no incluye a SUPER_ADMIN en ninguna ruta de empresa.** Con la
arquitectura actual es correcto, pero significa que **el paywall nunca llega a
evaluarse para un SUPER_ADMIN por vía HTTP normal**. Si algún día se quiere que
el equipo opere dentro de una empresa (soporte asistido, por ejemplo), habrá que
añadir SUPER_ADMIN a esos `requireRole` — y entonces el bypass del paywall
empezará a importar de verdad en producción. La prueba ya está escrita para ese
día.

**Un correo con formato inválido da 400, no 401.** Lo corta la validación de
entrada antes de consultar nada. No filtra información: 400 significa "esto no
es un correo", no "este correo no existe".

### Añadidos el 2026-09-10, al escribir register, gates e isolation

**El registro NO crea empresa.** `POST /api/auth/register` deja al usuario con
`tenantId: null`, rol `OWNER` y `emailVerifiedAt: null`, y ya inicia sesión
(201 + cookie). La empresa la crea el **onboarding**. Una prueba que espere un
tenant recién registrado está mal escrita.

**Un recurso de otra empresa responde 404, no 403.** Es deliberado: un 403
confirmaría que el id existe. Las pruebas de aislamiento aceptan 403 o 404 y
fallan con cualquier 2xx — así siguen siendo válidas si algún día se cambia de
criterio.

**`GET /api/integrations/whatsapp` devuelve el `verifyToken` del tenant.** No es
una fuga: es el valor que el cliente pega en el panel de Meta. `toPublic()` lo
incluye a propósito y excluye el access token (solo `hasToken` y
`tokenLastFour`). La primera versión de la prueba lo daba por fallo; se corrigió
**la prueba**. Lo que sí sería un fallo es ver el `verifyToken` de **otra**
empresa, y eso es lo que se comprueba ahora.

**`?tenantId=` solo lo honra un SUPER_ADMIN.** `resolveTenantId()` ignora el
parámetro para cualquier otro rol y usa el tenant de la sesión, así que un OWNER
que lo manipule sigue viendo lo suyo (200 con sus datos, no un 403).

**El rate limiting está apagado en pruebas por código**, no solo por `.env.test`:
`makeLimiter()` lleva `skip: NODE_ENV === "test"`. Por eso 30 registros seguidos
no reciben ningún 429 — y por eso ninguna suite puede ejercitar el limitador tal
como está hoy.

**La cookie de sesión llega SIN `Secure` en local.** Es lo correcto: en
`http://localhost` el navegador descartaría una cookie `Secure` y nadie podría
iniciar sesión. En producción la activa `NODE_ENV=production`.

---

## 6. Estado tras el paso 5 **[VERIFICADO ejecutando]**

```
npm test  →  206 casos, 206 verdes, 0 fallos

  56  unitarias        (sin base de datos)
 112  integración      (5 módulos de negocio)
  38  HTTP             ← nuevas
```

**Estado al 2026-09-10, tras la suite de auth / gates / aislamiento**
**[VERIFICADO ejecutando]**

```
npm test  →  300 casos, 300 verdes, 0 fallos

  61  unitarias        (incluye la estática del frontend)
 112  integración      (5 módulos de negocio)
 127  HTTP             (6 suites: auth 21 · register 30 · roles 12 ·
                        superadmin 12 · gates 14 · isolation 38)
```

`npm run typecheck` (que desde el paso 3 incluye `tests/`) pasa limpio con el
código nuevo. El lint no suma ni un problema nuevo.

---

## 7. Lo que sigue sin cubrirse

De los 226 endpoints, estas suites tocan **34**. Sigue **sin ninguna prueba**
(actualizado el 2026-09-10):

| Área | Nota |
|---|---|
| **Billing (escrituras)** | Firma HMAC del webhook de LemonSqueezy, cambios de plan, contadores. Las **lecturas** y su aislamiento ya están cubiertas |
| **Onboarding** | Creación de la empresa y transiciones de `lifecycleStatus`. La **lectura** de `activation-status` ya está cubierta por `test:http:gates` |
| **WhatsApp** | Webhook de Meta: verificación, firma y parseo de payloads |
| **Conversations / Inbox** | Etiquetas, asignación, estados. Solo está cubierto su **aislamiento** |
| **Agents (runtime)** | Requiere simular OpenAI — no hay mocks todavía |
| **Google OAuth** | El flujo de Google. El **registro local** ya está cubierto (30 casos) |
| **Reset de contraseña y uso del enlace de verificación** | Los tokens y su caducidad |
| **Aislamiento de knowledge, automations, quotes, voice, maintenance** | El patrón de 4 casos ya existe; falta repetirlo en estos cinco |
| **Frontend completo** | 0 pruebas funcionales: sigue sin runner (Vitest + RTL). Lo único automatizado es la prueba **estática** de almacenamiento |

El siguiente hueco por tamaño y riesgo es el **webhook de WhatsApp**: es
entrada pública, valida firma HMAC y no tiene ninguna prueba. Se puede cubrir
entera con payloads sintéticos, sin tocar Meta.
