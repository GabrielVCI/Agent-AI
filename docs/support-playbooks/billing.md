# Playbook: Billing / Planes / Límites

- **Feature**: Planes (BASIC/PRO/ENTERPRISE), suscripción por tenant, contadores de uso mensual (mensajes/conversaciones/tokens) y enforcement.
- **Tier por defecto**: TIER_1 (límites) / TIER_2 (inconsistencias) · **Riesgo**: ALTO (NUNCA cambios automáticos)

## Descripción
`UsageCounter` acumula uso mensual; `checkAiAllowance` bloquea la IA al agotar cuota (el mensaje entra igual al inbox y pasa a atención humana; el aviso al cliente se envía una vez al mes). El agente de soporte JAMÁS modifica planes, pagos ni contadores.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "La IA dejó de responder a mis clientes" | `[BILLING LIMIT]` cuota mensual agotada |
| "Mi plan no permite audio/llamadas" | Feature no incluida en el plan (allowAudioTranscription / entitlement de voz) |
| "El contador no cuadra" | Percepción vs conteo real (in+out cuentan); o reset manual pendiente |
| "Quiero subir de plan" | Flujo comercial (LemonSqueezy o manual vía SUPER_ADMIN) |

## Diagnóstico
1. `GET /api/support/context/tenant/:tenantId` → plan, uso del mes, límites.
2. Logs `[BILLING LIMIT] tenant ...` confirman bloqueo activo.

## Pasos de solución
- Límite alcanzado → explicar el ciclo mensual y opciones de upgrade; el reset de uso lo hace SOLO un SUPER_ADMIN (`POST /api/admin/tenants/:id/reset-usage`).
- Feature bloqueada por plan → indicar qué plan la incluye.

## Automatizable por el agente (Tier 1)
- Diagnosticar "IA no responde" por límite y explicar al usuario (SIN cambiar nada).
- Mostrar uso vs límite del tenant.

## Requiere humano (SIEMPRE)
- Cambios de plan, resets de uso, reembolsos, ajustes de contadores, cualquier escritura de billing.

## Logs / env / endpoints
- Logs: `[BILLING LIMIT]`.
- Endpoints (solo lectura para soporte): contexto tenant. Escrituras: solo `/api/admin/*` con sesión SUPER_ADMIN.

## Escalamiento
Contadores claramente incorrectos o doble conteo → Tier 2 con números exactos. Cobro/bloqueo incorrecto MASIVO → Tier 3 (incidente, congelar acciones automáticas).
