# Playbook: Incidentes (Tier 3)

- **Feature**: Respuesta a incidentes que afectan a varios tenants o a todo el sistema.
- **Riesgo**: CRÍTICO — el agente de soporte NUNCA remedia automáticamente un Tier 3.

## Qué es un incidente
- Caída global o producción inaccesible.
- Webhook WhatsApp caído para varios tenants.
- Base de datos sin responder.
- Error 500 masivo.
- Fuga potencial de datos (cross-tenant, secrets expuestos).
- Cobros incorrectos masivos.
- Consumo anormal de tokens/minutos (fuga de costos).
- Rate limiting bloqueando tráfico legítimo de forma generalizada.

## Protocolo del agente de soporte
1. Crear ticket `tier: TIER_3`, `severity: CRITICAL`, `status: ESCALATED`, `source: AI`.
2. Adjuntar en metadataJson: health snapshot, hora de detección, tenants afectados conocidos, síntomas reportados.
3. Registrar en SupportAuditLog la creación del incidente.
4. **Bloquear acciones automáticas**: a partir de aquí solo diagnóstico de lectura.
5. Notificar a SUPER_ADMIN (el panel lo muestra arriba; canal externo pendiente).
6. Recomendar checklist (rollback en deployment.md, salud DB en database.md).

## Qué NO hacer
- No reiniciar servicios, no tocar envs, no resetear contadores, no reintentar webhooks masivamente, no "arreglar" datos.

## Cierre del incidente
- SUPER_ADMIN documenta la resolución en el ticket.
- El agente sugiere la actualización del playbook correspondiente (nunca autoedita si el cambio es de riesgo).
- Postmortem breve en el ticket: causa raíz, detección, tiempo de resolución, prevención.

## Severidades
| Severity | Criterio |
|---|---|
| CRITICAL | Producción caída o dinero/datos comprometidos |
| HIGH | Feature principal caída para varios tenants |
| MEDIUM | Degradación con workaround |
| LOW | Molestia sin impacto de negocio |
