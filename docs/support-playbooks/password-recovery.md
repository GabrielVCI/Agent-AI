# Playbook: Recuperación de contraseña

- **Feature**: Flujo forgot/reset con token hasheado de un solo uso (60 min) y revocación de sesiones.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO

## Descripción
`POST /api/auth/forgot-password` responde SIEMPRE genérico. El token solo existe en el link; en BD va el sha256. Al resetear se revocan todas las sesiones. Sin proveedor de email: el link solo aparece en logs en desarrollo; en producción se registra el evento sin token.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "No me llega el correo" | No hay proveedor de email configurado en producción (pendiente) |
| "El enlace no es válido o expiró" | Token >60 min, ya usado, o se pidió otro después (invalida el anterior) |
| "Dice contraseña débil" | Requisitos: 8+, mayúscula, minúscula, número y símbolo |
| Cuenta Google | Puede usar este flujo para crear contraseña local |

## Diagnóstico
1. `GET /api/support/context/user/:userId` → existe, status, authProvider.
2. En dev: buscar `[PASSWORD RESET] link` en logs.

## Pasos de solución
- Pedir un nuevo enlace (invalida el viejo) y usarlo en menos de 60 min.
- Producción sin correo → SUPER_ADMIN asiste manualmente mientras no haya provider.

## Automatizable por el agente (Tier 1)
- Guiar el flujo completo y explicar los requisitos de contraseña.
- Detectar la falta de proveedor de correo y escalar la asistencia manual.

## Requiere humano
- Configurar proveedor de email; asistencia manual de reset en producción.

## Logs / env / endpoints
- Logs: `[PASSWORD RESET]`.
- Env: `FRONTEND_URL` (base del link). Pendiente: provider de email.
- Endpoints: `POST /api/auth/forgot-password`, `GET /api/auth/reset-password/validate`, `POST /api/auth/reset-password`.

## Escalamiento
Sospecha de tokens filtrados o resets no solicitados en masa → Tier 3 (seguridad).
