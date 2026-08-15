# Playbook: Deployment (Netlify + Railway)

- **Feature**: Frontend en Netlify, backend en Railway, PostgreSQL gestionado.
- **Tier por defecto**: TIER_3 · **Riesgo**: ALTO

## Descripción
Build backend: `tsc`; frontend: `tsc -b && vite build`. Variables por entorno (nunca hardcodeadas). Tras deploy de schema: `prisma db push` con URL directa.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| Frontend carga pero todo da "No se pudo conectar" | VITE_API_URL apuntando mal o backend caído |
| CORS errors en consola | CORS_ORIGIN sin el dominio del frontend |
| Login funciona pero la sesión no persiste | Cookie cross-domain: falta COOKIE_DOMAIN/sameSite correcto |
| 500 tras deploy | Envs faltantes (el backend valida al arrancar y sale con error claro) o db push pendiente |
| OAuth roto tras cambiar dominio | Redirect URI de Google desactualizada |

## Diagnóstico
1. `GET /health` (público) y `GET /api/support/health` (completo).
2. Logs de arranque: `❌ Error en variables de entorno` lista lo que falta.
3. Comparar checklist de envs contra `backend/docs/*.md`.

## Pasos de solución (humano)
- Rollback al deploy anterior si el nuevo rompió producción.
- Completar envs faltantes y redeploy.
- db push pendiente → ejecutarlo con DIRECT_URL.

## Automatizable por el agente
- Diagnóstico de health + listado de configs presentes/ausentes (booleanos). Recomendar checklist de rollback. Sin acciones.

## Checklist de rollback
1. Identificar el último deploy sano. 2. Revertir. 3. Verificar /health. 4. Verificar login + webhook WhatsApp. 5. Postmortem en ticket.

## Escalamiento
Producción inaccesible → Tier 3 CRITICAL inmediato con hora de inicio y último cambio conocido.
