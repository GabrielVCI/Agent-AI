# Playbook: LemonSqueezy (checkout y webhooks de pago)

- **Feature**: Checkout de suscripciones y webhook de eventos de pago (opcional; sin credenciales el sistema opera en modo manual).
- **Tier por defecto**: TIER_2 · **Riesgo**: ALTO (dinero — nada automático)

## Descripción
Sin `LEMONSQUEEZY_API_KEY`, create-checkout responde 503 "Billing provider not configured" y los planes se administran manualmente por SUPER_ADMIN. El webhook valida firma con `LEMONSQUEEZY_WEBHOOK_SECRET`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "No puedo pagar / checkout no abre" | Provider no configurado (503) o variant IDs faltantes |
| "Pagué pero mi plan no cambió" | Webhook no llegó / firma inválida / variant no mapeada a plan |
| Webhook 401 en logs | LEMONSQUEEZY_WEBHOOK_SECRET no coincide |

## Diagnóstico
1. `GET /api/support/health` → `lemonSqueezy.configured`.
2. Logs del webhook de billing (firma/evento).
3. Confirmar variant IDs por plan (BASIC/PRO/ENTERPRISE) presentes.

## Pasos de solución
- Config faltante → completar envs y URLs de success/cancel.
- Pago sin reflejar → verificar el evento en el dashboard de LemonSqueezy; si el evento existe y el webhook falló, SUPER_ADMIN asigna el plan manualmente mientras se corrige.

## Automatizable por el agente (Tier 1)
- Detectar provider no configurado y explicar el modo manual.

## Requiere humano (SIEMPRE)
- Asignar/cambiar planes, reintentar webhooks, reembolsos, tocar credenciales.

## Logs / env / endpoints
- Env: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_*_VARIANT_ID`, `LEMONSQUEEZY_SUCCESS_URL`, `LEMONSQUEEZY_CANCEL_URL`.
- Endpoints: `/api/billing/*` (checkout/webhook).

## Escalamiento
Cualquier discrepancia de dinero → Tier 2 mínimo, con IDs de transacción. Cobros incorrectos a varios tenants → Tier 3 inmediato.
