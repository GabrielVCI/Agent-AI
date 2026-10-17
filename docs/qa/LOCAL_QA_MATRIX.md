# LOCAL_QA_MATRIX — Qué probar según lo que se tocó

> Se entra por la fila que corresponde al cambio y se ejecuta **todo** lo que
> marca. Si un cambio toca varias filas, se acumulan.
>
> La columna **Automático** solo lista comandos que existen hoy. La columna
> **Manual / sin cobertura** es igual de obligatoria: hay que ejecutarla a mano
> y reportarla con su estado, no ignorarla.

---

## Cómo se lee

| Símbolo | Significado |
|---|---|
| ✅ | Existe prueba automática que cubre el área |
| 🖐️ | Sin cobertura automática: verificación manual obligatoria |
| ⚠️ | Requiere credenciales o entorno público (ver `ENVIRONMENT_MATRIX.md`) |

**Siempre**, sea cual sea el cambio: Fases 1, 2 y 4 del runbook
(auditar diff · typecheck · unitarias). Es el mínimo no negociable.

---

## Matriz por módulo

### Auth · login, registro, sesión, contraseñas, verificación de correo

Archivos: `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`,
`src/middlewares/auth.middleware.ts`, `src/services/password-reset.service.ts`,
`src/services/email-verification.service.ts`, `src/services/google-oauth.service.ts`

| | |
|---|---|
| **Automático** | `npm run test:http:auth` ✅ · `npm run test:http:register` ✅ · `npm run test:http:roles` ✅ · `npm run test:http:superadmin` ✅ · `npm run test:http:gates` ✅ · `npm run typecheck` |
| **Manual** | 🖐️ Login/logout en navegador · cookie `sid` con **HttpOnly ✓** en DevTools · recarga de ruta profunda · guardas del frontend (`ProtectedRoute`, `RequireActiveSubscription`) |
| **Sin cobertura** | 🖐️ Reset de contraseña · uso real del enlace de verificación (`POST /api/auth/verify-email`) · ⚠️ Google OAuth (falta `GOOGLE_CLIENT_ID/SECRET`) |
| **Regresión** | `npm test` completo: auth es transversal |

> **Comportamiento del registro, verificado ejecutando:** `POST /api/auth/register`
> **no** crea empresa. El usuario nace con `tenantId: null`, rol `OWNER` y
> `emailVerifiedAt: null`, y la sesión queda iniciada (201 + cookie). La empresa
> la crea el **onboarding**. Cualquier prueba que espere un tenant recién
> registrado está mal escrita, no el código.

### Cookies y sesión

| | |
|---|---|
| **Automático** | `npm run test:http:auth` ✅ (nombre `sid`, HttpOnly, `Path=/`, SameSite=Lax en local, **sin `Secure` en local**, `Max-Age` = `SESSION_TTL_SECONDS`, token fuera del cuerpo, hash en base, revocación al salir, borrado con los mismos atributos, cierre de una sola sesión) |
| **Automático (frontend)** | `npm run test:unit` ✅ — `tests/frontend-auth-storage.test.ts`: ninguna credencial en `localStorage`/`sessionStorage`, el cliente usa `credentials: 'include'` y no construye cabeceras `Bearer` |
| **Manual** | 🖐️ DevTools → Application → Cookies (comprobación visual del `HttpOnly ✓`) |
| **Ojo** | En local `COOKIE_SAMESITE=lax` y **sin `Secure`** (por http:// el navegador la descartaría). En producción con dominios distintos debe ser `None` + `Secure`: **no verificable en local** |

### Roles y permisos

| | |
|---|---|
| **Automático** | `npm run test:http:roles` ✅ · `npm run test:http:superadmin` ✅ · `npm run test:http:gates` ✅ |
| **Manual** | 🖐️ Menú lateral según rol |
| **Cubierto** | `requireAuth`, `requireRole`, `requireSuperAdmin`, `requireTenantAccess`, `ADMIN ≠ SUPER_ADMIN`, 401 antes que 403, el rol **no** se puede fijar desde el payload de registro |

### SUPER_ADMIN · invariante crítico

| | |
|---|---|
| **Automático** | `npm run test:http:superadmin` ✅ (bypass de paywall y de `requireTenantAccess`) · `npm run test:http:gates` ✅ (**los tres gates comerciales**: verificación de correo, implementación y paywall, con el contraste de un tenant que sí queda bloqueado en cada uno) |
| **Manual** | 🖐️ El gate del frontend `RequireActiveSubscription.tsx` (sin runner todavía): entrar con SUPER_ADMIN y comprobar que no cae en `/activate` ni en `/verificar-correo` |
| **Regla** | Si algo aquí falla, **se detiene la pasada** (`QA_RULES.md` §6) |

> El endpoint que deciden los gates es `GET /api/billing/activation-status`.
> Para un SUPER_ADMIN devuelve `reason: "SUPER_ADMIN"`, `emailVerified: true`,
> `shouldShowPaywall: false` y `shouldShowImplementationScreen: false`, **sin
> mirar la base**: su `emailVerifiedAt` puede ser null y da igual.

### Tenants · aislamiento multiempresa

| | |
|---|---|
| **Automático** | `npm run test:http:isolation` ✅ (38 casos, recurso por recurso) · `npm run test:http:roles` ✅ · `npm run test:db` ✅ (por servicio, módulos 0–4) |
| **Cubierto por HTTP** | agents · customers · conversations · catálogo (servicios y productos) · appointments · integraciones de WhatsApp · datos de facturación · dashboard · además `PATCH /status` y `POST /test` de agentes (`test:http:agents`) y takeover/release/reply/close de conversaciones (`test:http:conversations`) |
| **Falla abierta** | 🔴 **F2** — el aislamiento se rompe por la vía del **número de WhatsApp**: no leyendo por id, sino porque un tenant puede asignarse el `phoneNumberId` de otro y el webhook le entrega sus mensajes |
| **Patrón obligatorio** | Cada módulo se prueba con cuatro casos: A lee lo suyo (200) · A lee lo de B (nunca 200) · A escribe sobre lo de B (nunca 2xx **y B no cambia**) · el listado de A no menciona nada de B |
| **Sin cobertura** | 🖐️ knowledge · automations · quotes · voice/call logs · maintenance por HTTP |
| **Regla** | Si un usuario ve datos de otra empresa, **se detiene la pasada** |

> **Comportamiento verificado:** un recurso de otra empresa responde **404**, no
> 403 — un 403 confirmaría que el id existe. Las pruebas aceptan 403 o 404 y
> fallan con cualquier 2xx.

### Prisma · schema, migraciones, base de datos

Archivos: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/sql/`, `prisma.config.ts`

| | |
|---|---|
| **Obligatorio** | `npx prisma migrate status` → *up to date* · `npm run test:db:setup` (demuestra que el esquema se reconstruye desde cero) |
| **Verificación de drift** | `npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code` → **exit 0** = sin diferencias |
| **Automático** | `npm run test:db` completo ✅ (las 5 suites) + `npm run test:http` ✅ |
| **Prohibido** | Aceptar un reset. Ver `QA_RULES.md` §3 |
| **Si se añade una migración** | Aplicarla también en la base de pruebas (`npm run test:db:setup`) y anotar en el reporte que producción necesitará su `migrate resolve --applied` si ya tiene el esquema (`QA_TEST_DATABASE.md` §6.2) |

### WhatsApp · webhook, envío, integración por tenant

Archivos: `src/services/whatsapp.service.ts`, `meta-whatsapp.service.ts`,
`whatsapp-integration.service.ts`, `whatsapp-providers/`, `src/routes/whatsapp.routes.ts`

| | |
|---|---|
| **Automático** | `npm run test:http:conversations` ✅ — webhook con payloads sintéticos: `GET` de verificación (token del tenant → 200, falso → 403), parseo de texto e imagen, ruteo por `phoneNumberId` al tenant y al agente correctos, idempotencia ante reintentos, envío con el token **de la integración del tenant** (Meta interceptada) · `npm run test:http:agents` ✅ (asociación de número) · `npm run test:db:automation` ✅ (automatización hacia número ajeno bloqueada; sin agente de WhatsApp el job falla como no reintentable) |
| **Sin cobertura** | 🖐️ Firma HMAC: **el código no la valida** — `META_WEBHOOK_APP_SECRET` se declara en `env.ts` y no se usa (riesgo R9). Audio entrante |
| **Falla abierta** | 🔴 **F2** — `PUT /api/agents/:id` acepta el `phoneNumberId` de otra empresa y el webhook rutea sus mensajes a ese agente. Detectada por `test:http:agents` (`todo`) |
| **Externo** | ⚠️ Envío real: requiere WABA de pruebas (`META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`) |
| **Ambiente público** | ⚠️ Recepción real de webhooks: requiere HTTPS accesible desde internet |
| **Arrastra** | Conversations · Agents · Tenants · Security · smoke de Auth |

### Embedded Signup

| | |
|---|---|
| **Estado** | ⚠️ `NO VERIFICABLE EN LOCAL`. Requiere app de Meta aprobada, HTTPS público y el SDK de Facebook en el navegador |
| **Procedimiento** | Manual, documentado en `docs/STAGING_EMBEDDED_SIGNUP_TESTING.md` y `docs/WHATSAPP_EMBEDDED_SIGNUP_E2E.md` |

### Conversations / Inbox

| | |
|---|---|
Archivos: `src/services/conversation.service.ts`, `src/controllers/conversation.controller.ts`,
`src/controllers/inbox.controller.ts`, `src/services/whatsapp.service.ts`

| | |
|---|---|
| **Automático** | `npm run test:http:conversations` ✅ (31 casos, 1 `todo`) · `npm run test:http:isolation` ✅ (lectura y cierre entre empresas) |
| **Cubierto** | Creación por mensaje entrante (no existe `POST /api/conversations`) · contacto `CONTACT`/`WHATSAPP` · INBOUND/OUTBOUND con `senderType` correcto · orden cronológico · historial que recibe la IA · reutilización de la conversación abierta · CLOSED (409 al responder, conversación nueva al volver a escribir) · takeover · release · reply · escalamiento pedido por la IA |
| **Manual** | 🖐️ Etiquetas, asignación (`/assign`, `/unassign`), perfil de contacto, filtros y paginación · la pantalla del Inbox |
| **Falla abierta** | 🟠 **F3** — con más de 20 mensajes, `GET /:id/messages` (y el historial de la IA) devuelve los **20 más antiguos** |
| **Arrastra** | Tenants · Auth · WhatsApp |

**Estados reales** (enum `ConversationStatus`), verificados ejecutando:

| Estado | Cuándo | ¿Responde el bot? |
|---|---|---|
| `BOT_ACTIVE` | Toda conversación nueva · tras `release-to-agent` | Sí |
| `HUMAN_ACTIVE` | `takeover` · `assign` · la IA devuelve `requiresHuman` · límite del plan | **No**: el mensaje se guarda y nadie contesta solo |
| `CLOSED` | `close` o cierre por calidad | No; el siguiente mensaje abre otra conversación. `takeover` la reabre como `HUMAN_ACTIVE` |
| `OPEN` | Solo datos antiguos / fixtures | Sí (`[LEÍDO]`: el código solo pausa en `HUMAN_ACTIVE`) — `NO PROBADO` |

Remitentes (`SenderType`): `CUSTOMER` · `AGENT` (la IA) · `HUMAN` (el operador) · `SYSTEM`.

### Agents · runtime de IA

Archivos: `src/services/agent-runtime/`, `agent.service.ts`, `agents-crud.service.ts`

| | |
|---|---|
| **Automático** | `npm run test:http:agents` ✅ (CRUD, soft delete, activar/desactivar, número, ownership, `POST /:id/test`) · `npm run test:http:conversations` ✅ (runtime real con OpenAI **simulado**: modelo = `aiModel`, `basePrompt` en el mensaje de sistema, historial; agente DISABLED no procesa) · `npm run test:http:roles` ✅ |
| **Sin cobertura** | 🖐️ Acciones del runtime (catálogo, cotización PDF, citas), precheck de spam y control de gasto. Los dobles de OpenAI ya existen (`tests/helpers/external-mocks.ts`) |
| **Externo** | ⚠️ Respuestas reales de OpenAI: `PENDIENTE POR CREDENCIALES EXTERNAS` (`OPENAI_API_KEY` con saldo) |
| **Falla abierta** | 🔴 **F2** (asociación de número sin validar el tenant) |

> **Contrato verificado:** la API usa `basePrompt`, `aiModel`, `whatsappNumber` y
> `status: ACTIVE|INACTIVE`; Prisma guarda `systemPrompt`, `openAiModel`,
> `whatsappDisplayPhone` y `ACTIVE|DISABLED`. `DELETE` **no borra**: pasa a
> `DISABLED`. Un agente `DISABLED` no atiende su número; si el tenant tiene otro
> agente activo, ese atiende (fallback por la integración CONNECTED).

### Billing · planes, límites, LemonSqueezy

| | |
|---|---|
| **Automático** | `npm run test:http:superadmin` ✅ cubre `checkPlanLimit` (bloquea sin suscripción, deja pasar con suscripción, exceptúa a SUPER_ADMIN) |
| **Sin cobertura** | 🖐️ Firma HMAC del webhook · cambios de plan · contadores de uso · `activation-status` |
| **Externo** | ⚠️ Checkout real: requiere `LEMONSQUEEZY_*` |
| **Arrastra** | SUPER_ADMIN · Tenants · Onboarding |

### Onboarding y activación

| | |
|---|---|
| **Automático** | Ninguno |
| **Manual** | 🖐️ Registro → verificación de correo → implementación → activación. Gates `/verificar-correo`, `/implementacion`, `/activate` |
| **Arrastra** | Auth · Billing · Email |

### Email

| | |
|---|---|
| **Local** | Con `EMAIL_PROVIDER=log` los correos se escriben en consola: sirve para comprobar que se disparan y con qué contenido |
| **Externo** | ⚠️ Entrega real: requiere `RESEND_APIKEY`. **Nunca** pegar la clave en un reporte |

### Admin · panel de SUPER_ADMIN

| | |
|---|---|
| **Automático** | `npm run test:http:superadmin` ✅ (`GET /api/admin/tenants` responde 200 y lista empresas sin suscripción) · `npm run test:http:roles` ✅ (un OWNER o ADMIN recibe 403) |
| **Manual** | 🖐️ Acciones de escritura del panel |

### Customers · Categorías · Historial · Mantenimientos · Automatizaciones

| | |
|---|---|
| **Automático** | La suite del módulo + `npm run test:unit` ✅ — es la zona **mejor cubierta** del proyecto |
| **Regla** | Si se toca lógica compartida (`utils/phone.ts`, `utils/timezone.ts`, `customer-names.ts`), ejecutar **`npm run test:db` completo**, no solo la suite del módulo |

### Frontend · panel

| | |
|---|---|
| **Automático** | `npx tsc -b` · `npm run lint` (0 errores) · `npm run build`. **No hay pruebas de frontend**: no existe runner |
| **Manual** | 🖐️ Todo lo funcional. Como mínimo el recorrido de la Fase 8 del runbook |

### Webpage · landing

| | |
|---|---|
| **Automático** | `npm run lint` · `npm run build` (incluye sitemap y prerender) |
| **Manual** | 🖐️ Formularios (envían a Web3Forms desde el navegador) |

### Security · transversal

| | |
|---|---|
| **Automático** | `test:http:auth` ✅ (token fuera del cuerpo, hash en base, anti-enumeración) · `test:unit` ✅ (`sanitizeErrorText`) · lint ✅ (reglas que bloquean credenciales en `localStorage` y secretos en `res.json`) |
| **Manual** | 🖐️ Revisar que ninguna respuesta nueva incluya secretos |
| **Sin cobertura** | 🖐️ Rate limiting (desactivado en pruebas) · CORS · helmet · cifrado de tokens de WhatsApp |

---

## Combinaciones de referencia

| Cambio | Áreas a ejecutar |
|---|---|
| **Auth** | Auth + Cookies + Roles + Tenants + SUPER_ADMIN + guardas de frontend 🖐️ + regresión (`npm test`) |
| **WhatsApp** | WhatsApp + Conversations (`test:http:conversations`) + Agents (`test:http:agents`) + Tenants + Security + smoke de Auth (`test:http:auth`) |
| **Agents / Conversations / Inbox** | `test:http:agents` + `test:http:conversations` + `test:http:isolation` + `test:http:roles` + recorrido manual del Inbox 🖐️ |
| **Prisma** | `migrate status` + `test:db:setup` + diff de drift + suites de integración afectadas + Tenants + regresión (`npm test`) |
| **Billing** | Billing + SUPER_ADMIN + Onboarding 🖐️ + Tenants |
| **Roles / middlewares** | Roles + SUPER_ADMIN + Tenants + Auth + regresión completa |
| **Frontend (solo UI)** | `tsc -b` + lint + build + recorrido manual de la pantalla tocada |
| **Refactor transversal** | Todo: `npm test` + los tres builds + recorrido manual |
| **Solo documentación** | Nada. Se anota `NO PROBADO — cambio solo de documentación` |
