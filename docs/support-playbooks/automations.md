# Playbook: Automatizaciones (Automation Core)

- **Feature**: Motor central de eventos → reglas → jobs → envíos programados (recordatorios, seguimientos, etiquetas, notas internas).
- **Tier por defecto**: TIER_2 · **Riesgo**: MEDIO (los jobs envían mensajes reales al cliente final)

## Descripción
Cada tenant define reglas (`AutomationRule`): evento + condiciones + acción + cuándo. Los módulos de Sendwary emiten eventos (citas, contactos nuevos) y el motor programa `AutomationJob`. Un worker dentro del backend los ejecuta cuando vencen, con reintentos y auditoría (`AutomationExecution`). Los envíos de WhatsApp usan la integración oficial del propio tenant; nunca la de otro.

Detalle técnico completo: `docs/AUTOMATION_CORE.md`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "Creé la automatización y no pasa nada" | La regla quedó en `DRAFT` (las plantillas nacen en borrador): solo se disparan las `ACTIVE` y `enabled` |
| "No llegó el recordatorio" | La cita se creó con menos margen que el offset (24 h antes ya pasó ⇒ no se programa), o el job quedó `FAILED` |
| Job `FAILED` con `NO_WHATSAPP_AGENT` | El tenant no tiene agente ACTIVO con número de WhatsApp conectado |
| Job `FAILED` con `WHATSAPP_NOT_CONNECTED` | La integración del número no está `CONNECTED` (ver playbook whatsapp.md) |
| Job `FAILED` con `BILLING_MESSAGE_LIMIT` | Se agotó el límite mensual del plan: la automatización no consume más cuota |
| Job `COMPLETED` pero el cliente no recibió nada | Ejecución `SKIPPED`: la conversación estaba en modo humano o cerrada (por diseño no se interrumpe al operador) |
| "Se enviaron dos mensajes iguales" | Revisar si hay DOS reglas distintas para el mismo evento: el motor nunca duplica dentro de una misma regla (UNIQUE de idempotencia) |
| "El mensaje salió a las 3 a. m." | La regla usa `DELAY` en vez de `DAILY_AT_LOCAL_TIME` |
| Muchos jobs en `PROCESSING` | Worker caído: se recuperan solos al vencer el lease (5 min); si crece, escalar |

## Diagnóstico
1. `GET /api/automations/health` (tenant) → pendientes, fallidos, próximo job, último error.
2. `GET /api/automations/jobs?status=FAILED` → `lastErrorCode` y `lastError` (ya saneados, sin tokens).
3. `GET /api/automations/executions?jobId=...` → intentos, duración y motivo real.
4. `GET /api/automations/rules` → estado (`ACTIVE`/`DRAFT`), `enabled`, evento y acción.
5. SUPER_ADMIN: `GET /api/admin/automations/health` y `/api/admin/automations/jobs` (toda la plataforma o `?tenantId=`).

## Pasos de solución
- Regla en borrador → activarla (`PATCH /api/automations/rules/:id` con `status: "ACTIVE"`).
- Job fallido puntual y ya corregida la causa → SUPER_ADMIN: `POST /api/admin/automations/jobs/:id/retry`.
- Envío que ya no debe salir → `POST /api/automations/jobs/:id/cancel` (o archivar la regla, que cancela todos sus pendientes).
- Error de WhatsApp → resolver primero la integración del tenant; los jobs se reintentan/reencolan después.

## Automatizable por el agente (Tier 1)
- Explicar `DRAFT` vs `ACTIVE` y por qué una regla nueva no dispara.
- Traducir `lastErrorCode` a causa entendible.
- Explicar que las ejecuciones `SKIPPED` son intencionales (modo humano / conversación cerrada).

## Requiere humano
- Reintentar o cancelar jobs (SUPER_ADMIN).
- Cambios de plantilla que afecten mensajes ya programados.
- Cualquier `CROSS_TENANT_INTEGRATION`: es un bug de datos, escalar a TIER_3 de inmediato.

## Logs / env / endpoints
- Logs: `automation.event.*`, `automation.job.*`, `automation.worker.*` (incluyen tenantId/jobId/ruleId; nunca tokens).
- Env: `AUTOMATION_WORKER_ENABLED`, `AUTOMATION_BATCH_SIZE`, `AUTOMATION_CONCURRENCY`, `AUTOMATION_POLL_INTERVAL_MS`, `AUTOMATION_JOB_LEASE_MS`, `AUTOMATION_MAX_ATTEMPTS`.
- Endpoints: `/api/automations/*` (tenant), `/api/admin/automations/*` (SUPER_ADMIN).

## Escalamiento
- Cola creciendo sin ejecutarse en todas las instancias → TIER_3 (worker apagado o BD saturada).
- Mensajes enviados con el número equivocado → TIER_3 inmediato (aislamiento multi-tenant).
