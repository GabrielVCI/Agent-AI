# Playbook: WhatsApp (multi-modo: guiada / manual / demo)

- **Feature**: Conexión multi-modo por tenant, recepción por webhook Meta multi-tenant y envío con token POR TENANT (WhatsAppIntegration).
- **Tier por defecto**: TIER_1 (config tenant) / TIER_2 (conexión asistida) / TIER_3 (webhook caído global) · **Riesgo**: MEDIO

## Descripción
Desde **Herramientas externas → WhatsApp** el cliente elige entre tres modos (`WhatsAppIntegration.mode`):

| Modo | Qué hace el cliente | Qué hace soporte |
|---|---|---|
| `EASY_ONBOARDING` (recomendado) | Rellena checklist + datos de contacto y pulsa "Solicitar conexión guiada" | Recibe ticket `whatsapp-onboarding`, configura el número en Meta y cierra con **mark-connected** desde el panel admin |
| `MANUAL_CLOUD_API` (avanzado) | Wizard de 5 pasos: requisitos → datos de Meta → webhook → validar → asignar agente | Solo diagnostica |
| `DEMO_SANDBOX` | Activa el número demo de Sendwary (cuota `WHATSAPP_DEMO_MESSAGE_LIMIT`) | Verifica que el entorno lo tenga habilitado |

La config vive en `WhatsAppIntegration` (token cifrado AES-256-GCM, `phoneNumberId` único global y **nullable** mientras la conexión guiada no tiene número, `verifyToken` propio por tenant, estados `DRAFT/CONNECTING/CONNECTED/REQUIRES_ACTION/ERROR/DISABLED`). El envío pasa por la abstracción `WhatsAppProviderAdapter` (`services/whatsapp-providers/`): hoy Meta Cloud y demo están implementados; Twilio/360dialog/Infobip/8x8 están declarados y responden "no disponible todavía". El webhook es `GET/POST /api/whatsapp/webhook` (alias `/meta`): el GET acepta el verify token global O el de cualquier tenant; el POST rutea por `phone_number_id` → agente asignado y, si no hay, al primer agente activo del tenant dueño de la integración CONNECTED. El token global `META_WHATSAPP_TOKEN` solo actúa como fallback si `ALLOW_GLOBAL_META_TOKEN_FALLBACK=true` (dev/demo; en producción false). Estrategia y roadmap: `docs/WHATSAPP_ONBOARDING_STRATEGY.md`. Guía manual: `docs/WHATSAPP_SETUP.md`.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "Mi agente no responde WhatsApp" | Integración no CONNECTED (y fallback global apagado), agente DISABLED, sin `whatsappPhoneNumberId`, plan sin cuota, o conversación en HUMAN_ACTIVE |
| Cliente lleva días en "Conectando" | Solicitud de conexión guiada sin atender: revisar `GET /api/admin/whatsapp/assisted-requests` |
| "El modo demo no está disponible" | `WHATSAPP_DEMO_ENABLED=false` o falta `WHATSAPP_DEMO_PHONE_NUMBER_ID` en ese entorno |
| Cliente agotó el demo (429) | Alcanzó `WHATSAPP_DEMO_MESSAGE_LIMIT`: debe conectar su número real |
| "La conexión vía Twilio/360dialog no está disponible" | Proveedor declarado pero sin implementar: escalar a producto, no es un bug |
| Webhook no verifica en Meta | Verify token mal copiado (usar el botón Copiar del wizard, Paso 3) o Callback URL incorrecta/no pública |
| "El token no es válido o expiró" al validar | Cliente pegó el token temporal de 24h del panel de pruebas en vez de un token de System User |
| "El Phone Number ID no pertenece a este token" | El número está en otra app/WABA distinta a la que generó el token |
| "Ese Phone Number ID ya está registrado por otra empresa" (409) | Otro tenant registró ese número (phoneNumberId es único global) |
| "Este número ya está asignado a otro agente" (409) | Reasignación requiere confirmación (`reassign: true` desde el wizard) |
| Mensaje de prueba falla | Destinatario fuera de la ventana de 24h (debe escribir primero al negocio) |
| Meta bloquea/limita mensajes | Calidad baja del número, envío fuera de ventana de 24h sin plantilla, spam reportado |

## Diagnóstico
1. **Primero**: `GET /api/admin/tenants/:id/whatsapp` (SUPER_ADMIN) → estado, modo, proveedor, health y la solicitud de conexión asistida. Equivalente para el propio tenant: `GET /api/integrations/whatsapp/health`, que devuelve un **checklist** de qué falta en lenguaje de negocio.
2. `GET /api/support/context/tenant/:tenantId` → agentes activos, números configurados, uso del plan.
3. Estado de la integración: `GET /api/integrations/whatsapp` (como el tenant) o mirar `WhatsAppIntegration.status/lastValidationError` — el error de la última validación queda guardado textual.
4. `webhookVerifiedAt` null → Meta nunca verificó el webhook de ese tenant (paso 3 del wizard incompleto). No aplica en modo demo.
5. Logs `[WHATSAPP INTEGRATION]`, `[WHATSAPP ADMIN]`, `[WHATSAPP DEMO]` y `[WHATSAPP WEBHOOK]` — buscar "sin credenciales de envío" = integración no CONNECTED y fallback apagado; "sin agente asignado" = ruteo por fallback del tenant (funciona, pero hay que asignar el número).
6. Conversación en HUMAN_ACTIVE hace que el bot calle (por diseño).

## Pasos de solución
- **Conexión guiada pendiente** → `POST /api/admin/tenants/:id/whatsapp/mark-assisted-setup-started` al empezar; cuando el número esté listo en Meta, `POST /api/admin/tenants/:id/whatsapp/mark-connected` con `phoneNumberId` + `accessToken` (se cifra y se valida contra Meta antes de marcar CONNECTED; si falla, devuelve el motivo y NO marca conectado).
- Estado DRAFT/ERROR → pedir al cliente ejecutar "Validar conexión" (Paso 4); el mensaje de error resultante es autoexplicativo (token inválido / número ajeno / rate limit).
- Token de 24h caducado → generar token de System User (docs/WHATSAPP_SETUP.md §3) y pegarlo de nuevo en el Paso 2 (reemplaza el cifrado).
- Webhook sin verificar → recopiar Callback URL + Verify Token del wizard en Meta.
- Sin agente asignado → Paso 5 del wizard (activa el agente automáticamente).
- Límite del plan alcanzado → esperar ciclo o subir plan (billing.md).
- Ventana 24h vencida → usar plantilla aprobada (hoy: reanudar cuando el cliente escriba).
- Anti-bloqueo de Meta: `docs/WHATSAPP_SETUP.md` §9 (opt-in, plantillas aprobadas, quality rating, no spam).

## Automatizable por el agente (Tier 1)
- Chequear estado de la integración (status + lastValidationError + webhookVerifiedAt) y devolver el checklist de lo que falta.
- Chequear agente activo + número asignado + cuota del plan.
- Explicar la ventana de 24 horas, el modo humano y cómo generar un token permanente.

## Requiere humano
- Cambiar `ALLOW_GLOBAL_META_TOKEN_FALLBACK` o rotar `META_WHATSAPP_TOKEN`/`ENCRYPTION_KEY` (env).
- Aprobar plantillas en Meta, verificación del negocio, subir límites de Meta.
- Borrar/mover una `WhatsAppIntegration` de un tenant a otro (conflicto de phoneNumberId legítimo).

## Casos por tipo de número (wizard "Preparar número")

El cliente declara dónde vive su número y el sistema guarda `numberReadiness`.
Guion de respuesta por caso — detalle completo en `docs/WHATSAPP_NUMBER_READINESS.md`:

| Caso | `numberReadiness` | Qué responder | Acción |
|---|---|---|---|
| **Número personal** | `PERSONAL_WHATSAPP` | "Este número necesita una preparación antes de conectarse. Para usarlo con agentes IA debe pasar a WhatsApp Business Platform, y dejarías de tener ese WhatsApp en tu teléfono." | Recomendar número nuevo. Si insiste en conservarlo → migración asistida (TIER_2) |
| **App WhatsApp Business** | `WHATSAPP_BUSINESS_APP` | "Tu número es candidato, pero debe pasar por el flujo oficial de Meta. El historial de chats no se transfiere." | Migración asistida; ofrecer número nuevo como alternativa sin fricción |
| **BSP externo** (Twilio, 360dialog…) | `BSP_CONNECTED` | "Podemos evaluar traer tu número desde tu proveedor actual, normalmente sin cambiarlo." | Pedir proveedor + acceso admin. Coordinar migración (TIER_2) |
| **Número nuevo** | `NEW_NUMBER_RECOMMENDED` | "Es la opción más rápida y segura: no pierdes ningún WhatsApp que ya uses." | Verificar que la línea reciba SMS/llamada. Configurar y validar |
| **Sin acceso admin a Meta** | `NEEDS_ASSISTED_SETUP` | "Necesitamos que alguien con acceso de administrador del negocio nos acompañe unos minutos." | Bloquear avance hasta tener a esa persona; marcar `REQUIRES_CUSTOMER_ACTION` |
| **Negocio restringido por Meta** | `ERROR` / `NEEDS_ASSISTED_SETUP` | "Meta restringe algunos rubros (préstamos, cripto, apuestas, etc.). Vamos a revisar tu caso antes de continuar." | **No prometer conexión.** Escalar a TIER_2/producto; revisar Commerce Policy |
| **"Solo quiero poner mi número"** | cualquiera | "Entiendo. Con la API oficial de WhatsApp el número debe registrarse en la plataforma de empresas — es lo que hace que tus mensajes sean seguros y no te bloqueen. Nosotros hacemos esa parte por ti; toma pocos minutos de tu tiempo." | **Nunca** decir que basta con escribirlo. Ofrecer conexión guiada o número nuevo |

> **Regla de oro**: nunca decirle al cliente que su número está conectado si no
> pasó la validación contra la API oficial. `CONNECTED` solo lo fija
> `mark-connected` / `validate` tras responder Meta correctamente.

## Casos de Embedded Signup (conexión con Meta)

Detalle completo en `docs/WHATSAPP_EMBEDDED_SIGNUP.md`. El flujo está **deshabilitado
por defecto** hasta que Meta apruebe el advanced access de la app.

| Síntoma | Causa | Solución |
|---|---|---|
| “No pudimos cargar el conector de Meta” | El SDK (`connect.facebook.net`) no cargó: bloqueador de anuncios, extensión de privacidad, red corporativa o proxy | Pedir que desactive el bloqueador o pruebe en otra red/navegador. Alternativa: asistencia o configuración avanzada |
| “La conexión automática no está disponible” | Falta `META_EMBEDDED_SIGNUP_CONFIG_ID` / `META_APP_ID`, o `META_EMBEDDED_SIGNUP_ENABLED=false` | Es configuración de plataforma, **no del cliente**. Escalar a Tier 3; mientras, ofrecer asistencia |
| “Cancelaste la conexión con Meta” | El cliente cerró el popup o rechazó permisos | Reintentar. Si repite, revisar que tenga acceso de administrador al negocio en Meta |
| Meta no devuelve `phone_number_id` | Evento `FINISH_ONLY_WABA`: creó la WABA pero no seleccionó/registró número | Estado `REQUIRES_ACTION`. Pedirle repetir el flujo eligiendo un número, o asistirlo en el registro |
| WABA sin número | La cuenta existe pero no tiene número asociado | Igual que el anterior: hay que registrar y verificar el número en Meta |
| “No pudimos completar la conexión” tras aceptar todo | El `code` expiró (TTL **30 segundos**) o el intercambio falló | Reintentar de inmediato. Si persiste, revisar logs `[EMBEDDED SIGNUP]` y credenciales de la app |
| Suscripción de webhooks falla | Permisos insuficientes o WABA no elegible | La conexión **queda activa con aviso**. Usar “Reintentar webhooks” en el panel admin; si falla, Tier 2 |
| “No recibimos las credenciales necesarias” | Token insuficiente: el cliente no concedió todos los permisos, o la app no tiene advanced access | Repetir el flujo aceptando todos los permisos. Si es la app, Tier 3 (App Review) |
| Meta rechaza el onboarding | **App no aprobada**: sin advanced access de `whatsapp_business_management` + `whatsapp_business_messaging` | Bloqueador de plataforma. No prometer fecha al cliente; usar conexión asistida mientras tanto |
| “Selecciona el número que usará Sendwary” | La WABA del cliente tiene **varios números** y Meta no indicó cuál. No es un error | El cliente elige en la lista y pulsa “Usar este número”. Sendwary **no elige por él**: conectaría el número equivocado |
| “Ese número no pertenece a tu cuenta de WhatsApp Business” | El número elegido ya no está en la WABA (lo movieron o borraron entre la conexión y la selección) | Repetir la conexión con Meta para refrescar la lista |
| “Ese número ya está registrado por otra empresa” | El `phone_number_id` es único global: otro tenant ya lo tiene | Tier 2. Verificar quién es el dueño legítimo antes de liberarlo; nunca reasignar sin confirmar |
| El agente no responde tras asignar el número | Desde esta fase la activación es **opt-in**: asignar ya no activa el agente | Confirmar la casilla “¿Quieres activar este agente…?” al asignar, o activarlo desde Agentes |

## Cómo leer el health check

`GET /api/integrations/whatsapp/health` devuelve `recommendations[]` con el
siguiente paso en lenguaje de negocio. Mapa rápido para soporte:

| Recomendación | Qué significa |
|---|---|
| “Falta la cuenta de WhatsApp Business (WABA).” | El flujo no llegó a crear/vincular la WABA |
| “Falta seleccionar el número de WhatsApp.” | Hay varios números o ninguno elegido |
| “No se pudo validar el token.” | No hay credenciales utilizables guardadas |
| “El webhook no está confirmado.” | Reintentar suscripción desde el panel admin |
| “Asigna este número a un agente.” | Conexión lista, falta el agente |
| “Activa el agente.” | Todo listo salvo que el agente está inactivo |
| “Conexión lista.” | Sin acciones pendientes |

## Riesgos de Meta (comunicar al cliente)
- **Opt-in obligatorio**: escribir solo a quien contactó al negocio o dio consentimiento. Comprar listas = baneo.
- **Ventana de 24h**: fuera de ella hace falta plantilla aprobada (categoría UTILITY para recordatorios).
- **Número personal**: no usar uno ya vinculado a WhatsApp normal sin migrarlo correctamente.
- **Quality rating**: amarillo = bajar volumen; rojo = pausar envíos salientes (el health check lo muestra).
- **Tokens**: nunca se comparten; Sendwary los guarda cifrados y no los vuelve a mostrar.
- **Nunca** ofrecer ni aceptar automatización de WhatsApp Web no oficial: está descartada por política (ver `WHATSAPP_ONBOARDING_STRATEGY.md` §4.5).

## Logs / env / endpoints
- Logs: `[WHATSAPP INTEGRATION]`, `[EMBEDDED SIGNUP]`, `[WHATSAPP READINESS]`, `[WHATSAPP ADMIN]`, `[WHATSAPP DEMO]`, `[WHATSAPP WEBHOOK]`, `[WHATSAPP AUDIO]`, `[BILLING LIMIT]`.
- Env: `ALLOW_GLOBAL_META_TOKEN_FALLBACK`, `ENCRYPTION_KEY`, `WHATSAPP_EASY_ONBOARDING_ENABLED`, `WHATSAPP_DEMO_ENABLED`, `WHATSAPP_DEMO_PHONE_NUMBER_ID`, `WHATSAPP_DEMO_MESSAGE_LIMIT`, `WHATSAPP_EMBEDDED_SIGNUP_ENABLED`, `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `WHATSAPP_BSP_PROVIDER`, y legacy/demo: `META_WHATSAPP_TOKEN`, `META_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID`, `META_GRAPH_API_VERSION`.
- Endpoints tenant (OWNER/ADMIN; el token nunca se devuelve): `GET/POST /api/integrations/whatsapp`, `POST .../number-readiness` (wizard de preparación), `POST .../embedded-signup/complete` (cierre del flujo de Meta), `POST .../validate`, `POST .../assign-agent`, `POST .../test-message`, `POST .../request-assisted-setup`, `POST .../demo`, `GET .../health`.
- Endpoints admin (SUPER_ADMIN): `GET /api/admin/whatsapp/assisted-requests` (incluye a quien el wizard detectó que necesita ayuda, aunque no la haya pedido), `GET/PATCH /api/admin/tenants/:id/whatsapp`, `PATCH .../whatsapp/readiness` (etapa y diagnóstico del número), `POST .../whatsapp/retry-webhook` (reintentar suscripción a la WABA), `POST .../whatsapp/mark-assisted-setup-started`, `POST .../whatsapp/mark-connected`.
- Webhook: `GET/POST /api/whatsapp/webhook` (alias `/meta`), envío vía `meta-whatsapp.service.ts` + `resolveSendCredentials` + `services/whatsapp-providers/`.

## Escalamiento
Un tenant sin causa visible → Tier 2 (adjuntar contexto del tenant + estado de la integración + conversationId). Solicitud de conexión guiada > 48h sin atender → Tier 2 (equipo de implementación). Webhook caído para VARIOS tenants o Graph API 5xx sostenido → Tier 3 (incidente; revisar status de Meta y logs del webhook; NO tocar tokens sin humano). Petición de integrar un BSP nuevo → producto, no soporte.
