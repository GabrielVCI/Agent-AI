# Playbook: Minutos de voz

- **Feature**: Control de minutos de llamadas IA por tenant (entitlement solo Enterprise), contadores mensuales idempotentes por llamada.
- **Tier por defecto**: TIER_1 · **Riesgo**: MEDIO (los resets son solo humanos)

## Descripción
`VoiceUsageCounter` acumula minutos del mes; el entitlement se calcula por plan + configuración de voz del tenant (voiceSettings). Cada llamada se registra una sola vez (elevenLabsCallId único). Si el tenant pierde el derecho a mitad de mes, las llamadas ya ocurridas se registran igual (marcadas en metadata).

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "No puedo usar llamadas" | Plan no-Enterprise o voz no habilitada para el tenant |
| "Se acabaron los minutos" | Límite mensual alcanzado |
| "Los minutos no cuadran" | Redondeo por llamada (se cobra el minuto iniciado) o llamadas duplicadas percibidas (el registro es idempotente) |

## Diagnóstico
1. `GET /api/support/context/tenant/:tenantId` → minutos usados/límite, entitlement.
2. CallLogs del tenant: duración y estado por llamada.

## Pasos de solución
- Sin entitlement → explicar requisito Enterprise; habilitación la hace SUPER_ADMIN (`PUT /api/admin/tenants/:id/voice`).
- Minutos agotados → esperar ciclo o ampliar límite (SUPER_ADMIN).

## Automatizable por el agente (Tier 1)
- Mostrar consumo vs límite y explicar el redondeo.

## Requiere humano (SIEMPRE)
- Reset de minutos (`POST /api/admin/tenants/:id/voice/reset-usage`), cambiar límites, habilitar voz.

## Logs / env / endpoints
- Logs: `[VOICE]`, `[ELEVENLABS] post-call procesado`.
- Env: `ELEVENLABS_INCLUDED_MINUTES`, `SENDWARY_ENTERPRISE_VOICE_BUDGET_PER_USER_USD`, `SENDWARY_DEFAULT_ENTERPRISE_VOICE_MINUTES_PER_USER`.
- Endpoints: `/api/voice/*` (uso), admin voice endpoints.

## Escalamiento
Consumo anómalo repentino (posible abuso o bug) → Tier 3 si es masivo, Tier 2 si es un tenant.
