# Sendwary — Roadmap to QA y Producción

> Estado honesto a julio 2026. La app corre completa en local (builds verdes,
> suites ad-hoc pasando). NO está desplegada aún.

---

## Bloqueadores para QA (sin esto no se puede probar de verdad)

| # | Bloqueador | Detalle |
|---|---|---|
| B1 | **Credenciales Google OAuth** | Código listo; crear OAuth Client en Google Cloud + `GOOGLE_CLIENT_ID/SECRET` (guía: `backend/docs/google-oauth.md`) |
| B2 | **Número/token de WhatsApp de pruebas** | `META_WHATSAPP_TOKEN` + `META_VERIFY_TOKEN` + phone_number_id de una WABA de prueba; sin esto solo se prueba con el panel interno |
| B3 | **ELEVENLABS_API_KEY** (solo para QA de audio/llamadas) | Audio STT y llamadas Enterprise no se pueden probar E2E sin la key |
| B4 | **Entorno staging desplegado** | Netlify + Railway + Postgres gestionado con PgBouncer; hoy todo es local |
| B5 | **Seeds de planes alineados a precios cerrados** | Verificar que `seed:plans` refleje US$40/60/90 + límites 3k/6k/10k (LOCKED #14–16) |

## Falta para producción (además de lo anterior)

- **Proveedor de email** (Resend/SES/SMTP) para recuperación de contraseña — hoy el link solo sale en logs de dev.
- **Cookie cross-domain**: decidir dominios (recomendado `app.` + `api.` mismo dominio raíz + `COOKIE_DOMAIN`); la cookie actual es sameSite strict.
- **Cron de recordatorios de citas** (hoy es botón manual) — puede ser Railway cron o scheduler simple.
- **LemonSqueezy** con overlay embebido (cuando se active cobro online; el manual funciona ya).
- **SUPPORT_AGENT_TOKEN** definido si se conecta el asistente de soporte externo.
- **Backups/retención** de PostgreSQL (config del proveedor) + plan de restore probado.
- **Monitoreo de errores** (Sentry o similar) — hoy solo winston a consola.
- **WhatsApp por tenant** (fase diseñada, no requerida para primeros clientes en modelo BSP).

---

## Prioridades

**ALTA (antes de QA):** B1–B5 · revisar textos/UX de errores comunes · pasar el
QA checklist de `PRODUCT_AND_TECH_SPEC.md` sección J en local.

**MEDIA (durante QA / antes de primer cliente):** proveedor de email · cron de
recordatorios · monitoreo de errores · dominio + cookies prod · hardening de
CORS_ORIGIN por entorno · revisar copy de landing.

**BAJA (post-lanzamiento):** LemonSqueezy overlay · WhatsApp por tenant +
Embedded Signup · quality_rating monitor · Google Sheets/Graph · SSE/WebSockets
si el polling queda corto · RAG con embeddings · workflows visuales.

## Orden recomendado

1. Staging: Railway (backend + Postgres + PgBouncer/pooler) y Netlify (frontend) con envs de `docs/ENVIRONMENT_VARIABLES.md`.
2. `prisma db push` con DIRECT_URL + `seed:plans` verificado (B5).
3. Configurar Google OAuth (B1) y probar login/registro/Google en staging.
4. WABA de prueba (B2): webhook verificado + agente respondiendo un número real.
5. ElevenLabs (B3): un audio transcrito y una llamada Enterprise de prueba.
6. Ejecutar el QA checklist completo (sección J del spec) en staging.
7. Email provider + cron de recordatorios.
8. Checklist de producción y go-live con 1 cliente piloto en modelo manual.

---

## Checklist final LOCAL
- [ ] `npm run build` backend y frontend en verde.
- [ ] `npx prisma db push` sin cambios pendientes.
- [ ] Suites ad-hoc: calidad conversacional (18), Excel+reset (23), soporte (30) pasando.
- [ ] Login, onboarding, agente de prueba, panel test con OpenAI real.
- [ ] Sin secrets en respuestas de API (test de soporte lo cubre).

## Checklist STAGING
- [ ] Backend arranca sin errores de env (zod valida al inicio).
- [ ] `GET /health` y `GET /api/support/health` OK (db/redis/configs).
- [ ] Cookies funcionan tras login (dominios/CORS correctos).
- [ ] Google OAuth end-to-end.
- [ ] Webhook WhatsApp verificado y conversación real completa (texto + audio).
- [ ] Cita creada por IA + recordatorio; Excel export/import.
- [ ] Límite de plan simulado (script simulate-usage) → IA se pausa.
- [ ] Llamada Enterprise de prueba con minutos descontados.
- [ ] Panel admin completo + soporte con triage.
- [ ] Rate limits activos (Redis) y logs legibles.

## Checklist PRODUCCIÓN
- [ ] DATABASE_POOL_URL (pooler) + DIRECT_URL (migraciones) + DB_POOL_MAX dimensionado.
- [ ] SESSION_SECRET/ENCRYPTION_KEY únicos de prod (nunca reutilizar dev).
- [ ] COOKIE_DOMAIN + HTTPS en ambos dominios.
- [ ] CORS_ORIGIN solo dominios reales.
- [ ] Webhooks Meta/ElevenLabs apuntando al dominio prod con secrets propios.
- [ ] Email provider activo (reset de contraseña llega de verdad).
- [ ] Backups automáticos + prueba de restore.
- [ ] Monitoreo de errores + alertas básicas.
- [ ] SUPPORT_AGENT_TOKEN (si aplica) y playbooks al día.
- [ ] Cliente piloto configurado (tenant manual, plan, número, agente entrenado).
