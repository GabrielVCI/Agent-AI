# Playbook: Citas

- **Feature**: Citas manuales y por IA (slot-filling), disponibilidad semanal, recordatorios WhatsApp, import/export Excel.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO-MEDIO (recordatorios envían mensajes reales)

## Descripción
El agente IA crea citas cuando reúne nombre+servicio+fecha; valida contra la disponibilidad configurada (weeklySchedule en appointmentSettings). `autoConfirmAI` confirma automático SOLO si hay horario configurado.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "La cita no aparece" | Filtros de fecha/estado/prioridad activos en la vista |
| "La IA no confirma citas" | Sin weeklySchedule configurado (quedan PENDING por diseño) |
| "Dice que el horario no está disponible" | Choque con slot lleno o fuera de horario semanal |
| "No llegan recordatorios" | reminderEnabled apagado, o se ejecuta manual ("Enviar recordatorios") |
| Import Excel rechaza filas | Formato de fecha/hora/teléfono inválido o duplicados (mismo teléfono+fecha/hora) |

## Diagnóstico
1. Vista Citas sin filtros (limpiar desde/hasta/estado).
2. `GET /api/appointments/settings` → reminderEnabled, weeklySchedule, autoConfirmAI.
3. Import: usar SIEMPRE la vista previa; los errores vienen por fila.

## Pasos de solución
- Configurar disponibilidad semanal para que la IA confirme sola.
- Recordatorios: activar y disparar "Enviar recordatorios" (aún no hay cron automático).
- Excel: descargar plantilla oficial y corregir las filas reportadas.

## Automatizable por el agente (Tier 1)
- Detectar filtros como causa de "cita desaparecida".
- Detectar weeklySchedule null y explicar el efecto en autoconfirmación.
- Interpretar errores por fila del import Excel.

## Requiere humano
- Borrar citas, cambios masivos.

## Logs / env / endpoints
- Logs: `[EXCEL IMPORT]`, eventos `📅 Cita`.
- Endpoints: `/api/appointments` CRUD + `/settings`, `/process-reminders`, `/export/excel`, `/template/excel`, `/import/excel?preview=true`.

## Escalamiento
Citas creadas por IA con fecha/hora incorrecta sistemática → Tier 2 (zona horaria/parsing) con ejemplos.
