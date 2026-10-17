# Playbook: Panel de automatizaciones

- **Feature**: Pantalla `/automatizaciones` — crear, activar, pausar y archivar reglas; usar plantillas; ver la cola de envíos programados y la salud del motor.
- **Tier por defecto**: TIER_1 · **Riesgo**: ALTO (una regla activa envía mensajes reales a clientes finales)

## Descripción
El panel es la cara del motor (Módulo 0). Traduce el motor a tres preguntas:

```txt
CUANDO…    (evento: se agenda una cita, el cliente visita, se realiza un servicio…)
ENTONCES…  (acción: WhatsApp, correo, nota interna, etiqueta, categoría)
¿CUÁNDO?   (enseguida · tras X tiempo · relativo a una fecha · a una hora concreta)
```

Más dos ajustes opcionales: **Solo si…** (condiciones) y **Cancelar lo pendiente si…**.

Reglas de oro para soporte:
- Toda automatización nueva nace en **BORRADOR**. No envía nada hasta que alguien la **Activa**.
- Las **plantillas** también se agregan como borrador.
- **Archivar** cancela los envíos pendientes de esa regla; el historial de lo ya enviado se conserva.
- El panel solo ofrece acciones que el motor **puede ejecutar de verdad** (salen de su catálogo).

Detalle técnico del motor: `docs/AUTOMATION_CORE.md`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "Creé la automatización y no envía nada" | Está en **Borrador**. Hay que pulsar **Activar**. Es el caso más frecuente. |
| "La activé y sigue sin enviar" | El evento no ha ocurrido todavía. Las reglas son reactivas: sin cita creada/completada no hay envío. Comprobar en **Envíos programados**. |
| "El evento dice *(aún no disponible)*" | Sendwary todavía no emite ese evento desde ningún módulo (cumpleaños, inactividad…). La regla se guarda pero **nunca se dispara**. El panel lo avisa antes de guardar. |
| "No me deja elegir 'Relativo a una fecha'" | Ese evento no trae fechas en su payload. Solo las citas (`fecha de la cita`) y los servicios (`próxima fecha recomendada`). |
| "Puse `{{apellido}}` y llegó vacío" | Solo existen las variables que muestra el formulario: `{{nombre}}`, `{{negocio}}`, `{{servicio}}`, `{{fecha}}`, `{{hora}}`. |
| "El recordatorio no salió y la cita era mañana" | Con "relativo a la fecha", si la fecha calculada **ya pasó** el motor no programa nada (no tiene sentido recordar una cita de ayer). |
| "Le llegó el recordatorio a alguien que canceló" | A la regla le falta el evento en **Cancelar lo pendiente si…** (p. ej. "Se cancela una cita"). |
| "Un envío aparece como Falló" | El error saneado se muestra en la propia fila. Lo más común: el cliente no tiene conversación de WhatsApp, o el número del negocio no está conectado. |
| "Dice 'Enviando' desde hace rato" | Job atascado. El motor lo recupera solo a los 15 min; el panel avisa si hay varios. |
| "Edité las condiciones y me dice que no se pueden tocar" | La regla usa condiciones avanzadas (anidadas o con `not`) que el panel no sabe pintar. **Se conservan intactas**; para cambiarlas hace falta soporte. |
| "Agregué la plantilla dos veces" | No se puede: instanciar la misma plantilla devuelve la que ya existe. Deja de aparecer en la lista de plantillas. |
| "Asigné una categoría con una regla y ya no puedo ponerla a mano" | Correcto: al gestionarla una regla pasa a **automática**. Al archivar la regla vuelve a ser manual. |
| "No veo los botones Activar/Editar" | Solo OWNER/ADMIN gestionan automatizaciones. Otros roles solo consultan. |

## Diagnóstico
1. `/automatizaciones` → estado de la regla: ¿**Activa** o **Borrador/Pausada**?
2. Pestaña **Envíos programados** → ¿existe el job? Filtrar por estado.
   - Sin job → el evento no ocurrió, o la fecha calculada ya había pasado, o la regla estaba inactiva cuando ocurrió.
   - Job `FAILED` → leer el error de la fila (ya viene saneado, sin tokens).
   - Job `CANCELLED` → el motivo lo dice la propia fila.
3. Contadores de arriba (Programados / Enviados / Fallidos) = cifras reales de la cola, no estimaciones.
4. "Próximo envío" indica que el worker tiene trabajo pendiente y para cuándo.
5. `GET /api/automations/health` para el detalle crudo.

## Pasos de solución
- **No envía** → Activar la regla. Verificar después en Envíos programados.
- **Recordatorio de cita** → plantilla "Recordatorio de cita (24 h antes)" → Activar.
- **Recordatorio de mantenimiento** → 1) configurar la recurrencia del servicio en el **Catálogo**; 2) plantilla "Recordatorio de mantenimiento del servicio"; 3) Activar. Sin el paso 1 no se programa nada.
- **Evitar mensajes a quien canceló** → editar la regla → **Cancelar lo pendiente si…** → marcar "Se cancela una cita".
- **Parar todo de una regla** → Pausar (deja de crear envíos nuevos) o Archivar (además cancela los pendientes).
- **Parar un envío concreto** → pestaña Envíos programados → ✕ en esa fila.
- **Mensaje mal escrito ya programado** → editar la regla NO reescribe los envíos ya creados: cancelar los pendientes y dejar que se vuelvan a generar.

## Automatizable por el agente (Tier 1)
- Explicar que una automatización nueva nace en borrador y hay que activarla.
- Guiar para usar una plantilla.
- Explicar las variables disponibles del mensaje.
- Explicar por qué un evento marcado "(aún no disponible)" no dispara.
- Explicar la diferencia entre Pausar y Archivar.
- Guiar los dos pasos del recordatorio de mantenimiento (catálogo + regla).

## Requiere humano (Tier 2+)
- Condiciones avanzadas (el panel las muestra en solo lectura).
- Envíos fallidos repetidos por WhatsApp no conectado → playbook `whatsapp.md`.
- Jobs atascados en "Enviando" que no se recuperan solos → TIER_3 (worker).

## Riesgo
**ALTO**: activar una regla hace que Sendwary escriba a clientes reales. Antes de activar cualquier cosa masiva, confirmar el texto con el negocio. Nunca activar una automatización "para probar" en una empresa con clientes reales sin avisar.

## Logs
```txt
automation.event.received / automation.job.scheduled
automation.job.cancelled tenantId=<id> count=<n> reason=<motivo>
automation.job.rescheduled tenantId=<id> jobId=<id>
```

## Endpoints
```txt
GET    /api/automations/catalog        (eventos, acciones y plantillas reales)
GET    /api/automations/health
GET    /api/automations/rules
POST   /api/automations/rules
PATCH  /api/automations/rules/:id      (activar / pausar / editar)
DELETE /api/automations/rules/:id      (archivar)
POST   /api/automations/rules/from-template
GET    /api/automations/jobs
POST   /api/automations/jobs/:id/cancel
GET    /api/automations/executions
```

## Escalamiento
- Mensaje enviado a la persona equivocada → **TIER_3 inmediato**.
- Reglas o envíos de otra empresa visibles → TIER_3 inmediato.
- La cola crece y nada se envía → revisar el worker (playbook `incidents.md`).
