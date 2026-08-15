# Playbook: Agentes IA

- **Feature**: CRUD de agentes, prompt/entrenamiento, prueba interna, runtime unificado con clasificación y control de gasto.
- **Tier por defecto**: TIER_1 (config) / TIER_2 (calidad de respuestas) · **Riesgo**: BAJO-MEDIO

## Descripción
Cada agente tiene systemPrompt, tono, modelo, número de WhatsApp y flags (audio, handoff, voz). El runtime (`agent-runtime/`) hace precheck sin tokens → decisión OpenAI (JSON schema) → veredicto de calidad → acciones validadas. La "Prueba" del panel usa EXACTAMENTE el mismo runtime en dry-run.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "El agente no responde" | status DISABLED, sin número, plan sin cuota, conversación HUMAN_ACTIVE, o OPENAI_API_KEY caída |
| "Responde cosas inventadas" | Falta catálogo/entrenamiento: el prompt anti-invención necesita datos verificados |
| "Se repite o corta conversaciones" | Control de gasto activo (off-topic/spam) — revisar qualityMetrics de la conversación |
| Prueba del panel da 503 | OPENAI_API_KEY no configurada |
| Prueba da 502 | Error real de OpenAI (rate limit, modelo inválido) |

## Diagnóstico
1. `GET /api/support/context/tenant/:tenantId` → agentes (status, número, modelo).
2. `POST /api/agents/:id/test` (como tenant) muestra intent/outcome/costControlReason.
3. `conversation.metadata.qualityMetrics` → última clasificación del turno.
4. UsageMetric AI_REPLY con success:false → errores del modelo.

## Pasos de solución
- Activar agente / asignar número / completar Entrenamiento y Catálogo.
- Respuestas malas → mejorar trainingConfig (servicios, FAQs, políticas) y catálogo con precios.
- Cortes injustificados → revisar si el cliente disparó patrones de spam/wrong-number.

## Automatizable por el agente (Tier 1)
- Detectar agente inactivo/sin número/sin entrenamiento y dar checklist.
- Interpretar costControlReason y explicar por qué el bot cortó.

## Requiere humano
- Cambiar OPENAI_API_KEY, ajustar prompts base del sistema, revisar calidad caso a caso (Tier 2).

## Logs / env / endpoints
- Logs: `[RUNTIME]`, `[QUALITY]`, `[AGENT PROMPT]`, `❌ Error ejecutando IA`.
- Env: `OPENAI_API_KEY`, `OPENAI_DEFAULT_MODEL`, `OPENAI_MAX_OUTPUT_TOKENS`, `OPENAI_TEMPERATURE`.
- Endpoints: `/api/agents` CRUD, `POST /api/agents/:id/test`.

## Escalamiento
Calidad mala persistente con config correcta → Tier 2 con ejemplos de conversación (resumen, no transcripciones completas). Errores OpenAI masivos en todos los tenants → Tier 3.
