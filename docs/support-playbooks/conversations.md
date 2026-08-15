# Playbook: Conversaciones / Inbox

- **Feature**: Inbox de conversaciones WhatsApp/VOICE, takeover humano, etiquetas, asignación.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO

## Descripción
Las conversaciones tienen estado OPEN/BOT_ACTIVE/HUMAN_ACTIVE/CLOSED. En HUMAN_ACTIVE el bot NO responde (por diseño). El inbox refresca cada 10 s (polling con pestaña visible).

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "No aparece una conversación" | Filtros activos (estado/etiqueta/agente/asignación) o búsqueda |
| "El bot dejó de responder en un chat" | Conversación en HUMAN_ACTIVE (takeover) o CLOSED por control de calidad |
| "No veo mensajes nuevos" | Pestaña oculta pausa el polling; al volver refresca; verificar también webhook |
| "No puedo responder manualmente" | Rol sin permiso o conversación cerrada |

## Diagnóstico
1. `GET /api/support/context/conversation/:id` → status, canal, contadores, qualityMetrics (sin contenido de mensajes).
2. Revisar si hay handoff OPEN (aparece en "Esperando humano").

## Pasos de solución
- Quitar filtros / limpiar búsqueda.
- Devolver el chat al bot: botón "Devolver al agente" (status BOT_ACTIVE).
- Conversación cerrada por spam/número equivocado: es el control de gasto actuando; si fue un falso positivo, reabrir manualmente y reportar para ajuste de patrones (Tier 2).

## Automatizable por el agente (Tier 1)
- Explicar el estado actual de la conversación y por qué el bot calla.
- Guiar a quitar filtros del inbox.

## Requiere humano
- Reabrir/cerrar masivamente, ajustar patrones de spam del runtime.

## Logs / env / endpoints
- Logs: `[WHATSAPP WEBHOOK]`, `[QUALITY] conversación cerrada`.
- Endpoints: `/api/conversations` (list/mensajes/takeover/release/assign/labels).

## Escalamiento
Mensajes que llegan a Meta pero nunca al inbox (webhook OK en otros tenants) → Tier 2 con conversationId y timestamps. Inbox vacío global → Tier 3.
