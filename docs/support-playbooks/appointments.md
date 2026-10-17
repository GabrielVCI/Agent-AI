# Playbook: Citas

- **Feature**: Citas manuales y por IA (slot-filling), disponibilidad semanal, recordatorios WhatsApp, import/export Excel.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO-MEDIO (recordatorios envían mensajes reales)

## Descripción
El agente IA crea citas cuando reúne nombre+servicio+fecha; valida contra la disponibilidad configurada (weeklySchedule en appointmentSettings). `autoConfirmAI` confirma automático SOLO si hay horario configurado.

**Vínculo con el Maestro de Clientes (Módulo 1)**: toda cita se asocia a una ficha de cliente (`Appointment.customerId`) por teléfono normalizado. Al **confirmar** una cita, el contacto pasa a ser CLIENTE. Al **completarla**, cuenta como **una visita** y actualiza las métricas de la ficha (una cita = una visita, aunque incluya varios servicios). Las citas canceladas y los no-show no cuentan como visita. Ver `docs/CUSTOMER_MASTER.md` y el playbook `customers.md`.

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

## Relación con automatizaciones
Cada transición de cita (crear, confirmar, posponer, completar, cancelar, no-show)
emite un evento al Automation Core: de ahí salen recordatorios y seguimientos
programados. Si el cliente reporta que "no llegó el recordatorio", revisar
también `automations.md` (`GET /api/automations/jobs?status=FAILED`).
Cancelar/posponer una cita cancela o mueve sus envíos pendientes automáticamente.
La importación por Excel NO emite eventos (evita disparos masivos).

## Escalamiento
Citas creadas por IA con fecha/hora incorrecta sistemática → Tier 2 (zona horaria/parsing) con ejemplos.
