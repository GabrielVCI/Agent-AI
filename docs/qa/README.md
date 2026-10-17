# Sistema de QA local — Sendwary

> # ⛔ LEE ESTO ANTES DE EJECUTAR NADA
>
> **Este es el PRIMER documento que debe leer cualquier AI QA Reviewer o persona
> que vaya a probar Sendwary, antes de ejecutar una sola prueba.**
>
> Si acabas de entrar al repositorio: no ejecutes comandos, no toques la base de
> datos y no marques nada como probado hasta haber leído este archivo y
> `QA_RULES.md`.

**Última actualización:** 2026-09-10 · **Entorno disponible:** solo LOCAL

---

## En 30 segundos

Sendwary tiene **300 pruebas automatizadas, todas verdes** (verificado el
2026-09-10). Cubren lógica de negocio, persistencia, registro, login, cookies,
roles, el invariante de SUPER_ADMIN frente a los tres gates comerciales y el
aislamiento entre empresas módulo a módulo. **No cubren** el frontend
(0 pruebas funcionales), el webhook de WhatsApp, el webhook de billing ni el
onboarding.

```bash
# preparación, una vez por máquina
cd backend && cp .env.test.example .env.test   # ajustar contraseña de PostgreSQL
npm run test:db:setup

# la pasada completa
node scripts/qa-preflight.mjs   # fase 0.5: dependencias, lint, tipos, builds,
                                # prisma, entorno, secretos y configuración
cd backend && npm test          # fases 4-6: 300 casos
```

El **pre-flight** (`scripts/qa-preflight.mjs`, también `npm run qa:preflight`
desde `backend/`) no ejecuta ninguna prueba ni escribe en ninguna base: solo
verifica que el repositorio está en condiciones de ser probado. Devuelve exit 0
si no hay ningún `FAIL`. Variantes: `npm run qa:preflight:quick` (sin builds,
~2 min) y `npm run qa:env` (solo entorno y secretos, ~10 s).

> El lint del backend devuelve exit 1 por 8 errores preexistentes; el pre-flight
> los reconoce como línea base y solo falla si aparecen **nuevos**. Explicado en
> `QA_RULES.md` §7.

---

## Las tres reglas que no se negocian

**1. `PROBADO CORRECTAMENTE` solo si se ejecutó y hay evidencia.**
Leer código no es probar. Si no lo ejecutaste, el estado es `NO PROBADO`.

**2. Nunca "debería funcionar".**
Ni "parece correcto", ni "seguramente funciona". Existen ocho estados y ninguno
es una impresión.

**3. Nunca se resetea la base de datos ni se toca producción para tapar un fallo.**

Las reglas completas están en **[QA_RULES.md](QA_RULES.md)**. Léelo entero: es
corto y es vinculante.

---

## Orden de lectura

| # | Documento | Cuándo |
|---|---|---|
| 1 | **README.md** (este) | Siempre, primero |
| 2 | **[QA_RULES.md](QA_RULES.md)** | Siempre, antes de ejecutar |
| 3 | **[LOCAL_QA_MATRIX.md](LOCAL_QA_MATRIX.md)** | Al saber qué cambió: decide **qué** probar |
| 4 | **[LOCAL_QA_RUNBOOK.md](LOCAL_QA_RUNBOOK.md)** | Al ejecutar: dice **en qué orden** |
| 5 | **[QA_REPORT_TEMPLATE.md](QA_REPORT_TEMPLATE.md)** | Al terminar: formato del reporte |

De consulta, cuando hagan falta:

| Documento | Responde a |
|---|---|
| **[TEST_INVENTORY.md](TEST_INVENTORY.md)** | ¿Qué pruebas existen, dónde y qué cubren? |
| **[ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md)** | ¿Qué se puede probar en local y qué no? |
| **[LAST_QA_REPORT.md](LAST_QA_REPORT.md)** | ¿Cómo salió la última pasada? |
| **[QA_CHANGELOG.md](QA_CHANGELOG.md)** | ¿Cómo llegó el sistema de QA hasta aquí? |

Documentos técnicos de cada pieza (el *cómo* y el *por qué*):

| Documento | Contenido |
|---|---|
| **[QA_INITIAL_AUDIT.md](QA_INITIAL_AUDIT.md)** | Auditoría del estado real. Los hallazgos H1–H5 y riesgos R1–R13 |
| **[QA_TEST_DATABASE.md](QA_TEST_DATABASE.md)** | Base de pruebas, baseline de migraciones, recetas de recuperación |
| **[QA_DATABASE.md](QA_DATABASE.md)** | QA de base de datos: migraciones, drift, integridad, constraints, carreras. Fallas F4–F5, riesgos R14–R19 |
| **[QA_LINT_AND_TYPECHECK.md](QA_LINT_AND_TYPECHECK.md)** | Lint y typecheck: qué estaba roto, criterio de severidad |
| **[QA_HTTP_TESTS.md](QA_HTTP_TESTS.md)** | Pruebas HTTP: cómo están hechas y por qué así |

---

## Flujo de una pasada de QA

```
0. Pre-flight               node scripts/qa-preflight.mjs → exit 0 obligatorio
        ↓                   (sin esto, los fallos de las suites son ruido)
1. Auditar el diff          git status en la raíz Y en backend/ y frontend/
        ↓                   (hay repos git anidados: la raíz no lo ve todo)
2. Elegir el alcance        LOCAL_QA_MATRIX.md → qué áreas exige este cambio
        ↓
3. Ejecutar                 LOCAL_QA_RUNBOOK.md → 9 fases, en orden
        ↓
4. Registrar                comandos + exit codes + status HTTP + conteos
        ↓
5. Reportar                 QA_REPORT_TEMPLATE.md → guardar en LAST_QA_REPORT.md
        ↓
6. Si cambió el QA          añadir entrada en QA_CHANGELOG.md
```

---

## Los ocho estados

Son los únicos válidos. No se inventan variantes.

`PROBADO CORRECTAMENTE` · `FALLA DETECTADA` · `PROBADO PARCIALMENTE` ·
`NO PROBADO` · `PENDIENTE POR CREDENCIALES EXTERNAS` ·
`PENDIENTE POR AMBIENTE PÚBLICO` · `NO VERIFICABLE EN LOCAL` · `RIESGO DETECTADO`

Definición de cada uno en `QA_RULES.md` §1.

---

## Cinco fallos que detienen la pasada

Si ocurre cualquiera de estos, **se para y se avisa de inmediato**:

1. Una prueba escribió en la base de **desarrollo**.
2. Un secreto apareció en una respuesta, un log o un reporte.
3. Un usuario de una empresa accedió a datos de **otra**.
4. Un `SUPER_ADMIN` quedó bloqueado por paywall, verificación o implementación.
5. El login o el registro dejaron de funcionar.

Todo lo demás se anota y la ejecución continúa hasta el final.

---

## Estado actual, sin adornos

**Lo que está cubierto** (300 casos verdes, 2026-09-10)

| Capa | Casos | Comando |
|---|---|---|
| Unitarias | 61 | `npm run test:unit` |
| Integración (PostgreSQL) | 112 | `npm run test:db` |
| HTTP (Supertest) | 127 | `npm run test:http` |

Áreas en verde: **Registro · Login · Cookies · Roles · SUPER_ADMIN (backend,
incluidos los tres gates comerciales) · Aislamiento entre empresas · Prisma**.

**Lo que NO está cubierto**

- **Frontend: 0 pruebas funcionales.** No existe runner. 32 páginas, 41
  componentes. Lo único automatizado es una prueba **estática** que garantiza
  que no guarda credenciales en `localStorage`/`sessionStorage`.
- **Webhook de WhatsApp: 0 pruebas.** Entrada pública que valida firma HMAC.
  Es el mayor riesgo abierto, y se puede cubrir en local con payloads sintéticos.
- **Webhook de LemonSqueezy** (firma, cambios de plan), **onboarding**,
  **recuperación de contraseña**, uso del enlace de **verificación de correo**,
  **runtime de agentes** y la lógica (no el aislamiento) de **conversations**.
- **34 de 226 endpoints** tienen prueba HTTP.
- **No hay CI.** No existe `.github/`; ni Railway ni Netlify ejecutan pruebas
  antes de desplegar.
- **No se mide cobertura.**

**Excepción conocida:** `cd backend && npm run lint` devuelve **exit 1** por 8
errores de estilo preexistentes. Se revisaron uno por uno y **ninguno es un bug**
(`QA_LINT_AND_TYPECHECK.md` §6.2). No bloquea, pero errores **nuevos** sí.

---

## Datos del entorno local

| | |
|---|---|
| Base de desarrollo | `ferreteria_ai_agent` — **nunca se borra** |
| Base de pruebas | `ferreteria_ai_agent_test` — se recrea con `npm run test:db:setup` |
| Base *shadow* | `ferreteria_ai_agent_shadow` — Prisma la vacía sola |
| PostgreSQL | 18.3 en `localhost:5432` |
| Binarios de psql | `C:\Program Files\PostgreSQL\18\bin` ⚠️ el `psql` del PATH es 10.7 e **incompatible** |
| Backend | `npm run dev` → puerto 3002 |
| Panel | `npm run dev` → puerto 5173 |
| Redis | Opcional: las sesiones viven en PostgreSQL |

La guarda `backend/tests/setup/use-test-db.ts` aborta cualquier suite que apunte
a una base cuyo nombre no termine en `_test`. Es la única barrera entre las
pruebas y tus datos de desarrollo: **no la quites ni la esquives**.

---

## Si vas a escribir pruebas nuevas

1. Carga la guarda: `--import ./tests/setup/use-test-db.ts`.
2. Usa los helpers de `tests/helpers/` en vez de duplicar factories.
3. Prefija los datos (`__http_test__`) y bórralos en el `after()`.
4. Prueba todo bypass **por contraste**: el caso que sí debe bloquearse, el que
   no, y el excepcional. Sin el primero, un control que no aplica nada produce un
   falso verde.
5. Afirma sobre códigos de error (`error.code`), no sobre textos de mensajes.
6. Si falta la base de datos, la suite **falla**; nunca "pasa" saltándose.
7. Actualiza `TEST_INVENTORY.md` y `QA_CHANGELOG.md` en el mismo cambio.
