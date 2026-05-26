# Plan de Deployment

## Objetivo

Desplegar el MVP usando Docker Compose y automatizar el proceso con n8n.

## Servicios principales

- Backend Node.js
- PostgreSQL
- n8n
- Admin Panel
- Nginx opcional

## Flujo de deployment

1. Hacer push a GitHub.
2. n8n recibe webhook de GitHub.
3. n8n entra al servidor por SSH.
4. Ejecuta git pull.
5. Ejecuta docker compose build.
6. Ejecuta docker compose up -d.
7. Ejecuta migraciones de base de datos.
8. Verifica endpoint /health.
9. Notifica éxito o error.

## Comando esperado de deployment

```bash
bash scripts/deploy.sh