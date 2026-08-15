# Auditoría de consistencia de datos (fase 2026-07-14)

Objetivo: los datos mostrados corresponden SIEMPRE a la base de datos real,
con refresco casi en tiempo real, sin mocks, sin cross-tenant y sin
sobrecargar el backend.

## Estrategia realtime elegida

**Polling inteligente + invalidación de cache en backend** (sin WebSocket/SSE):

- Frontend: hooks sobre `useLiveQuery` (`frontend/src/hooks/useLiveQuery.ts` +
  `hooks/data.ts`) y `useAutoRefresh` — el intervalo **se pausa con la pestaña
  oculta** y refresca al volver (cero requests de fondo → no rompe rate limits).
- Backend: el cache Redis del dashboard (TTL 60s) ahora **se invalida tras cada
  mutación** relevante (`invalidateDashboardCache(tenantId)`, DEL de claves
  fijas, nunca KEYS/SCAN) y soporta bypass manual `?fresh=1` (botón Actualizar).
- Un refetch silencioso fallido **conserva los datos previos** y muestra aviso
  no intrusivo (`staleWarning`), nunca datos vacíos falsos.

Intervalos (Parte A): dashboard 30s · inbox 10s (hilo abierto 5s en hook /
mismo ciclo de 10s en la página actual) · citas 30s · catálogo 60s · agentes
60s · billing 60s · soporte 30s · admin 60s.

## Mapa endpoint → pantalla

| Endpoint | Pantalla | Datos | Fuente DB (real) | Filtro tenant | Refresh | Riesgos → corrección |
|---|---|---|---|---|---|---|
| `GET /api/dashboard/summary` | Dashboard | Conversaciones (total/bot/humanas/cerradas/sin responder), mensajes (total/in/out/**hoy**), cotizaciones, **citas próximas/pendientes**, **productos activos**, **agentes activos**, uso del plan | `count()` Prisma sobre Conversation/Message/Quote/Appointment/Product/Agent/Subscription | ✅ `tenantId` en todos los where | Poll 30s + botón `?fresh=1` | Cache 60s sin invalidar → **corregido** (invalidación + fresh). Métricas nuevas agregadas |
| `GET /api/dashboard/by-phone`, `/agent-performance`, `/human-interventions`, `/quotes`, `/activity`, `/customers`, `/usage` | Dashboard / Cuenta | Métricas por número/agente/handoffs/cotizaciones/actividad/clientes/uso | counts y agregados Prisma reales | ✅ | Igual que summary (mismo cache invalidable) | Igual que summary → corregido |
| `GET /api/dashboard/audio` | Dashboard | Audios recibidos/transcritos/fallidos | **ANTES: stub hardcoded con ceros** → AHORA: `UsageMetric` (AUDIO_TRANSCRIPTION, metadata.success) del mes | ✅ | Poll 30s | Mock eliminado (era el único dato falso encontrado) |
| `GET /api/conversations` | Inbox | Lista + `pagination:{page,limit,total,pages}` | `findMany` + `count` con los MISMOS filtros | ✅ | Poll 10s (+ hilo abierto) | `total` es count real ✅. Contrato documentado abajo |
| `GET /api/conversations/:id/messages` | Inbox hilo | Mensajes | `findMany` | ✅ (valida pertenencia) | Poll 10s / hook 5s | — |
| `GET /api/appointments` | Citas | Lista con filtros fecha/estado | `findMany` | ✅ | Poll 30s | — |
| `GET /api/catalog/items` | Catálogo | Ítems + categorías | `findMany` | ✅ | Recarga tras CRUD propio; hook `useCatalogItems` (60s) disponible | Cambios externos al catálogo son raros; riesgo bajo |
| `GET /api/agents` | Agentes | Lista + stats | `findMany` + counts | ✅ | Recarga tras CRUD; hook `useAgents` (60s) disponible | riesgo bajo |
| `GET /api/account/plan`, `/api/account/invoices` | Cuenta (billing) | Plan, uso, facturas | Subscription/UsageCounter reales | ✅ | **Poll 60s agregado** | Antes solo cargaba al montar → corregido |
| `GET /api/support/tickets` | Admin soporte / Cuenta | Tickets | `findMany` + filtros validados | ✅ (usuarios tenant solo su tenant; staff todos) | Poll 30s (ya existía) | — |
| `GET /api/admin/tenants`, `/api/admin/cancellation-requests` | Admin overview | Agregados globales | `findMany` global (solo SUPER_ADMIN) | N/A global por diseño; **nunca** se mezcla con dashboard tenant (rutas y páginas separadas) | **Poll 60s agregado** | Antes solo al montar → corregido |
| `GET /api/voice/usage` (CallsPage/VoiceUsageCard) | Llamadas | Minutos usados | CallLog/VoiceUsageCounter reales, sin cache | ✅ | Carga al montar | riesgo bajo (los minutos cambian al terminar llamadas) |

## Invalidación tras mutations (Parte C)

`invalidateDashboardCache(tenantId)` (best-effort, fire-and-forget) se ejecuta en:

- **Conversaciones/mensajes** (`conversation.service.ts`): crear conversación,
  mensaje entrante, respuesta del agente IA, respuesta manual humana, tomar
  (takeover), devolver a IA (release), cerrar. Cubre también el flujo del
  webhook de WhatsApp (usa estas mismas funciones).
- **Citas** (`appointment.service.ts` → `logAppointmentEvent`, chokepoint de
  TODAS las mutaciones): crear, editar, confirmar, cancelar, no-show,
  completar, recordatorio.
- **Catálogo** (`catalog.controller.ts`): crear/editar/estado/eliminar ítem.
- **Agentes** (`agents.controller.ts`): crear/editar/estado/deshabilitar.
- **Cotizaciones y consumo billing**: se generan dentro del flujo de mensajes
  (ya cubierto por la invalidación de mensajes).
- **Llamadas y tickets de soporte**: no alimentan el cache del dashboard
  (se leen sin cache), no requieren invalidación.

## Contrato de paginación (actualizado en la fase de listados 2026-07)

**Estándar nuevo** (citas y catálogo):
```json
{ "success": true, "data": { "items": [...], "total": 42, "page": 1,
  "limit": 20, "pages": 3, "filters": { "dateFrom": "...", "defaultRangeApplied": true } } }
```

**Forma legacy** (conversaciones y admin tenants — se mantiene, documentada):
`data` es el array y `pagination`/`total` van como hermanos en la raíz.

El frontend normaliza AMBAS formas con `lib/pagination.ts →
normalizePaginatedResponse()`. `total` es SIEMPRE `count()` real con los
mismos filtros aplicados. Reglas frontend: todo filtro va al backend, cambiar
cualquier filtro resetea `page=1`, search con debounce 300ms.

**Citas**: sin `dateFrom/dateTo` el backend aplica ÚLTIMOS 30 DÍAS
(`defaultRangeApplied: true` en la respuesta); el export a Excel pasa
`applyDefaultRange: false` y exporta el histórico completo. Botones en UI:
"Próximas citas" (hoy → +60d) y "Limpiar fechas" (vuelve al default).
Listados sin paginar por diseño (datasets pequeños): categorías, agentes,
etiquetas, llamadas.

## Hallazgos y correcciones

1. **Cache del dashboard sin invalidación** (causa del "muestra 3 cuando hay
   4"): hasta 60s de datos viejos incluso pulsando Actualizar → invalidación
   en mutations + `?fresh=1` en el botón.
2. **Stub de audio con ceros hardcoded** (`audioMetricsController`): único
   mock encontrado → reemplazado por métricas reales de `UsageMetric`.
3. **Poll silencioso que borraba datos al fallar** (DashboardPage) → ahora
   conserva datos previos + `staleWarning` no intrusivo.
4. **Billing y Admin overview sin refresco** → poll 60s silencioso.
5. **Faltaban métricas operativas** en summary (mensajes hoy, citas
   próximas/pendientes, productos activos, agentes activos) → agregadas
   (counts reales) + tarjetas en el dashboard.
6. Sin datos → se muestra **0 real** (counts de Prisma), nunca defaults.

## Riesgo conocido (documentado, no corregido en esta fase)

- **Timezone**: `startOfMonth()`, "mensajes hoy" y el bucketing por día usan
  la hora del SERVIDOR, no el `Tenant.timezone` (America/Santo_Domingo por
  defecto). Si el servidor corre en UTC, los conteos de "hoy"/mes pueden
  desplazarse ±4h en los bordes. Corrección futura: calcular los rangos con
  `Intl`/luxon en el timezone del tenant.
- `lastMessageAt` se actualiza en todos los flujos (creación, inbound vía
  `updateConversationLastMessage`, outbound manual, eventos de cita) ✅.

## Cómo probar consistencia (Parte H)

1. Crear una cita (panel o API) → `GET /api/dashboard/summary` refleja
   `upcomingAppointments`/`pendingAppointments` de inmediato (sin esperar 60s).
2. Crear/desactivar un producto → `activeProducts` cambia de inmediato.
3. Crear/desactivar un agente → `activeAgents` cambia de inmediato.
4. Tomar/cerrar una conversación → `humanInterventions`/`closedConversations`
   cambian de inmediato; el inbox lo refleja en ≤10s sin recargar.
5. Mensaje WhatsApp entrante real → conteos de mensajes/conversaciones al
   próximo poll (≤30s) o al instante con el botón Actualizar.
6. Botón "Actualizar" del dashboard → siempre datos frescos (`?fresh=1`).
7. Simular fallo (apagar backend) con el dashboard abierto → aviso no
   intrusivo y datos previos conservados; al volver el backend, se recupera solo.
