# Playbook: Categorías y segmentación de clientes (Módulo 2)

- **Feature**: Clasificación de clientes por empresa — categorías manuales, categorías automáticas (VIP, riesgo), asignación desde la ficha, filtro por categorías en el listado.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO (no contiene datos personales; sí puede exponer segmentación comercial)

## Descripción
Cada empresa crea sus propias categorías ("Coloración", "Keratina", "Corporativo"). Un cliente puede estar en varias a la vez.

Hay **dos tipos** y la diferencia importa mucho en soporte:
- **Manual** → la pone y la quita una persona del negocio.
- **Automática** (chispa ✨) → la mantiene Sendwary. **No se puede asignar ni quitar a mano.**

Hoy hay dos automáticas de sistema, y ambas son el **reflejo de un campo de la ficha del cliente**:
- **VIP** ← el botón "Marcar VIP" de la ficha (`Customer.isVip`).
- **Riesgo de abandono** ← el riesgo medio/alto de la ficha (`Customer.riskStatus`).

Las categorías **no se borran**: se archivan, y los clientes conservan su historial.

Detalle técnico completo: `docs/CUSTOMER_CATEGORIES.md`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "No me deja quitarle la categoría VIP" | Es automática. Se quita apagando el botón **VIP en la ficha del cliente**, no desde las categorías. Es intencional: si se quitara a mano volvería sola. |
| "Creé 'VIP' y me dice que ya existe" | Ya tenía una llamada `vip`, `Vip` o ` VIP `. Mayúsculas, espacios y acentos **no** crean categorías distintas. |
| "Mi colega creó 'Coloración' y yo 'coloracion' — ¿son dos?" | No. Son la misma; la segunda da error de duplicado con el enlace a la existente. |
| "Otra empresa también tiene 'VIP', ¿se mezclan?" | No. La unicidad es **por empresa**. Nunca hay categorías compartidas. |
| "Archivé una categoría y los clientes la siguen mostrando" | Correcto y deliberado: el historial no se pierde. Deja de ofrecerse para asignaciones nuevas. |
| "No puedo archivar VIP ni Riesgo de abandono" | Son de sistema: reflejan un campo de la ficha que siempre existe. Archivarlas dejaría el panel diciendo una cosa y la ficha otra. |
| "Filtré por dos categorías y salen menos clientes de los que esperaba" | El filtro está en **Todas** (el cliente debe estar en las dos). Cambiar a **Alguna**. |
| "El contador dice 42 y al filtrar veo 40" | El contador incluye clientes **archivados**; el listado los excluye por defecto. |
| "Cree la categoría pero no la veo en la ficha del cliente" | El selector de la ficha solo ofrece categorías **manuales activas**. Si la creaste archivada o es automática, no aparece. |
| "Le di dos veces a agregar y quedó duplicada" | No puede: hay una restricción en base de datos. Se queda una sola. |
| "El campo Etiquetas de la ficha ya no filtra" | Las etiquetas son texto libre legado. El eje que filtra son las **categorías**. Cada etiqueta que escribe una automatización crea además su categoría. |
| "No veo el botón Nueva categoría" | Solo OWNER/ADMIN crean y editan. Otros roles solo consultan. |
| "Puse un color y salió morado" | Solo se aceptan los colores de la paleta del panel. Cualquier otro valor cae al de por defecto. |

## Diagnóstico
1. `/clientes/categorias` → ver tipo (Manual/Automática), estado y número real de clientes.
2. ¿Falta una categoría? Activar **"Ver archivadas"** antes de concluir que no existe.
3. Ficha del cliente → tarjeta **Categorías**: las de chispa son automáticas y el tooltip dice quién las mantiene.
4. `GET /api/customer-categories` → contrato real (`type`, `status`, `isSystem`, `managedBy`, `customerCount`).
5. Contradicción VIP: comparar el botón VIP de la ficha con la insignia. Si no coinciden, editar cualquier campo del cliente fuerza la sincronización.

## Pasos de solución
- **Quitar un VIP** → ficha del cliente → botón "Quitar VIP". La categoría desaparece sola.
- **Sacar a alguien de "Riesgo de abandono"** → ficha → cambiar el riesgo a Sin riesgo o Bajo.
- **Duplicado al crear** → usar la categoría existente que indica el error; renombrarla si el nombre no gustaba.
- **Dejar de usar una categoría** → Archivar (nunca borrar). Se puede restaurar.
- **Renombrar** → Editar. El nombre bonito cambia; los clientes asignados no se tocan.
- **Clasificar a muchos clientes** → asignación masiva desde la API (`POST /api/customer-categories/:id/customers`), máximo 200 por operación.
- **Tope de categorías** → 200 activas por empresa. Archivar las que ya no se usan.

## Automatizable por el agente (Tier 1)
- Explicar la diferencia entre categoría manual y automática, y por qué las automáticas no se editan a mano.
- Explicar que VIP y Riesgo se controlan desde la ficha del cliente.
- Explicar la normalización de nombres (mayúsculas/acentos/espacios).
- Explicar la diferencia entre el filtro "Todas" y "Alguna".
- Explicar que archivar conserva el historial.

## Requiere humano (Tier 2+)
- Categorías automáticas por **regla del Automation Core**: hoy se configuran por API, no hay panel.
- Definir los criterios de "Nuevo", "Frecuente" e "Inactivo" (decisión de negocio, todavía sin umbrales).
- Fusionar dos categorías que el negocio creó como sinónimos y quiere unificar (no hay herramienta: requiere script).

## Riesgo
BAJO. No se exponen datos personales. Un error de configuración puede hacer que una campaña salga al segmento equivocado, así que **cualquier cambio masivo se confirma con el negocio antes de aplicarlo**.

## Logs
```txt
[CATEGORIES] alta tenant=<id> id=<id> slug=<slug>
[CATEGORIES] archivada|restaurada tenant=<id> id=<id>
[CATEGORIES] sync de dominio falló tenant=<id> customer=<id> error=...
[CATEGORIES] tope de categorías alcanzado tenant=<id>
```

## Variables de entorno
Ninguna propia del módulo.

## Endpoints
```txt
GET    /api/customer-categories
POST   /api/customer-categories
GET    /api/customer-categories/:id
PATCH  /api/customer-categories/:id
PATCH  /api/customer-categories/:id/archive
POST   /api/customer-categories/:id/customers

GET    /api/customers/:id/categories
POST   /api/customers/:id/categories/:categoryId
DELETE /api/customers/:id/categories/:categoryId

GET    /api/customers?categoryIds=a,b&categoryMatch=all|any
```

## Escalamiento
- Sospecha de **fuga entre empresas** (ver una categoría ajena) → TIER_3 inmediato: es un bug crítico.
- Categoría automática que asigna mal → revisar la regla del Automation Core, no la categoría.
- Migración de etiquetas antiguas → `npm run backfill:customer-categories -- --dry` primero.
