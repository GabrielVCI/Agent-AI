# LOCAL_QA_RUNBOOK — Orden oficial de ejecución

> Orden obligatorio de una pasada de QA local. Cada fase asume que la anterior
> terminó. Si una fase de bloqueo falla, **se detiene y se reporta**: seguir
> ejecutando sobre una base rota produce fallos en cascada que no significan nada.
>
> Todos los comandos de este documento existen en el repositorio y se verificaron
> el 2026-09-10. No añadir aquí ningún comando sin ejecutarlo antes.

---

## Fase 0 — Preparación (una sola vez por máquina)

```bash
cd backend
cp .env.test.example .env.test     # ajustar la contraseña de PostgreSQL
npm run test:db:setup              # crea y migra ferreteria_ai_agent_test
```

`test:db:setup` es idempotente y nunca borra la base. Comprueba además que el
esquema resultante coincide con `schema.prisma`; si no coincidiera, aborta.

Requisitos: **PostgreSQL 18** en `localhost:5432` y Node con las dependencias
instaladas (`npm install` en `backend/`, `frontend/` y `webpage/`).
Redis es **opcional**: las sesiones viven en PostgreSQL.

---

## Fase 0.5 — Pre-flight · 🚧 bloqueante

Un solo comando que verifica que el repositorio está en condiciones de ser
probado, **antes** de gastar 8 minutos en las suites. Sobre un árbol que no
compila o al que le falta una variable de entorno, los fallos de las fases 4-6
son ruido en cascada.

```bash
node scripts/qa-preflight.mjs        # desde la raíz
cd backend && npm run qa:preflight   # equivalente
```

Ejecuta, en este orden: dependencias · lint · TypeScript · build de backend ·
build de frontend y de webpage · `prisma validate` · `prisma migrate status` ·
variables de entorno · secretos en bundles y en git · configuración básica.

**Exit code 0** = ningún FAIL. **Exit code 1** = al menos uno.

| Variante | Comando | Duración | Cuándo |
|---|---|---|---|
| Completo | `npm run qa:preflight` | ~5-6 min | Antes de una pasada completa |
| Sin builds | `npm run qa:preflight:quick` | ~2 min | Iterando; los builds no cambiaron |
| Solo entorno | `npm run qa:env` | ~10 s | Al cambiar `.env`, o tras clonar |

Opciones sueltas: `--skip-build` · `--skip-lint` · `--skip-types` · `--skip-db`
(no consulta PostgreSQL) · `--json` · `--no-color`.

**Qué NO hace:** no ejecuta ninguna suite de pruebas, no escribe en ninguna base
de datos y no arranca ningún servidor. El único comando que toca PostgreSQL es
`prisma migrate status`, que es de **solo lectura**; se desactiva con `--skip-db`.

**Secretos:** el script nunca imprime el valor de una variable. Solo el nombre y
uno de estos estados: `PRESENT` · `MISSING` · `INVALID CONFIGURATION`. Las URL de
base de datos salen enmascaradas (`postgresql://***@host:5432/base`). Los valores
reales se leen en memoria únicamente para comprobar que **no** aparecen dentro de
`frontend/dist` ni `webpage/dist`; si aparecieran, se reporta el **nombre** de la
variable y el archivo, jamás el valor.

Interpretación de los estados:

| Estado | Significado | ¿Bloquea? |
|---|---|---|
| `PASS` | Se ejecutó y salió como se esperaba | — |
| `FAIL` | Se ejecutó y salió mal | **Sí**: se corrige antes de seguir |
| `WARN` | Deuda conocida, no rompe la pasada | No, pero se anota en el reporte |
| `SKIP` | No se ejecutó (por opción o porque falta un requisito) | No, pero se anota |

Excepción incorporada: el lint del backend tiene una **línea base de 8 errores**
(`QA_RULES.md` §7). El pre-flight lo trata como `WARN`; si aparecen errores
**nuevos**, pasa a `FAIL`. La constante `BACKEND_LINT_ERROR_BASELINE` vive en
`scripts/qa-preflight.mjs` y se baja en cuanto se limpien.

---

## Fase 1 — Auditoría del cambio · 🚧 bloqueante

Sin esto no se sabe qué probar.

```bash
git status --porcelain              # raíz
cd backend  && git status --porcelain
cd frontend && git status --porcelain
```

Recordatorio: los repos anidados hacen que el `git status` de la raíz **no** vea
los cambios internos de `backend/` y `frontend/`.

Con el diff en la mano, se abre `LOCAL_QA_MATRIX.md` y se anotan las áreas
obligatorias para este cambio. Ese es el alcance de la pasada.

---

## Fase 2 — Compilación y tipos · 🚧 bloqueante

> Ya cubierta por la fase 0.5 (`TS-be`, `TS-fe`, `TS-web`). Se ejecuta suelta
> solo si el pre-flight se corrió con `--skip-types`, o para ver los errores de
> tipos completos: el pre-flight solo cuenta cuántos hay.

Lo más barato y lo que más rápido detecta una rotura.

```bash
cd backend  && npm run typecheck    # src + tests + scripts   → se espera exit 0
cd frontend && npx tsc -b           #                          → se espera exit 0
```

⚠️ En el frontend hay *project references*: **`tsc --noEmit` no comprueba nada**.
Hay que usar `tsc -b`.

Si el typecheck falla, se detiene aquí.

---

## Fase 3 — Lint

> Ya cubierta por la fase 0.5 (`LINT-be`, `LINT-fe`, `LINT-web`), que además
> compara el backend contra la línea base de 8 errores. Se ejecuta suelta para
> **leer** los errores, no para saber cuántos hay.

```bash
cd backend  && npm run lint         # exit 1 conocido: 8 errores preexistentes
cd frontend && npm run lint         # se espera 0 errores
cd webpage  && npm run lint         # se espera 0 errores
```

Criterio: **errores nuevos bloquean; los 8 errores preexistentes del backend no**
(revisados uno por uno, ninguno es un bug — `QA_LINT_AND_TYPECHECK.md` §6.2).
Los warnings nunca bloquean.

Para comparar contra la línea base, `npx eslint . --quiet` lista solo errores.

---

## Fase 4 — Pruebas unitarias · 🚧 bloqueante

Rápidas (~5 s) y sin base de datos.

```bash
cd backend && npm run test:unit     # 61 casos
```

Incluye `tests/frontend-auth-storage.test.ts`, que es **estática sobre
`frontend/src`**: comprueba que el panel no guarda credenciales en
`localStorage`/`sessionStorage` y que autentica por cookie, no por cabecera.
Duplica a propósito la regla de ESLint equivalente: un `eslint-disable` puede
apagar la regla, pero no esta prueba.

---

## Fase 5 — Pruebas de integración (PostgreSQL)

Escriben en `ferreteria_ai_agent_test`. ~3 minutos.

```bash
cd backend && npm run test:db       # 112 casos, las 5 suites
```

O solo la que corresponda al módulo tocado:

```bash
npm run test:db:automation     # motor de automatizaciones
npm run test:db:customers      # maestro de clientes
npm run test:db:categories     # categorías
npm run test:db:history        # historial y recurrencias
npm run test:db:maintenance    # mantenimientos
```

---

## Fase 6 — Pruebas HTTP

Montan la app real con Supertest, sin abrir puertos. ~6-7 minutos.

```bash
cd backend && npm run test:http     # 182 casos, las 8 suites
```

O individualmente:

```bash
npm run test:http:auth         # login, cookie sid, logout (21)
npm run test:http:register     # registro self-service (30)
npm run test:http:roles        # roles y permisos (12)
npm run test:http:superadmin   # bypass de paywall y de tenant (12)
npm run test:http:gates        # los 3 gates comerciales vs SUPER_ADMIN (14)
npm run test:http:isolation    # aislamiento entre empresas, módulo a módulo (38)
npm run test:http:agents       # agentes: CRUD, soft delete, número, ownership (24, 2 todo)
npm run test:http:conversations # webhook → IA → humano → bot, agente inactivo (31, 1 todo)
```

**Atajo:** `npm test` ejecuta las fases 4, 5 y 6 seguidas (355 casos).

> **Las suites HTTP no se ejecutan en paralelo.** Todas comparten el prefijo
> `__http_test__` y `cleanupTestData()` borra todo lo que lo lleva: si una
> termina mientras otra corre, le borra las empresas a mitad. `npm run test:http`
> ya las encadena con `&&`.

> **Cómo leer la salida de `agents` y `conversations`:** además de
> `ℹ pass` / `ℹ fail`, mirar **`ℹ todo`**. Cada `todo` es una **falla abierta
> del producto** escrita como prueba (`✖ … # FALLA ABIERTA Fn`): se ejecuta pero
> no rompe el exit code. `ℹ todo 0` es la única lectura verde. Hoy: F2 ×2 y
> F3 ×1 (ver `TEST_INVENTORY.md`).

> OpenAI y Meta **no se llaman**: los sustituye `tests/helpers/external-mocks.ts`,
> que además hace fallar cualquier petición a otro host. Estas suites no
> necesitan credenciales externas ni conexión a internet.

> `test:http:register` crea usuarios de verdad en la base de **pruebas**, con el
> prefijo `__http_test__`, y los borra en el `after()`. No manda ningún correo:
> `.env.test` fija `EMAIL_PROVIDER=log`, que solo escribe un preview.

---

## Fase 7 — Build de front

> Ya cubierta por la fase 0.5 (`BUILD-fe`, `BUILD-web`), que además escanea el
> `dist/` resultante en busca de secretos del backend. Se repite aquí solo si el
> pre-flight se corrió con `--skip-build`, o si el código cambió después.

Es el comando que corre Netlify: si falla aquí, falla el despliegue.

```bash
cd frontend && npm run build
cd webpage  && npm run build
```

---

## Fase 8 — Verificación manual en navegador

Automatizado no hay nada de frontend todavía (no existe runner). Lo que dependa
de la interfaz se comprueba a mano y se anota como
`PROBADO CORRECTAMENTE` **solo** si se observó en pantalla.

```bash
cd backend  && npm run dev     # http://localhost:3002
cd frontend && npm run dev     # http://localhost:5173
```

Recorrido mínimo cuando se toca auth, onboarding o billing:

1. Login con un usuario OWNER → entra al panel.
2. Recargar una ruta profunda (p. ej. `/canales/whatsapp`) → no da 404.
3. Logout → vuelve a `/login` y la sesión no revive al pulsar "atrás".
4. Login con SUPER_ADMIN → entra a `/admin` sin pasar por paywall ni por
   verificación de correo.

En DevTools → Application → Cookies: `sid` debe aparecer con **HttpOnly ✓**.

### 8.1 Lista completa de comprobaciones manuales

Nada de esto tiene prueba automática. El pre-flight y las 206 suites **no lo
cubren**, así que si no se hace a mano, el estado es `NO PROBADO`.

**A · Sesión y acceso** (cubierto parcialmente por `test:http:auth`)

| # | Qué | Cómo se ve que está bien |
|---|---|---|
| A1 | Login OWNER | Entra al panel; `sid` HttpOnly en DevTools |
| A2 | Recarga de ruta profunda (`/canales/whatsapp`) | No da 404 (depende del redirect SPA de Netlify) |
| A3 | Logout y botón "atrás" | Vuelve a `/login`; la sesión no revive |
| A4 | Login SUPER_ADMIN → `/admin` | Entra sin paywall ni verificación de correo |
| A5 | Contraseña incorrecta y usuario inexistente | Mismo mensaje y mismo tiempo (anti-enumeración) |
| A6 | Sesión expirada / cookie borrada a mano | Redirige a `/login`, no pantalla en blanco |

**B · Alta de cliente nuevo** (0 pruebas)

| # | Qué |
|---|---|
| B1 | Registro self-service → correo de verificación (con `EMAIL_PROVIDER=log` sale por consola) |
| B2 | Clic en el enlace de verificación → `emailVerified` pasa a true |
| B3 | Enlace caducado o ya usado → mensaje claro, no 500 |
| B4 | Onboarding completo → el panel deja de mostrar el gate |
| B5 | Login con Google (necesita `GOOGLE_CLIENT_ID`/`SECRET`) |
| B6 | Reset de contraseña de punta a punta |

**C · WhatsApp** (el webhook no tiene ninguna prueba)

| # | Qué |
|---|---|
| C1 | Wizard de conexión, los 5 pasos, en modo manual |
| C2 | Token guardado cifrado: en la base no se lee en claro |
| C3 | `GET` de verificación del webhook con el `verify_token` correcto y con uno incorrecto |
| C4 | `POST` al webhook con firma HMAC válida → se procesa; con firma inválida → se rechaza |
| C5 | Mensaje entrante crea conversación y el agente responde |
| C6 | Audio entrante se transcribe y consume `AUDIO_TRANSCRIPTION` |

> **C3 y C5 ya están automatizados** en `test:http:conversations`, con payloads
> sintéticos y OpenAI/Meta simulados. **C4 no se puede comprobar: el webhook no
> valida la firma** (riesgo R9 de `LAST_QA_REPORT.md`) y hoy procesa igual un
> POST sin firma. C5 contra Meta real sigue siendo manual y
> `PENDIENTE POR CREDENCIALES EXTERNAS`.

**D · Panel de trabajo diario**

| # | Qué |
|---|---|
| D1 | Inbox: etiquetas, asignación, "por responder", perfil del contacto |
| D2 | Citas: crear, reprogramar, completar; exportar a Excel |
| D3 | Catálogo: alta, edición, importación |
| D4 | Clientes: importación CSV/XLSX, categorías, VIP |
| D5 | Dashboard: los contadores cuadran tras crear datos (`?fresh=1` salta la caché) |
| D6 | Paginación y filtros de los listados largos |

**E · Dinero y límites**

| # | Qué |
|---|---|
| E1 | Empresa sin suscripción → paywall; SUPER_ADMIN nunca lo ve |
| E2 | Checkout de LemonSqueezy (o el 503 controlado si no hay credenciales) |
| E3 | Webhook de LemonSqueezy con firma válida e inválida |
| E4 | Contadores de uso al llegar al límite del plan |
| E5 | Minutos de voz: entitlement solo-Enterprise |

**F · Aislamiento entre empresas** (cubierto por HTTP, verificar también en pantalla)

| # | Qué |
|---|---|
| F1 | Usuario de la empresa A no ve datos de la B en ninguna pantalla |
| F2 | Abrir por URL el id de un recurso de otra empresa → 403/404, nunca contenido |

**G · Operación**

| # | Qué |
|---|---|
| G1 | `/integrations`: estado real de cada integración |
| G2 | Panel de soporte `/admin/soporte`: tickets y triage |
| G3 | Reinicio del backend con el worker de automatizaciones encendido: los jobs pendientes se recuperan |

> La base que usa `npm run dev` es la de **desarrollo**, no la de pruebas. Lo que
> se cree a mano ahí queda ahí.

---

## Fase 9 — Reporte · 🚧 obligatorio

1. Copiar `QA_REPORT_TEMPLATE.md`.
2. Rellenarlo con los comandos, exit codes y conteos **reales**, incluyendo el
   resumen del pre-flight (`PASS / FAIL / WARN / SKIP` y su exit code). Para
   pegarlo tal cual: `node scripts/qa-preflight.mjs --no-color`.
3. Guardar el resultado en `LAST_QA_REPORT.md`.
4. Si la pasada cambió el sistema de QA (nuevas suites, scripts o reglas),
   añadir la entrada correspondiente en `QA_CHANGELOG.md`.

Un reporte sin exit codes no sirve: es lo único que distingue una ejecución de
una impresión.

---

## Resumen ejecutable

```bash
# 1. pre-flight: dependencias, lint, tipos, builds, prisma, entorno, secretos
node scripts/qa-preflight.mjs        # exit 0 obligatorio para continuar

# 2. suites (fases 4-6)
cd backend && npm test               # 355 casos (mirar también "ℹ todo")
```

Equivalente manual del pre-flight, si se quiere ver cada comando por separado
(es lo que el script ejecuta por dentro):

```bash
cd backend  && npm run typecheck && npm run lint ; npm run build
cd frontend && npx tsc -b && npm run lint && npm run build
cd webpage  && npx tsc -b && npm run lint && npm run build
cd backend  && npx prisma validate && npx prisma migrate status
```

> El `;` antes de `npm run build` es deliberado: `npm run lint` del backend
> devuelve exit 1 por los errores preexistentes y con `&&` cortaría la cadena.
> El script no tiene ese problema: distingue los 8 errores de línea base de los
> nuevos.

**Duración aproximada:** ~6 minutos el pre-flight (casi todo en los builds) +
~8 minutos las suites.
