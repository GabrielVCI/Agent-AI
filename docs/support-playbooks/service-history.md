# Playbook: Historial de servicios y recurrencias (Módulo 3)

- **Feature**: Cierre de citas con registro de servicios y productos, historial con precios del día, métricas de visita y recordatorios de mantenimiento.
- **Tier por defecto**: TIER_1 · **Riesgo**: MEDIO (afecta métricas del cliente y mensajes automáticos futuros)

## Descripción
Cuando una cita se marca **COMPLETADA**, Sendwary la convierte en actividad real:

```txt
Cita completada
  → 1 visita del cliente
  → los servicios y productos quedan registrados con el precio de ESE día
  → se actualizan visitas / última visita
  → si algún servicio se repite, se programa su recordatorio
```

Conceptos clave para soporte:
- **Una cita completada = una visita.** Tres servicios en la misma cita siguen siendo **una** visita.
- Canceladas y no-show **no** cuentan como visita.
- Los precios del historial son **fotos del día**: cambiar la tarifa hoy no reescribe el pasado.
- **Producto vendido** ≠ **material usado**: el material que se gasta durante el servicio no se le cobra al cliente.

Detalle técnico completo: `docs/SERVICE_HISTORY.md`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "Le di dos veces a Completar, ¿contó dos visitas?" | No. La operación es idempotente: una visita, un juego de servicios, un recordatorio. |
| "Marqué la cita completada y el cliente sigue con 0 visitas" | La cita no tiene cliente vinculado (`customerId`). Suele ser una cita antigua sin teléfono usable. Escalar TIER_2. |
| "El cliente tiene 3 servicios y me cuenta 3 visitas" | No debería. Si pasa, son 3 **citas** distintas, no 3 servicios en una. Revisar el listado de citas por fecha. |
| "Cerré la cita por error" | Usar **Reabrir** en el listado. Revierte la visita, recalcula las métricas y cancela los seguimientos que había programado. |
| "No me deja agregar un servicio a una cita" | Está cerrada. El historial es de solo lectura: hay que **reabrirla** primero. Es intencional. |
| "El total de la cita no incluye el tinte" | Correcto: está marcado como **material usado**, que no se le cobra al cliente. |
| "Subí el precio del servicio y el historial viejo no cambió" | Correcto y deliberado: quien pagó 800 sigue viendo 800. |
| "No se programó el recordatorio de retoque" | Tres causas posibles: (1) el servicio no tiene recurrencia configurada en el Catálogo; (2) la cita se cerró sin ese servicio como línea; (3) el negocio no tiene activa la automatización de mantenimiento. |
| "El recordatorio salió a una hora rara" | Cae a las 10:00 **hora del negocio**. Si la zona horaria de la empresa está mal en Configuración, todo se corre. |
| "Le puse 'cada 1 mes' y esperaba 30 días" | No son lo mismo a propósito: 1 de enero + 1 mes = 1 de febrero; + 30 días = 31 de enero. |
| "El cliente volvió antes y le llegó el recordatorio viejo" | No debería: al repetir el mismo servicio el aviso anterior se cancela y se recalcula. Si ocurrió, escalar TIER_2 con el `jobId`. |
| "Se repitió la coloración y se canceló el aviso de keratina" | No debería: cada servicio tiene su propio seguimiento. Escalar TIER_2. |
| "Aparece 'Valor realizado' y el cliente pagó otra cosa" | **No es dinero cobrado.** Es lo que costaban los servicios del día. Sendwary aún no registra pagos. |
| "Vendí un producto y no se descontó del inventario" | Correcto hoy: la venta en cita **no** mueve stock. Es una limitación conocida, no un bug. |
| "No veo el botón Servicios" | Solo OWNER/ADMIN gestionan líneas. Otros roles solo consultan. |

## Diagnóstico
1. `/appointments` → botón **Servicios** de la cita: muestra qué quedó registrado y con qué precio.
2. Ficha del cliente → **Próximos seguimientos**: son automatizaciones reales ya programadas. Si está vacío, no hay nada programado (no es un fallo de la pantalla).
3. Catálogo → el servicio: ¿dice "Se repite cada X"? Si no, no hay recurrencia configurada.
4. `/api/automations/rules` → ¿existe una regla ACTIVA con evento `SERVICE_USED`? Sin ella no se programa nada aunque el servicio tenga recurrencia.
5. `GET /api/customers/:id/summary` → de dónde sale cada cifra.
6. Zona horaria de la empresa en Configuración: afecta a la hora de todos los recordatorios.

## Pasos de solución
- **Cierre equivocado** → Reabrir la cita. Todo se reconcilia solo (visitas, historial, seguimientos).
- **Faltó registrar un servicio** → Reabrir → Servicios → agregar → volver a Completar.
- **Servicio que no se llegó a hacer** → marcarlo como "no realizado" antes de cerrar; no entra al historial ni suma importe.
- **Activar recordatorios de mantenimiento** → 1) configurar la recurrencia del servicio en el Catálogo; 2) instanciar la plantilla `service-maintenance-reminder` y ponerla ACTIVA.
- **Cambiar la fecha de un seguimiento** → ficha del cliente → icono de reloj. Usa el motor, no crea un job duplicado.
- **Cancelar un seguimiento** → ficha del cliente → ✕. Queda CANCELADO con su motivo (no se borra).
- **Métricas raras tras corregir citas** → se recalculan enteras en cada cierre/reapertura; no se suman a mano.

## Automatizable por el agente (Tier 1)
- Explicar que una cita completada es una visita, aunque tenga varios servicios.
- Explicar que canceladas y no-show no cuentan.
- Explicar por qué el precio histórico no cambia al subir la tarifa.
- Explicar la diferencia entre producto vendido y material usado.
- Explicar que "valor realizado" no es dinero cobrado.
- Guiar para configurar la recurrencia de un servicio.
- Explicar que "1 mes" y "30 días" no son lo mismo.

## Requiere humano (Tier 2+)
- Citas completadas sin cliente vinculado (métricas que no suben).
- Un recordatorio que se envió pese a que el cliente ya había vuelto.
- Un seguimiento que canceló al de otro servicio.
- Integrar la venta en cita con el inventario (no existe).
- Definir cobros/facturación reales para tener un "total pagado".

## Riesgo
MEDIO. Un cierre equivocado afecta a las métricas del cliente y puede programar un mensaje que llegará al cliente final. **Siempre** preferir Reabrir a manipular datos.

## Logs
```txt
[APPOINTMENTS] cierre procesado tenant=<id> appointment=<id> customer=<id> lineas=<n>
[APPOINTMENTS] cierre idempotente tenant=<id> appointment=<id>
[APPOINTMENTS] cita reabierta tenant=<id> appointment=<id>
automation.job.cancelled tenantId=<id> ... reason=Cita reabierta
```

## Variables de entorno
Ninguna propia del módulo. Depende de la **zona horaria** de la empresa.

## Endpoints
```txt
POST   /api/appointments/:id/complete
POST   /api/appointments/:id/reopen
GET    /api/appointments/:id/lines
POST   /api/appointments/:id/lines
PATCH  /api/appointments/:id/lines/:lineId
DELETE /api/appointments/:id/lines/:lineId

GET    /api/customers/:id/followups
DELETE /api/customers/:id/followups/:jobId
PATCH  /api/customers/:id/followups/:jobId
```

## Escalamiento
- **Visitas duplicadas** tras un doble clic → TIER_3: la idempotencia falló, es crítico.
- **Mensaje enviado a un cliente equivocado** → TIER_3 inmediato.
- Historial de otra empresa visible → TIER_3 inmediato.
- Backfill de citas antiguas: `npm run backfill:service-history -- --dry` primero.
