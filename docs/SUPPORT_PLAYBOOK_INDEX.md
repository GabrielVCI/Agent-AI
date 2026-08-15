# Índice de Support Playbooks

Fuente de conocimiento del asistente IA de soporte (`backend/src/services/support-agent/`
los carga en runtime desde `docs/support-playbooks/`).

**Regla de oro**: toda feature nueva o modificada DEBE actualizar (o crear) su
playbook en el mismo cambio. Ver `FEATURE_RELEASE_CHECKLIST.md`.

> Responsable default: Gabriel (founder). Se asignan owners específicos cuando
> el equipo crezca.

## Playbooks existentes

| Playbook | Categoría | Tier típico | Riesgo | Estado | Responsable |
|---|---|---|---|---|---|
| [auth.md](support-playbooks/auth.md) | Autenticación | T1 | Bajo | ✅ Completo | Gabriel |
| [google-oauth.md](support-playbooks/google-oauth.md) | Autenticación | T1/T2 | Bajo | ✅ Completo (feature 🟡: faltan credenciales) | Gabriel |
| [password-recovery.md](support-playbooks/password-recovery.md) | Autenticación | T1 | Bajo | ✅ Completo (feature 🟡: sin email provider) | Gabriel |
| [whatsapp.md](support-playbooks/whatsapp.md) | Canal WhatsApp | T1/T3 | Medio | ✅ Completo | Gabriel |
| [agents.md](support-playbooks/agents.md) | Agentes IA | T1/T2 | Bajo-Medio | ✅ Completo | Gabriel |
| [conversations.md](support-playbooks/conversations.md) | Inbox | T1 | Bajo | ✅ Completo | Gabriel |
| [catalog.md](support-playbooks/catalog.md) | Catálogo | T1 | Bajo | ✅ Completo | Gabriel |
| [appointments.md](support-playbooks/appointments.md) | Citas (incluye Excel) | T1 | Bajo-Medio | ✅ Completo | Gabriel |
| [billing.md](support-playbooks/billing.md) | Billing/planes | T1/T2 | Alto | ✅ Completo | Gabriel |
| [lemonsqueezy.md](support-playbooks/lemonsqueezy.md) | Pagos | T2 | Alto | ✅ Completo (feature 🟡: sin credenciales) | Gabriel |
| [elevenlabs.md](support-playbooks/elevenlabs.md) | Voz/Audio | T1/T2 | Medio | ✅ Completo (feature 🟡: sin key real) | Gabriel |
| [voice-minutes.md](support-playbooks/voice-minutes.md) | Voz | T1 | Medio | ✅ Completo | Gabriel |
| [database.md](support-playbooks/database.md) | Infraestructura | T3 | Crítico | ✅ Completo | Gabriel |
| [deployment.md](support-playbooks/deployment.md) | Infraestructura | T3 | Alto | ✅ Completo (deploy real ⏳) | Gabriel |
| [incidents.md](support-playbooks/incidents.md) | Incidentes | T3 | Crítico | ✅ Completo | Gabriel |

## Playbooks faltantes (⏳ pendientes)

| Playbook | Cubriría | Prioridad | Responsable |
|---|---|---|---|
| `onboarding.md` | Registro self-service, creación de empresa, primeros pasos | Media | Gabriel |
| `knowledge.md` | Documentos de conocimiento (subida, chunks, búsqueda) | Media | Gabriel |
| `dashboard.md` | Métricas, normalizadores, "no cuadra un número" | Baja | Gabriel |
| `integrations.md` | Herramientas externas (estados de conectores) | Baja | Gabriel |
| `support.md` | El propio módulo de soporte (tickets, triage, scopes) | Baja | Gabriel |
| `email.md` | Proveedor de correo (cuando exista) | Al implementar mailer | Gabriel |

## Formato estándar de cada playbook
Feature · Descripción · Errores comunes/Síntomas · Diagnóstico · Pasos de
solución · Automatizable por el agente (Tier 1) · Requiere humano · Riesgo ·
Logs · Variables env · Endpoints · Escalamiento.

## Cómo aprende el sistema
1. El agente de soporte clasifica cada caso contra estos playbooks (triage).
2. Si un admin cierra un ticket con una resolución nueva, el agente genera una
   *sugerencia de actualización de playbook* (snippet markdown) en el ticket.
3. Un humano revisa y pega la sugerencia en el playbook — el agente NUNCA
   autoedita playbooks.
