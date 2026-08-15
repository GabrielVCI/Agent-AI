# Playbook: Catálogo

- **Feature**: Productos/servicios con precio, ITBIS, stock, categorías y alias; fuente de verdad del agente IA.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO

## Descripción
El runtime busca coincidencias del catálogo por mensaje y las inyecta como "datos verificados"; el agente nunca inventa precios. Ítems inactivos no se usan.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "El agente no encuentra un producto" | Nombre muy distinto al del cliente (faltan alias), ítem inactivo o catálogo vacío |
| "Precio incorrecto en respuestas" | Precio/ITBIS desactualizado en el ítem |
| "No aparece en el listado" | Filtros (categoría/tipo/estado) o búsqueda activa |
| "Dice que confirmará disponibilidad" | Stock 0/null en producto (comportamiento por diseño) |

## Diagnóstico
1. `GET /api/support/context/tenant/:tenantId` → catálogo: total de ítems activos.
2. Probar el agente desde el panel con el texto del cliente y ver el bloque de coincidencias.

## Pasos de solución
- Catálogo vacío → cargar ítems (o importar); el agente mejora de inmediato.
- Producto no encontrado → agregar alias/nombres comunes o corregir nombre.
- Precio mal → editar ítem; el runtime lo usa al instante (no hay cache).

## Automatizable por el agente (Tier 1)
- Detectar catálogo vacío y guiar la carga.
- Explicar el flujo de alias para nombres coloquiales.

## Requiere humano
- Cargas masivas, decisiones de precios.

## Logs / env / endpoints
- Logs: `[RUNTIME] búsqueda de catálogo falló`.
- Endpoints: `/api/catalog/*` (ítems y categorías).

## Escalamiento
Búsqueda devolviendo resultados incorrectos de forma sistemática → Tier 2 con ejemplos texto→resultado.
