# Reporte de QA local — Sendwary

**Fecha:** 2026-09-14
**Ejecutado por:** Claude Code (sesión de la suite de agents / conversations / intervención humana)
**Entorno:** LOCAL
**Rama:** `main`
**Commit / estado del árbol:** árbol **sucio**, heredado: ~90 rutas en la raíz y
21 en `backend/` antes de empezar. Esta pasada solo añade **código de pruebas y
documentación**: 4 archivos nuevos en `backend/tests/`, 3 modificados
(`package.json`, `tests/helpers/factories.ts`, `tests/helpers/http.ts`) y los
documentos de `docs/qa/`. **Ningún archivo de `src/` cambió.**

**Alcance:** AGENTS · CONVERSATIONS · ESTADOS · HUMAN TAKEOVER · AGENT INACTIVE.
Filas de `LOCAL_QA_MATRIX.md`: Agents, Conversations/Inbox, WhatsApp (entrada),
Tenants.

---

## ⛔ Pasada DETENIDA — invariante 3 de `QA_RULES.md` §6

**F2** se confirmó ejecutando: el OWNER de una empresa puede asignar a su agente
el número de WhatsApp de **otra** empresa por `PUT /api/agents/:id` (→ **200**),
y a partir de ahí el webhook le entrega **a él** los mensajes de los clientes de
la otra empresa. Es "un usuario de una empresa accedió a datos de otra".

Aplicando §6, tras confirmarlo **no se ejecutó ninguna suite más**: ni la
regresión completa (`npm test`) ni una re-ejecución de las suites nuevas. Solo
se hicieron comprobaciones estáticas o de solo lectura sobre lo entregado
(typecheck, lint, residuos en la base de desarrollo) y esta documentación.

---

## 1. Veredicto

| | |
|---|---|
| **Resultado global** | `FALLA DETECTADA` |
| **¿Apto para pasar a DEV?** | **No.** F2 rompe el invariante 3; F1 (healthcheck) sigue abierta; la regresión completa no se re-ejecutó |
| **Pruebas nuevas** | **55 casos · 52 verdes · 3 `todo` que fallan** (F2 ×2, F3 ×1) · exit 0 en ambas suites |
| **Fallas abiertas** | **3** — F1 (heredada), **F2 🔴 nueva**, **F3 🟠 nueva** |
| **Riesgos detectados** | **5 nuevos** (R9–R13), uno de seguridad alto: **R9, el webhook no valida firma** |

Lo que el encargo pedía verificar funciona en su mayoría: el CRUD de agentes, el
soft delete, `basePrompt` y `aiModel` de punta a punta, el ciclo completo
bot → humano → bot y el agente desactivado. Salieron mal dos cosas: la
**asociación del número** (F2, entre empresas) y el **historial de más de 20
mensajes** (F3).

---

## 2. Cambio auditado

```
backend/ (git status --porcelain, al empezar la pasada)
 M .gitignore · package.json · package-lock.json · prisma.config.ts
 M src/controllers/auth.controller.ts · src/middlewares/{auth,roles}.middleware.ts
 M src/services/auth.service.ts · dist/…  (4 archivos de build versionados)
?? .env.test.example · eslint.config.js · tsconfig.test.json
?? prisma/migrations/20260909221900_catchup_schema_modulos_0_4/
?? scripts/setup-test-db.ts · tests/frontend-auth-storage.test.ts
?? tests/helpers/ · tests/http/ · tests/setup/
```

Añadido en esta pasada: `tests/http/agents.http.test.ts`,
`tests/http/conversations.http.test.ts`, `tests/helpers/external-mocks.ts`,
`tests/helpers/whatsapp.ts`; scripts `test:http:agents` y
`test:http:conversations`; `putAs`/`patchAs`/`deleteAs`; limpieza de `AgentLog`
en `cleanupTestData()`.

---

## 3. Comandos ejecutados

| # | Directorio | Comando | Exit | Resultado |
|---|---|---|---|---|
| 1 | `backend` | `npm run qa:preflight:quick -- --no-color` | **1** | 36 PASS · **1 FAIL** · 7 WARN · 1 SKIP (146,8 s). El FAIL es `CFG-health` = **F1** heredada. PRI-1/2/3 PASS (`migrate status` exit 0) |
| 2 | `backend` | `npm run test:http:agents` | **0** | 24 tests · **22 pass · 0 fail · 2 todo** (39,6 s) |
| 3 | `backend` | `npm run test:http:conversations` | **0** | 31 tests · **30 pass · 0 fail · 1 todo** (39,8 s) |
| 4 | `backend` | `npm run typecheck` | **2** | 4 × TS2339 en las suites nuevas: `res.req` no existe en el tipo de Supertest |
| 5 | `backend` | `npm run typecheck` (tras corregir) | **0** | `src` + `tests` + `scripts` limpios |
| 6 | `backend` | `npx eslint . --quiet` | **1** | **8 errores = línea base**, todos en `src/`; **0** en los archivos nuevos |
| 7 | `backend` | consulta de **solo lectura** a `ferreteria_ai_agent` (pg) | **0** | 0 tenants, 0 usuarios, 0 integraciones y 0 claves de idempotencia de prueba |

> **Sobre el paso 5.** La corrección solo cambió cómo se **etiqueta** cada ruta
> en el mensaje de dos aserciones (se sustituyó `res.req.method` por un nombre
> fijo); las aserciones son las mismas. Las suites de los pasos 2 y 3 corrieron
> con la versión anterior y **no se re-ejecutaron** con la corregida, por la
> detención de §6. Estado del archivo final: `PROBADO PARCIALMENTE` hasta la
> próxima corrida.

### Conteos

| Suite | tests | pass | fail | todo |
|---|---|---|---|---|
| `test:http:agents` | 24 | 22 | 0 | **2** (F2) |
| `test:http:conversations` | 31 | 30 | 0 | **1** (F3) |
| **Total de esta pasada** | **55** | **52** | **0** | **3** |
| Resto de `npm test` (300) | — | — | — | `NO PROBADO` en esta pasada; último verde 2026-09-10 |

---

## 4. Resultados por área del encargo

OpenAI y Meta **no se llamaron**: los sustituye `tests/helpers/external-mocks.ts`,
que además hace fallar cualquier petición a otro host. Por eso ninguna parte
queda como `PENDIENTE POR CREDENCIALES EXTERNAS` salvo la respuesta **real** de
cada proveedor (§6).

### AGENTS

| Caso | Estado | Evidencia |
|---|---|---|
| Crear | `PROBADO CORRECTAMENTE` | `POST /api/agents` → 201. DTO con `basePrompt`, `aiModel`, `status: ACTIVE`, sin `tenantId` ni nombres internos. En la base: `systemPrompt`, `openAiModel`, `whatsappDisplayPhone`, `tenantId` de la sesión. Sin `aiModel` → `OPENAI_DEFAULT_MODEL`. `status: INACTIVE` → `DISABLED`. `tenantId` en el payload → **ignorado**. Sin `name`, `type` inválido o `status: DISABLED` → 400 sin crear nada |
| Editar | `PROBADO CORRECTAMENTE` | `PUT` → 200 y base actualizada; un PUT parcial conserva lo no enviado; `status: DISABLED` → 400; id inexistente → 404 |
| Activar / desactivar | `PROBADO CORRECTAMENTE` | `PATCH /:id/status` INACTIVE → `DISABLED`, ACTIVE → `ACTIVE`; `PAUSED` o vacío → 400 sin cambios |
| Eliminar | `PROBADO CORRECTAMENTE` — **es soft delete** | `DELETE` → 200 `INACTIVE`; la fila sigue (`DISABLED`), se sigue listando y leyendo, sus conversaciones conservan `agentId`; un segundo `DELETE` → 200 |
| `basePrompt` | `PROBADO CORRECTAMENTE` | Mapeo API↔base, **y viaja en el mensaje de sistema de la llamada a OpenAI** (interceptada) tanto en `POST /:id/test` como en el flujo real de WhatsApp |
| `aiModel` | `PROBADO CORRECTAMENTE` | Mapeo API↔base, y es el `model` de la llamada a OpenAI en ambos flujos. Acepta cualquier texto: ver R12 |
| Tenant ownership | `PROBADO CORRECTAMENTE` | B → `GET`/`PUT`/`PATCH /status`/`DELETE`/`POST /test` sobre el agente de A: **404** los cinco, 0 llamadas a OpenAI, y en la base el agente de A sigue igual (prompt, modelo, estado, nombre). El listado de B no menciona ni el id ni el prompt de A. `AGENT_OPERATOR` lee (200) y recibe 403 en los cuatro verbos de escritura |
| Asociar número de WhatsApp | `FALLA DETECTADA` (**F2**) | El número **propio** se guarda y se devuelve bien (200). Un número **ajeno** también se acepta (200) |
| Impedir acceso cross-tenant | `FALLA DETECTADA` (**F2**) | Por id: bloqueado (404). Por número: **roto** — el mensaje de un cliente de la otra empresa acabó en la empresa atacante |
| Prueba del agente (`POST /:id/test`) | `PROBADO CORRECTAMENTE` | 200, `model` = `aiModel`, 0 envíos a Meta, 0 conversaciones o mensajes creados (dry-run); mensaje vacío → 400 sin IA |

### CONVERSATIONS

No existe `POST /api/conversations`: una conversación **solo nace de un mensaje
entrante**. Se probó por ese camino, con el controlador real del webhook.

| Caso | Estado | Evidencia |
|---|---|---|
| Crear conversación | `PROBADO CORRECTAMENTE` | Primer mensaje → 1 conversación, `status: BOT_ACTIVE`, `channel: WHATSAPP`, `customerName` del perfil de Meta, sin asignar |
| Inbound | `PROBADO CORRECTAMENTE` | `INBOUND` / `CUSTOMER` / texto / `whatsappMessageId` / `tenantId`; `lastInboundAt` fijado. Imagen → `messageType: IMAGE` |
| Outbound | `PROBADO CORRECTAMENTE` | IA → `OUTBOUND` / `AGENT` con el texto de la IA; humano → `OUTBOUND` / `HUMAN`. Envío a Meta al número del cliente, por el `phoneNumberId` del tenant y con **el token de SU integración**, nunca el global |
| Historial | `FALLA DETECTADA` (**F3**) | Hasta 20 mensajes, correcto: el hilo se devuelve completo y **la IA recibe los turnos anteriores** (el suyo y el del cliente). Con 25: llegan los mensajes **1 a 20**; faltan los 5 últimos |
| Orden de mensajes | `PROBADO CORRECTAMENTE` | Secuencia `INBOUND/CUSTOMER → OUTBOUND/AGENT → INBOUND/CUSTOMER → OUTBOUND/AGENT`; `createdAt` monótono en base y en `GET /:id/messages`. Sin desempate: R13 |
| Tenant | `PROBADO CORRECTAMENTE` | Conversación, mensajes y contacto con el `tenantId` del número. El mismo cliente escribiendo al número de B crea datos **solo en B**, con el prompt, el modelo y el token de B. B → `/messages`, `takeover`, `release`, `reply`, `close` sobre A: **404** los cinco, y A no cambia (estado, asignación, mensajes, handoffs, 0 envíos) |
| Agent | `PROBADO CORRECTAMENTE` | `agentId` = agente del número; aparece en `GET /api/conversations` y `GET /:id` |
| Cliente / contacto | `PROBADO CORRECTAMENTE` | Contacto nuevo `stage: CONTACT`, `source: WHATSAPP`, `phone` = `wa_id`; el segundo mensaje reutiliza contacto y conversación |
| Idempotencia | `PROBADO CORRECTAMENTE` | Reentrega del mismo `message.id` → 0 mensajes nuevos, 0 llamadas a IA, 0 envíos |
| Ruta HTTP pública | `PROBADO CORRECTAMENTE` | `GET /api/whatsapp/meta` con el `verifyToken` del tenant → 200 + challenge; token falso → 403. `POST` → 200 y el mensaje llega a la base con respuesta enviada (espera activa) |

### ESTADOS — identificadores reales

El sistema tiene **exactamente** los identificadores del encargo. Enum
`ConversationStatus` (`prisma/schema.prisma:170`):

| Identificador real | Equivale a | Verificado |
|---|---|---|
| `BOT_ACTIVE` | BOT_ACTIVE | Estado inicial de toda conversación y el que deja `release-to-agent` |
| `HUMAN_ACTIVE` | HUMAN_ACTIVE | Lo dejan `takeover` y la IA cuando devuelve `requiresHuman: true` |
| `CLOSED` | — | `close` → responder da 409; el siguiente mensaje abre otra conversación; `takeover` la reabre como `HUMAN_ACTIVE` |
| `OPEN` | (legado) | `NO PROBADO`. `[LEÍDO]`: el bot solo se pausa en `HUMAN_ACTIVE`, así que en `OPEN` respondería |

Remitentes (`SenderType`): `CUSTOMER` · `AGENT` (IA) · `HUMAN` · `SYSTEM`.
Handoffs (`HandoffStatus`): `OPEN` · `ASSIGNED` · `RESOLVED` · `CANCELLED`.

### HUMAN TAKEOVER

| Caso | Estado | Evidencia |
|---|---|---|
| Tomar control | `PROBADO CORRECTAMENTE` | `POST /:id/takeover` (AGENT_OPERATOR) → 200; `HUMAN_ACTIVE`, `assignedToUserId` = operador, `HumanHandoff` `ASSIGNED` con el motivo enviado |
| El bot deja de responder | `PROBADO CORRECTAMENTE` | Mensaje entrante en `HUMAN_ACTIVE`: **0 llamadas a OpenAI, 0 envíos a Meta**, el mensaje sí se guarda, la conversación aparece en `?awaiting=true`. Una imagen tampoco dispara el fallback automático |
| Los mensajes humanos continúan | `PROBADO CORRECTAMENTE` | `POST /:id/reply` → 200 ×3 seguidos; `OUTBOUND/HUMAN`; envío a Meta con el token del tenant; 0 IA; el estado **sigue** `HUMAN_ACTIVE`. Vacío → 400; en `CLOSED` → 409; rol `BILLING` → 403 |
| Retorno al bot | `PROBADO CORRECTAMENTE` — la función **existe** (`release-to-agent`) | → 200; `BOT_ACTIVE`, sin asignado, 0 handoffs `OPEN`/`ASSIGNED`; el siguiente mensaje **vuelve** a pasar por la IA y se responde |
| Escalamiento pedido por la IA | `PROBADO CORRECTAMENTE` | Decisión simulada con `requiresHuman: true` → se envía el aviso, la conversación pasa sola a `HUMAN_ACTIVE` y el siguiente mensaje no llega a la IA |

### AGENT INACTIVE

| Caso | Estado | Evidencia |
|---|---|---|
| Cliente nuevo al número de un agente `DISABLED` | `PROBADO CORRECTAMENTE` | 0 IA, 0 envíos, 0 conversaciones |
| Conversación `BOT_ACTIVE` ya abierta con ese agente | `PROBADO CORRECTAMENTE` | 0 IA, 0 envíos. **El mensaje tampoco se guarda**: ver R10 |
| El humano puede responder mientras tanto | `PROBADO CORRECTAMENTE` | `reply` → 200, 1 envío, 0 IA |
| Otro agente activo del tenant | `PROBADO CORRECTAMENTE` | Atiende él (su modelo y su prompt); el prompt del desactivado **no** aparece en la llamada; la conversación no queda a nombre del desactivado |
| Reactivar | `PROBADO CORRECTAMENTE` | `PATCH /status ACTIVE` → el número vuelve a su agente (modelo y prompt originales) |

### Resto de áreas de la matriz

`Auth · Cookies · Roles · SUPER_ADMIN · Onboarding · Billing · Email · Admin ·
Embedded Signup · Prisma · Frontend`: **`NO PROBADO` en esta pasada**. Último
resultado ejecutado: 2026-09-10, 300/300 (reporte anterior, sustituido por este).

---

## 5. Verificaciones HTTP registradas

```
POST   /api/agents                            OWNER       → 201
POST   /api/agents  sin name | type=ROBOT | status=DISABLED → 400
POST   /api/agents                            OPERATOR    → 403
PUT    /api/agents/:id                        OWNER       → 200
PUT    /api/agents/:id  status=DISABLED                   → 400
PUT    /api/agents/no-existe-123                          → 404
PATCH  /api/agents/:id/status  INACTIVE | ACTIVE          → 200
PATCH  /api/agents/:id/status  PAUSED | {}                → 400
DELETE /api/agents/:id  (dos veces)                       → 200, 200 (fila DISABLED)
PUT|PATCH|DELETE /api/agents/:id           OPERATOR       → 403
GET|PUT|PATCH /status|DELETE|POST /test  agente de otra empresa → 404
POST   /api/agents/:id/test                   propio      → 200 (model = aiModel)
POST   /api/agents/:id/test  message=""                   → 400
PUT    /api/agents/:id  whatsappPhoneNumberId de OTRA empresa → 200   ← F2
GET    /api/conversations?limit=100                       → 200
GET    /api/conversations?awaiting=true&limit=100         → 200
GET    /api/conversations/:id · /:id/messages             → 200
POST   /api/conversations/:id/takeover        OPERATOR    → 200
POST   /api/conversations/:id/reply           OPERATOR    → 200
POST   /api/conversations/:id/reply  message=""           → 400
POST   /api/conversations/:id/reply  en CLOSED            → 409
POST   /api/conversations/:id/release-to-agent            → 200
POST   /api/conversations/:id/close                       → 200
POST   takeover | reply | release-to-agent    BILLING     → 403
GET /messages · POST takeover|release|reply|close  conversación de otra empresa → 404
GET    /api/whatsapp/meta  verify_token del tenant        → 200 (challenge)
GET    /api/whatsapp/meta  verify_token falso             → 403
POST   /api/whatsapp/meta  SIN X-Hub-Signature-256        → 200 y se procesa  ← R9
```

---

## 6. Lo que NO se probó

| Área / caso | Estado | Motivo |
|---|---|---|
| Regresión completa `npm test` (las 300 anteriores) | `NO PROBADO` | Detención por §6. Importa: `cleanupTestData()` cambió (borra `AgentLog`) y lo usan las 8 suites HTTP |
| Re-ejecución de las dos suites tras corregir el typecheck | `NO PROBADO` | Detención por §6. El cambio solo afecta al texto de dos aserciones |
| Respuesta real de OpenAI | `PENDIENTE POR CREDENCIALES EXTERNAS` | Requiere `OPENAI_API_KEY` con saldo. Todo lo demás del runtime se ejecutó con el doble |
| Envío real por la Graph API de Meta | `PENDIENTE POR CREDENCIALES EXTERNAS` | Requiere WABA de pruebas y token real |
| Recepción real de un webhook enviado por Meta | `PENDIENTE POR AMBIENTE PÚBLICO` | Requiere HTTPS accesible desde internet |
| Firma HMAC del webhook | `NO PROBADO` | **No existe en el código** (R9): no hay nada que probar |
| Estado `OPEN` con mensaje entrante | `NO PROBADO` | Solo `[LEÍDO]` |
| Agente `DISABLED` + conversación en `HUMAN_ACTIVE` | `NO PROBADO` | `[LEÍDO]`: el mensaje se descartaría igual (R10) |
| `POST /reply` sobre una conversación `BOT_ACTIVE` | `NO PROBADO` como estado | `[LEÍDO]`: no pausa el bot (R11) |
| `/assign`, `/unassign`, etiquetas, perfil de contacto, filtros y paginación del Inbox | `NO PROBADO` | Fuera del encargo |
| Audio entrante (transcripción) | `NO PROBADO` | Requiere doble de ElevenLabs; fuera del encargo |
| Acciones del runtime (catálogo, cotización PDF, citas), precheck y control de gasto | `NO PROBADO` | Los dobles ya lo permiten; fuera del encargo |
| Flujo oficial `assignAgentToWhatsApp` | `NO PROBADO` | Solo `[LEÍDO]`: sí valida que el número sea del tenant — es el contraste que falta en F2 |
| Pantallas de Agentes e Inbox | `NO PROBADO` | Sin runner de frontend; sin recorrido manual en esta pasada |

---

## 7. Fallas detectadas

### F2 — Un tenant puede apropiarse del número de WhatsApp de otro

| | |
|---|---|
| **Estado** | `FALLA DETECTADA` → **corregida 2026-09-23** (ver `QA_DATABASE.md` §9) |
| **Área** | Agents · WhatsApp · Tenants |
| **Gravedad** | 🔴 bloqueante |
| **Detiene la pasada** | **Sí** — invariante 3 de `QA_RULES.md` §6 |

**Cómo reproducirlo**

```
cd backend && npm run test:http:agents
# o a mano, con la cookie del OWNER de la empresa B:
PUT /api/agents/<agente de B>   {"whatsappPhoneNumberId": "<phoneNumberId de la empresa A>"}
```

**Qué se esperaba:** 4xx, como en el flujo oficial (`assignAgentToWhatsApp`
responde 404 si el número no es de una integración del tenant), y que los
mensajes a ese número sigan llegando solo a su dueño.

**Qué ocurrió:** `PUT` → **200** y el agente de B quedó con el número de A. Un
mensaje de un cliente enviado al número de A se guardó **en la empresa B**.

**Evidencia**

```
✖ un OWNER no puede asignar a su agente el número de OTRA empresa  # FALLA ABIERTA F2
  AssertionError [ERR_ASSERTION]: 🚨 el agente de B quedó con el número de A (PUT respondió 200)
✖ los mensajes que llegan al número de A nunca se procesan en la empresa B  # FALLA ABIERTA F2
  AssertionError [ERR_ASSERTION]: 🚨 el mensaje de un cliente de la víctima quedó en la empresa B
```

**Causa** (identificada leyendo el código tras la evidencia):

1. `src/services/agents-crud.service.ts:33` acepta `whatsappPhoneNumberId` como
   texto libre y `:91` lo copia tal cual; ni `createAgent` (`:208`) ni
   `updateAgent` (`:225`) comprueban a quién pertenece.
2. `src/services/whatsapp.service.ts:483` — `resolveAgentByPhoneNumberId` busca
   primero **cualquier** agente activo con ese número, sin cruzarlo con el
   tenant de la integración dueña del número, y con `findFirst` sin `orderBy`:
   si dos agentes reclaman el mismo número, gana uno arbitrario.
3. `[LEÍDO]` Las credenciales se resuelven por número
   (`whatsapp.controller.ts:84` → `resolveSendCredentials`), así que el agente
   de B **respondería con el token de Meta de A**. Esto no lo afirma ninguna
   prueba: la primera aserción ya falló antes.

**Arreglo sugerido (no aplicado — en QA no se toca código funcional):** validar
en `createAgent`/`updateAgent` que el número pertenece a una
`WhatsAppIntegration` del mismo tenant (la comprobación de
`assignAgentToWhatsApp`), y en `resolveAgentByPhoneNumberId` exigir que el
agente sea del tenant de la integración cuando esta exista. Antes de desplegar
el arreglo, comprobar en producción con una consulta **de solo lectura** si ya
hay agentes en esa situación:

```sql
SELECT a.id, a."tenantId", i."tenantId" AS "dueñoDelNumero"
FROM "Agent" a
JOIN "WhatsAppIntegration" i ON i."phoneNumberId" = a."whatsappPhoneNumberId"
WHERE a."tenantId" <> i."tenantId";
```

Cuando se corrija, las dos pruebas pasarán solas: **quitarles el `todo`**.

### F3 — El historial devuelve los 20 mensajes más antiguos

| | |
|---|---|
| **Estado** | `FALLA DETECTADA` → **corregida 2026-09-23** (ver `QA_DATABASE.md` §9) |
| **Área** | Conversations · Agents (runtime) |
| **Gravedad** | 🟠 alta |
| **Detiene la pasada** | No |

**Cómo reproducirlo:** `cd backend && npm run test:http:conversations` (prueba
`historial largo`), o cualquier conversación con más de 20 mensajes →
`GET /api/conversations/:id/messages`.

**Qué se esperaba:** que el hilo incluya el último mensaje.
**Qué ocurrió:** llegan los mensajes 1 a 20 de 25; los 5 más recientes no.

```
✖ con más de 20 mensajes, GET /:id/messages incluye el último  # FALLA ABIERTA F3
  AssertionError [ERR_ASSERTION]: el último mensaje no aparece (llegaron: mensaje 1 … mensaje 20)
```

**Causa:** `src/services/conversation.service.ts:157` — `orderBy: createdAt asc`
+ `take: 20`. La usan el Inbox (`conversation.controller.ts:220`) **y el
runtime** (`whatsapp.service.ts:652`), que luego hace `slice(-10)`
(`agent.service.ts:86`). En un hilo largo la IA recibe como contexto los
mensajes 11-20, no los últimos: contesta sin ver lo que el cliente acaba de
decir. Arreglo sugerido: ordenar `desc`, tomar N e invertir (o paginar).

### F1 — Healthcheck de Railway (heredada, sin cambios)

`railway.json` declara `/api/health` y la ruta real es `/health`. El pre-flight
de esta pasada la vuelve a marcar (`CFG-health` → FAIL). Sigue abierta.

---

## 8. Riesgos detectados

| # | Riesgo | Dónde | Impacto | Cómo se detectó |
|---|---|---|---|---|
| **R9** | **El webhook de WhatsApp no valida la firma `X-Hub-Signature-256`.** `META_WEBHOOK_APP_SECRET` se declara y no se usa en ningún sitio. Cualquiera que conozca el `phoneNumberId` de un tenant conectado puede inyectar mensajes con un `from` arbitrario: gasta la IA del tenant y hace que el bot envíe WhatsApps **a números elegidos por el atacante con el token del cliente** | `src/controllers/whatsapp.controller.ts:43` · `src/config/env.ts:84` | 🔴 Alto — seguridad y coste | `[EJECUTADO]` todos los payloads de esta pasada iban sin firma y se procesaron, incluido `POST /api/whatsapp/meta` por HTTP → 200 + respuesta enviada |
| **R10** | Si el agente del número está desactivado y no hay otro activo, **el mensaje del cliente se descarta sin guardarse**, aunque la integración esté CONNECTED. El negocio no ve lo que le escribieron; `[LEÍDO]` también si un humano tenía la conversación en `HUMAN_ACTIVE` | `src/controllers/whatsapp.controller.ts:66-73` (`continue` antes de guardar) | 🟠 Alto — pérdida silenciosa de mensajes | `[EJECUTADO]` conversación `BOT_ACTIVE` existente: 0 mensajes nuevos tras el inbound |
| **R11** | `POST /reply` no cambia el estado: si un operador responde sin hacer `takeover`, el bot sigue contestando en paralelo | `src/controllers/conversation.controller.ts:284` | 🟡 Medio — dos voces en el mismo hilo | `[LEÍDO]` |
| **R12** | `aiModel` acepta cualquier texto. Una errata hace fallar cada llamada a OpenAI y el cliente recibe el mensaje de fallo + escalamiento en todos los turnos | `src/services/agents-crud.service.ts:34` | 🟡 Medio | `[EJECUTADO]` `aiModel: "gpt-test-model-create"` → 201 |
| **R13** | Los mensajes se ordenan solo por `createdAt`, sin desempate: dos creados en el mismo milisegundo (p. ej. dentro de un `$transaction`) pueden salir en cualquier orden | `src/services/conversation.service.ts:160` | 🟡 Bajo | `[LEÍDO]` |

Siguen abiertos R1–R8 de reportes anteriores (el R1 —webhook sin pruebas— queda
**reducido**: ahora hay pruebas del parseo, del ruteo y de la idempotencia, pero
no de la firma, que no existe).

> Numeración: R9–R13 continúan la serie de `LAST_QA_REPORT.md`. No confundir con
> la serie R1–R13 de `QA_INITIAL_AUDIT.md`.

---

## 9. Verificación manual en navegador

**Ninguna en esta pasada.** Las pantallas de Agentes y del Inbox siguen en
`NO PROBADO` (grupo D1 de `LOCAL_QA_RUNBOOK.md` §8.1).

---

## 10. Estado de la base de datos

| Comprobación | Resultado |
|---|---|
| Base usada por las suites | `ferreteria_ai_agent_test` — la guarda imprimió `✔ base de pruebas: ferreteria_ai_agent_test` en las dos corridas |
| `prisma migrate status` | exit 0, esquema al día (`PRI-3` del pre-flight) |
| ¿Reset, `DROP` o `TRUNCATE`? | **No** |
| ¿Se escribió en la base de desarrollo? | **No** |
| Residuos en **desarrollo** | **0** tenants, 0 usuarios, 0 integraciones y 0 claves de idempotencia con prefijo de prueba (`[EJECUTADO]`, solo lectura) |
| Redis | Las suites escriben claves `idempotency:webhook:wa:wamid.__http_test__…` (TTL 24 h) y de caché de dashboard en el Redis de `REDIS_URL`, que en local es el mismo de desarrollo. Inofensivas y con prefijo, pero no se borran solas antes de 24 h |

---

## 11. Conclusión

En verde, con evidencia: el ciclo completo de un agente (alta, edición,
activación, soft delete, `basePrompt` y `aiModel` hasta la llamada a la IA) y el
de una conversación (entrada, respuesta de la IA, **toma de control humana con
el bot callado, respuesta humana y retorno al bot**, agente desactivado que no
procesa), todo sin salir a internet. En rojo: **F2**, que permite a una empresa
quedarse con los mensajes de otra a través del número de WhatsApp, y **F3**, que
recorta el final de los hilos largos. **R9** (webhook sin firma) no es un fallo
de una prueba, pero sí la puerta pública más expuesta del producto.

**Siguientes acciones recomendadas, por orden:**

1. **Corregir F2** y ejecutar la consulta de solo lectura de §7 en producción.
   Quitar el `todo` de sus dos pruebas.
2. **Corregir R9**: validar `X-Hub-Signature-256` con `rawBody` (ya se preserva
   en `app.ts`) y `META_WEBHOOK_APP_SECRET`.
3. **Corregir F3** y quitar su `todo`.
4. Re-ejecutar `cd backend && npm test` completo (355 casos, con `ℹ todo 0` como
   objetivo) y regenerar este reporte.
