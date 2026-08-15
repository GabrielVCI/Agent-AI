# Sendwary — Product & Tech Spec

> Documento de referencia para retomar el proyecto en cualquier terminal sin
> perder contexto. Estados usados: ✅ implementado · 🟡 parcial · ⏳ pendiente.
> Última actualización: julio 2026.

---

## A. Resumen del producto

**Qué es**: Sendwary es una plataforma SaaS multi-tenant de **agentes IA para
WhatsApp y llamadas** que atiende clientes finales 24/7: responde con datos
reales del negocio (catálogo, documentos, horarios), cotiza, agenda citas,
transcribe audios, atiende llamadas (Enterprise) y escala a un humano cuando
corresponde.

**Para quién**: negocios pequeños y medianos de LATAM (arranque en República
Dominicana) que venden o agendan por WhatsApp: ferreterías, clínicas, salones,
servicios profesionales, retail.

**Problema que resuelve**: los negocios pierden ventas y citas porque no pueden
responder WhatsApp a tiempo, no tienen personal 24/7 y las respuestas manuales
son inconsistentes (precios inventados, citas perdidas, clientes sin seguimiento).

**Propuesta de valor**:
- Agente IA que responde en segundos con precios/disponibilidad REALES (nunca inventa).
- Citas agendadas y confirmadas automáticamente contra la disponibilidad del negocio.
- Inbox profesional con intervención humana en un clic (referencia funcional: respond.io).
- Control de costos integrado: la IA corta conversaciones improductivas y respeta límites de plan.

**Módulos principales**: Auth/tenants · Agentes IA · WhatsApp (texto+audio) ·
Llamadas IA (Enterprise) · Inbox/conversaciones · Citas (+Excel) · Catálogo ·
Documentos/conocimiento · Cotizaciones PDF · Billing/planes · Dashboard ·
Herramientas externas · Soporte IA · Panel SUPER_ADMIN.

---

## B. Personas / usuarios

| Persona | Rol en el sistema | Qué hace |
|---|---|---|
| **SUPER_ADMIN** (equipo Sendwary) | `SUPER_ADMIN` | Crea/gestiona tenants, asigna planes (incluso personalizados), suspende, resetea uso, habilita voz, atiende soporte (/admin) |
| **Dueño del negocio** | `OWNER` | Configura empresa, agentes, catálogo, citas, entrenamiento; gestiona plan y facturación |
| **Administrador del negocio** | `ADMIN` | Igual que OWNER en operación (sin decisiones de cuenta/cancelación) |
| **Agente humano** | `AGENT_OPERATOR` (enum existente, flujo 🟡) | Atiende el inbox: takeover, respuesta manual, etiquetas, asignación |
| **Cliente final** | (sin cuenta) | Escribe/llama al WhatsApp del negocio; interactúa con el agente IA |

---

## C. Planes comerciales

> Fuente de verdad comercial (LOCKED_DECISIONS #14–16). Los seeds de BD deben
> mantenerse alineados a esta tabla.

### Básico — US$40/mes + US$250 implementación
- Rango comercial: **1,500–3,000 mensajes/mes** · límite técnico: **3,000**.
- 1 agente IA de texto WhatsApp, catálogo, citas, cotizaciones PDF, inbox, dashboard.
- Sin audio, sin llamadas, sin RAG de documentos.

### Pro — US$60/mes + US$450 implementación
- Rango comercial: **3,000–6,000 mensajes/mes** · límite técnico: **6,000**.
- Todo lo del Básico + transcripción de audios de WhatsApp + documentos de
  conocimiento + más agentes/números según seed.

### Enterprise — US$90/mes + implementación desde US$600
- Rango comercial: **6,000–10,000 mensajes/mes** · límite técnico inicial:
  **10,000 (configurable por tenant)**.
- Todo lo del Pro + **llamadas IA (exclusivo Enterprise)** con cuota segura de
  **180 minutos/mes por usuario Enterprise** (configurable por SUPER_ADMIN),
  overrides personalizados por tenant (mensajes, tokens, usuarios, agentes,
  números, minutos).

**Venta manual**: SUPER_ADMIN puede crear clientes con planes personalizados
(billingMode MANUAL/CUSTOM, precios negociados) sin pasar por checkout. ✅

---

## D. Arquitectura funcional (estado real)

| Módulo | Estado | Detalle |
|---|---|---|
| Auth (email/contraseña, sesiones cookie httpOnly, hash en BD + cache Redis) | ✅ | `auth.service.ts`; logout con confirmación |
| Google OAuth | 🟡 | Código completo (flujo manual server-side); **faltan credenciales** en Google Cloud + envs |
| Recuperación de contraseña | 🟡 | Flujo completo y seguro; **sin proveedor de email** (link solo en logs en dev) |
| Tenants multi-empresa | ✅ | Aislamiento por tenantId en todos los endpoints |
| Planes/billing/enforcement | ✅ | UsageCounter mensual, bloqueo IA al agotar cuota, aviso 1 vez/mes |
| LemonSqueezy | 🟡 | Webhook y checkout preparados; sin credenciales; overlay embebido ⏳ |
| Agentes IA (CRUD, prompt, prueba dry-run) | ✅ | Mismo runtime en prueba y producción |
| Runtime IA (clasificación, control de gasto) | ✅ | Ver sección G |
| WhatsApp texto (Meta Cloud API) | ✅ | Webhook único + token global + phone_number_id por agente |
| WhatsApp credenciales POR TENANT | ⏳ | Diseño en `docs/whatsapp-onboarding-analysis.md`; `Integration.encryptedConfig` listo, el envío no lo consume aún |
| Audio WhatsApp (STT ElevenLabs scribe_v1, fallback Whisper opcional) | ✅ | Gating por agente y plan |
| Llamadas IA (ElevenLabs Conversational AI) | 🟡 | Backend completo (webhook firmado, CallLog idempotente, minutos, call-quality, tools en vivo, prompt sync); **falta ELEVENLABS_API_KEY real y pruebas E2E con llamadas reales** |
| Conversaciones/inbox (takeover, etiquetas, asignación, polling 10s) | ✅ | |
| Citas (slot-filling IA, disponibilidad semanal, recordatorios) | ✅ | Recordatorios se disparan con botón; **cron automático ⏳** |
| Excel agenda (export/plantilla/import con preview) | ✅ | exceljs, anti-duplicados, solo OWNER/ADMIN |
| Catálogo (productos/servicios, ITBIS, stock, categorías, alias) | ✅ | Básico a propósito (no inventario avanzado) |
| Documentos/conocimiento (KnowledgeDocument+Chunk, búsqueda simple) | ✅ | Sin embeddings/RAG complejo (decisión #21) |
| Cotizaciones + PDF | ✅ | Puppeteer |
| Dashboard (métricas, polling 30s) | ✅ | |
| Herramientas externas (/integrations) | ✅ | Estados computados en vivo |
| Soporte IA (playbooks, tickets, triage T1/T2/T3, /admin/soporte) | ✅ | Ver sección I |
| Panel SUPER_ADMIN (tenants, planes, voz, cancelaciones, soporte) | ✅ | |
| Onboarding self-service post-registro | ✅ | Usuario sin tenant → crea empresa |

---

## E. Arquitectura técnica

- **Frontend**: React 18 + Vite + TypeScript + Tailwind. Cliente API único
  (`lib/api.ts`) con sobre `{success,data}`, `credentials:'include'`, helpers
  download/upload. Polling con `useAutoRefresh` (pausa con pestaña oculta).
- **Backend**: Node.js + Express + TypeScript (ESM). Capas: routes →
  controllers (zod) → services → Prisma. Errores via `AppError` + handler
  central (500 sin detalles en prod).
- **DB**: PostgreSQL. **Prisma 7 con driver adapter `@prisma/adapter-pg`**
  (pool node-postgres propio). ⚠️ Drift conocido: usar SIEMPRE `prisma db push`,
  NUNCA `migrate dev/reset`.
- **Sesiones**: cookie httpOnly `sid` (token opaco → sha256 en tabla Session,
  cache Redis con fallback a BD). Sin JWT ni localStorage (decisión #2).
- **CORS**: allowlist `CORS_ORIGIN` con `credentials:true`. Prod cross-domain:
  usar subdominios + `COOKIE_DOMAIN` (la cookie es sameSite strict en prod).
- **Pooling**: runtime `DATABASE_POOL_URL || DATABASE_URL`; migraciones
  `DIRECT_URL || DATABASE_URL`. Compatible PgBouncer transaction mode.
  Doc: `backend/docs/db-pooling.md`.
- **Deployment previsto**: Netlify (frontend) + Railway (backend) + Azure
  PostgreSQL o compatible. ⏳ No desplegado aún.
- **Env vars**: validadas al arranque con zod (`config/env.ts`); el proceso no
  levanta si falta una obligatoria. Catálogo completo: `docs/ENVIRONMENT_VARIABLES.md`.
- **Rate limiting**: por familia (auth 10/15min, register 5/h, IA 30/15min,
  webhooks 1000, admin 200, uploads 30…), store Redis si está disponible.
- **Logging**: winston (LOG_LEVEL), prefijos por módulo (`[WHATSAPP WEBHOOK]`,
  `[RUNTIME]`, `[QUALITY]`, `[ELEVENLABS]`, `[BILLING LIMIT]`, `[SUPPORT ...]`).
- **Secretos**: solo en backend; integraciones por tenant cifradas AES-256-GCM
  (`Integration.encryptedConfig`); API nunca devuelve valores (solo
  `configured: true/false`).

---

## F. Flujo de agente IA (ciclo de vida)

1. **Crear agente** (Agentes → Nuevo): nombre, tipo (ventas/soporte/citas/custom), tono, modelo.
2. **Configurar objetivo** con prompt base o plantilla por defecto (vender/cotizar/agendar/FAQs/escalar).
3. **Cargar contexto**: Entrenamiento (descripción, servicios, FAQs, horarios,
   políticas), Catálogo con precios, Documentos.
4. **Conectar canal**: asignar `whatsappPhoneNumberId` (WhatsApp) y/o
   `elevenLabsAgentId` (llamadas, Enterprise).
5. **Probar**: `POST /api/agents/:id/test` (dry-run del runtime real: muestra
   respuesta, intent/outcome, confianza, acciones, tokens, control de gasto).
6. **Activar**: status ACTIVE.
7. **Responder**: webhook → runtime → respuesta + acciones (cotización, cita...).
8. **Escalar humano**: requiresHuman → conversación HUMAN_ACTIVE + handoff en
   el inbox ("Esperando humano"); el bot calla hasta que lo devuelvan.
9. **Registrar uso**: tokens (UsageMetric + UsageCounter), mensajes, minutos,
   métricas de calidad por turno (conversation.metadata.qualityMetrics).

---

## G. Runtime IA

- **OpenAI = texto/razonamiento** (chat.completions con JSON schema estricto).
  **ElevenLabs = audio (STT) + voz/llamadas** (Conversational AI). Decisiones #7–8.
- **Prompt builder** (`agent-runtime/agent-prompt.builder.ts`) en capas:
  identidad/objetivo → canal (whatsapp_text | whatsapp_audio | voice_call | test)
  → reglas de naturalidad → contexto del negocio → fecha/citas → seguridad
  (anti-invención) → clasificación y control de gasto → datos verificados.
- **Context providers** (pre-retrieval por mensaje): negocio (trainingConfig),
  catálogo (búsqueda + alias), documentos (KnowledgeChunk), disponibilidad de
  citas (appointmentSettings), historial (últimos 10 turnos).
- **Decisión estructurada**: intent de acción + conversationIntent (12 valores)
  + outcome (7 valores) + productRequests + appointmentRequest + requiresHuman
  + confidence.
- **Actions** (ejecutadas por backend, nunca por la IA directamente):
  responder · buscar catálogo · agregar a cotización · generar PDF · crear cita
  (slot-filling validado contra disponibilidad) · pedir humano · **cerrar
  conversación improductiva** (spam/wrong-number/off-topic reincidente).
- **Safeguards**: precheck por reglas sin tokens; timeout 30s + 2 retries;
  JSON inválido → respuesta segura + escalamiento; fallo de acción no tumba la
  conversación; todo logueado.

---

## H. Control de costos

| Recurso | Mecanismo |
|---|---|
| Mensajes | `UsageCounter` mensual vs `monthlyMessageLimit` del plan (o override custom); al agotar: IA pausada, mensaje entra al inbox, aviso al cliente 1 vez/mes |
| Tokens OpenAI | Registro por llamada; `monthlyTokenLimit` opcional por plan; precheck de reglas evita ~1,800 tokens por turno spam/equivocado |
| Minutos de voz | `VoiceUsageCounter` mensual idempotente por llamada; entitlement solo Enterprise; 180 min/usuario default |
| Llamadas improductivas | `call-quality.service.ts` clasifica post-call (SILENCE/WRONG_NUMBER/SPAM/UNPRODUCTIVE...); el prompt de voz ordena cortar llamadas sin propósito |
| Conversaciones improductivas | Política de calidad: off-topic 1 redirección y cierre; spam reincidente = silencio; 4 vueltas sin avance = humano |
| Límites custom | Overrides por tenant en Subscription (mensajes/tokens/usuarios/agentes/números/minutos) — solo SUPER_ADMIN |

---

## I. Soporte

- **Tiers**: T1 problemas conocidos con guía automatizada (sin escrituras),
  T2 triage asistido (crea ticket), T3 incidentes (ESCALATED/CRITICAL, health
  snapshot, acciones automáticas bloqueadas).
- **Playbooks**: 15 en `docs/support-playbooks/` + índice; regla: cada feature
  actualiza su playbook (checklist en `FEATURE_RELEASE_CHECKLIST.md`).
- **Support assistant conectado a producción con permisos limitados**:
  `/api/support/*` con sesión SUPER_ADMIN o token interno `SUPPORT_AGENT_TOKEN`
  (scopes `support:read`, `support:triage`, `support:tickets:write`; sin
  billing/delete/SQL/secrets). Contextos con allowlist + máscaras; audit log.
- **Panel**: `/admin/soporte` (triage IA, tickets, resolución, sugerencia de
  playbook). Tenants: "Solicitar soporte" en Cuenta.

---

## J. QA checklist (funcional)

- [ ] Registro → onboarding → dashboard.
- [ ] Login/logout (con confirmación) y recuperación de contraseña (dev logs).
- [ ] Google OAuth con credenciales reales configuradas.
- [ ] Crear agente → entrenar → probar en panel → conectar número → responder WhatsApp real.
- [ ] Cliente pregunta producto real / inexistente / pide cita / pide humano / spam / número equivocado.
- [ ] Audio de WhatsApp transcrito y respondido (plan Pro+).
- [ ] Cotización con PDF enviada.
- [ ] Cita creada por IA validando disponibilidad; recordatorio manual enviado.
- [ ] Excel: exportar, plantilla, import con preview y anti-duplicados.
- [ ] Límite de plan alcanzado → IA se pausa, inbox sigue recibiendo.
- [ ] Llamada IA Enterprise: entitlement, minutos, post-call, calidad (requiere ELEVENLABS_API_KEY).
- [ ] Inbox: takeover/devolver al bot, etiquetas, asignación, polling.
- [ ] Admin: crear tenant manual con plan custom, suspender/reactivar, reset de uso.
- [ ] Soporte: triage T1/T2/T3, ticket tenant, OWNER sin acceso staff.
- [ ] Sin secrets en ninguna respuesta de API.
- [ ] Builds backend/frontend y `prisma db push` limpios.
