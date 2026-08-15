# Playbook: ElevenLabs (llamadas IA y transcripción de audio)

- **Feature**: Agentes de voz (Conversational AI) con webhook post-call firmado, tools en vivo, y STT de audios de WhatsApp (scribe_v1).
- **Tier por defecto**: TIER_1 (config) / TIER_2 (calidad) · **Riesgo**: MEDIO

## Descripción
La API key vive SOLO en backend. El prompt de voz se sincroniza al guardar el agente (`syncAgentToElevenLabs`). El post-call llega firmado (HMAC) a `/api/voice/...`, registra CallLog idempotente, descuenta minutos y evalúa calidad (call-quality.service).

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "Las llamadas no funcionan" | ELEVENLABS_API_KEY ausente, agente sin elevenLabsAgentId, o tenant sin entitlement de voz (solo Enterprise) |
| "La llamada no aparece en el panel" | Webhook con firma inválida (secret), o agente de ElevenLabs no vinculado a Sendwary |
| "Los audios de WhatsApp no se transcriben" | Proveedor deshabilitado, plan sin allowAudioTranscription, o agente con allowAudioMessages off |
| "Tools no responden en la llamada" | VOICE_TOOLS_TOKEN faltante/incorrecto en la config de tools |

## Diagnóstico
1. `GET /api/support/health` → `elevenLabs.configured`.
2. `GET /api/support/context/tenant/:tenantId` → agentes con voz, entitlement.
3. Logs `[ELEVENLABS]` (firma inválida, agente no mapeable, post-call procesado).

## Pasos de solución
- Vincular `elevenLabsAgentId` al agente y re-guardar (re-sincroniza el prompt).
- Entitlement: solo tenants Enterprise con voz habilitada por SUPER_ADMIN.
- Audio WhatsApp: activar allowAudioMessages en el agente y verificar el plan.

## Automatizable por el agente (Tier 1)
- Checklist: key configurada → agente vinculado → entitlement → minutos disponibles.

## Requiere humano
- Rotar keys/secrets, crear agentes en ElevenLabs, habilitar voz a un tenant.

## Logs / env / endpoints
- Logs: `[ELEVENLABS]`, `[VOICE]`.
- Env: `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `VOICE_TOOLS_TOKEN`, `AUDIO_TRANSCRIPTION_PROVIDER`, `ALLOW_OPENAI_AUDIO_FALLBACK`.
- Endpoints: webhook post-call y tools en `/api/voice/*`.

## Escalamiento
Llamadas caídas para todos los tenants o webhooks 5xx sostenidos → Tier 3. Calidad de voz/transcripción mala → Tier 2 con callLog ids.
