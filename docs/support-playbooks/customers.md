# Playbook: Maestro de Clientes (Módulo 1)

- **Feature**: Ficha única de cliente por empresa — alta manual, alta automática desde WhatsApp/citas, importación CSV/Excel, listado con filtros, perfil con métricas e historial.
- **Tier por defecto**: TIER_1 · **Riesgo**: MEDIO (contiene datos personales: teléfono, correo, cédula, dirección, cumpleaños)

## Descripción
Cada empresa tiene su propio maestro. Un cliente se identifica por su **teléfono normalizado a E.164** (`+18095555555`): el mismo número escrito de cualquier forma es el mismo cliente. Dos empresas distintas SÍ pueden tener el mismo número.

Sendwary distingue **contacto** de **cliente**:
- `CONTACT` → escribió por WhatsApp o llamó, pero aún no hay relación comercial.
- `CLIENT` → tiene una cita confirmada, o lo dio de alta/importó el negocio.
- `ARCHIVED` → archivado por el negocio (nunca se borra: cuelgan conversaciones, citas y cotizaciones).

Detalle técnico completo: `docs/CUSTOMER_MASTER.md`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "Me dice que el cliente ya existe y yo no lo veo" | Existe con el teléfono en otro formato. El aviso trae el botón "Ver su ficha". También puede estar **archivado**: filtrar por "Archivados". |
| "Escribí el teléfono y no me deja guardar" | El número no es válido para el país del negocio. Pedirle que lo escriba con código de país (`+1 809 555 5555`). |
| "Aparece gente que no es cliente mío" | Son `CONTACT`: escribieron por WhatsApp. Es correcto. Filtrar por "Clientes" para ver solo los confirmados. |
| "Un cliente sale con 0 visitas y sí vino" | Solo cuentan las citas marcadas **COMPLETADA**. Si quedó en PENDIENTE o CONFIRMADA, no es visita. |
| "El total no cuadra con lo que me pagó" | Sendwary **no** registra ventas ni cobros todavía. La cifra es **lo cotizado**, y la ficha lo advierte. |
| "Importé y dice que 20 ya existían" | Deduplicación por teléfono: ya estaban en el maestro. Reimportar el mismo archivo nunca duplica. |
| "El archivo no se sube" | Solo `.csv` y `.xlsx`, máximo 5 MB y 5.000 filas. Un Excel renombrado a `.csv` se rechaza a propósito. |
| "Faltan columnas obligatorias" | El archivo no trae `Nombre`, `Apellido` o `Teléfono`. Descargar la plantilla oficial desde el modal de importación. |
| "El contacto no tiene apellido" | Vino de WhatsApp con un nombre de una sola palabra. **No se inventa** apellido: se completa editando la ficha. |
| "Cambié el nombre en el inbox y en Clientes sale otro" | Ambos escriben en la misma ficha; si difieren, forzar recarga (`?fresh=1` en dashboard) y revisar la conversación. |
| "Aparecen dos fichas del mismo cliente" | Duplicado histórico anterior al Módulo 1 (uno de los dos quedó sin teléfono canónico). El backfill los reporta; **la fusión es manual**, escalar a TIER_2. |
| "El botón Importar no aparece" | Solo OWNER/ADMIN pueden crear e importar. Un usuario con otro rol solo consulta. |

## Diagnóstico
1. Buscar en `/clientes` por teléfono **sin formato** (`8095555555`): la búsqueda es tolerante y encuentra el canónico.
2. Filtrar por "Archivados" antes de concluir que un cliente no existe.
3. Ficha del cliente → pestaña **Historial**: muestra citas, cotizaciones, conversaciones y mensajes automáticos con fecha.
4. `GET /api/customers/:id/summary` → de dónde sale cada cifra (visitas = citas completadas).
5. Si sospechas duplicados en la empresa: `npm run backfill:customers -- --dry` los lista sin escribir nada.

## Pasos de solución
- **Duplicado al crear** → usar "Ver su ficha" y editar la existente en vez de crear otra.
- **Teléfono mal escrito** → editar la ficha; el número se renormaliza y se revalida contra el resto del maestro.
- **Visitas que no cuadran** → marcar la cita como COMPLETADA en `/appointments`; las métricas se recalculan solas desde las citas (no se suman a mano).
- **Import con errores** → el resultado indica fila y motivo. Corregir esas filas y volver a subir el archivo completo: las buenas no se duplican.
- **Cliente que ya no atiende el negocio** → Archivar (nunca borrar).
- **Etiquetas/segmentación** → las etiquetas de la ficha (`tags`) describen a la persona; las del inbox describen una conversación. Son ejes distintos, no un error.

## Automatizable por el agente (Tier 1)
- Explicar contacto vs cliente y por qué alguien que solo escribió "Hola" aparece en la lista.
- Explicar que el importe es **cotizado**, no facturado.
- Explicar la definición de visita (cita COMPLETADA) y por qué una cancelada o un no-show no cuentan.
- Guiar la importación: plantilla, columnas obligatorias, límites y lectura del resumen.
- Explicar por qué un contacto de WhatsApp no tiene apellido.

## Requiere humano
- Fusionar dos fichas duplicadas (no hay UI: hoy es intervención manual sobre datos).
- Restaurar un cliente archivado por error si el negocio no lo encuentra.
- Cualquier caso donde una empresa vea datos de otra: **TIER_3 inmediato**.

## Logs / env / endpoints
- Logs: `[CUSTOMERS] alta manual…`, `[CUSTOMERS] carrera resuelta…`, `[CUSTOMERS] contacto promovido a cliente…`, `[CUSTOMER IMPORT] tenant=… creados=…`. Los teléfonos van enmascarados (`•••••1234`) y **nunca** se escriben cédulas.
- Env: `DEFAULT_PHONE_COUNTRY` (país asumido si el número no trae código internacional y la zona horaria de la empresa no se reconoce; default `DO`).
- Endpoints: `/api/customers/*` (tenant, cookie `sid`; crear/editar/importar solo OWNER/ADMIN).
- Scripts: `npm run backfill:customers [-- --dry]` (idempotente, no destructivo).

## Escalamiento
- Un cliente de una empresa visible desde otra → **TIER_3 inmediato** (aislamiento multi-tenant).
- Importación que crea duplicados pese a la deduplicación → TIER_3 (revisar el índice único `Customer_tenantId_phoneNormalized_key`).
- Métricas de visita que no coinciden con las citas tras recalcular → TIER_2.
