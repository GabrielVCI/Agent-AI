# Playbook: LemonSqueezy (checkout overlay y webhooks de pago)

- **Feature**: Checkout de suscripciones (Overlay) y webhook de eventos de pago. Opcional: sin credenciales el sistema opera en modo manual.
- **Tier por defecto**: TIER_2 · **Riesgo**: ALTO (dinero — nada automático)

## Descripción

El flujo completo:

```
OWNER elige plan → frontend manda SOLO planId
  → backend resuelve Plan → lemonSqueezyVariantId
  → POST /v1/checkouts (embed=true, custom_data con tenant/user/plan)
  → backend devuelve checkoutUrl
  → lemon.js abre el OVERLAY sobre Sendwary
  → el cliente paga → Checkout.Success (solo UX: "confirmando…")
  → el overlay SIGUE abierto: LemonSqueezy enseña su confirmación y su botón Continuar
  → LemonSqueezy manda subscription_created
      → firma verificada → dedupe → CORRELACIÓN tenant+plan guardada
      → NO se activa nada todavía
  → LemonSqueezy manda subscription_payment_success (la FACTURA)
      → billing_reason=initial + status=paid
      → GET /v1/subscriptions/:id para verificar la suscripción real
      → Subscription local creada ACTIVE / PAID / LEMONSQUEEZY
      → el paywall desaparece
```

**Regla de oro nº 1**: `Checkout.Success` NO activa nada. La única autoridad que
activa una suscripción es el **webhook**. Si un cliente dice "pagué y no se
activó", el problema está en el webhook, nunca en el navegador.

**Regla de oro nº 2**: `subscription_created` TAMPOCO activa nada. Que
LemonSqueezy haya creado la suscripción no significa que el dinero haya entrado:
ese evento solo deja la correlación "suscripción de LS ↔ tenant ↔ plan". Lo que
concede acceso es `subscription_payment_success` con `billing_reason=initial` y
`status=paid`.

**El orden de llegada da igual**: si el pago llega antes que
`subscription_created`, la factura queda guardada en la correlación
(`PENDING_CORRELATION`) y la activación se completa sola cuando llega el evento
que dice de quién es. Nunca se adivina el tenant por email.

**Qué ve el cliente mientras tanto**: al terminar el pago, el panel no dice
"listo" — dice *"Estamos confirmando tu pago"* y **bloquea todos los botones de
compra**. Si vuelve al panel antes de que el webhook termine (botón *Continuar*
de LemonSqueezy), el guard le enseña *"Estamos activando tu suscripción"* en vez
de mandarlo otra vez a pagar. Esa decisión la toma el backend con
`accessState`, no el navegador:

| `accessState` | Significa | Pantalla |
|---|---|---|
| `ALLOWED` | Suscripción activa (o el paywall no aplica) | Panel |
| `PENDING_CONFIRMATION` | Hay una correlación de LemonSqueezy sin cerrar y con menos de 30 minutos | "Estamos confirmando/activando" |
| `PAYWALL_REQUIRED` | Ni plan activo ni pago en vuelo | Planes |

Pasados **30 minutos** sin confirmarse, la correlación deja de tapar el paywall:
si un cliente reclama que pagó y ve los planes, revisa la correlación ANTES de
pedirle que pague otra vez.

Sin `LEMONSQUEEZY_API_KEY` / `LEMONSQUEEZY_STORE_ID`, el checkout responde
`LEMON_CONFIGURATION_ERROR` (503) con mensaje amigable y los planes se
administran manualmente por SUPER_ADMIN.

## A dónde vuelve el cliente después de pagar

El botón **Continuar** de LemonSqueezy usa el `redirect_url` que el backend
manda al crear el checkout:

```
redirect_url = LEMONSQUEEZY_SUCCESS_URL   (si está configurada)
             | FRONTEND_URL + /dashboard  (por defecto)
```

Se construye SIEMPRE en el backend (`utils/frontend-url.ts`): el navegador no
puede elegir el destino, porque eso sería un open redirect con la marca de
Sendwary. Si el cliente aterriza en el dominio equivocado tras pagar, el
sospechoso es `FRONTEND_URL` del backend, no el frontend.

## Códigos de error (el cliente ve el mensaje, soporte usa el código)

| Código | Significado | Qué hacer |
|---|---|---|
| `LEMON_CONFIGURATION_ERROR` | Falta API key/store, o LS devolvió 404 sobre nuestra variante/tienda | Revisar envs y que la variante exista en LS (¿test vs live?) |
| `PLAN_NOT_CONFIGURED` | El Plan no tiene `lemonSqueezyVariantId` | Cargar la variante en el Plan (`npm run seed:plans` con la env puesta) |
| `LEMON_AUTH_ERROR` | LS rechazó nuestra API key (401/403) | Rotar/corregir la key. Nunca se loguea ni se muestra |
| `LEMON_VALIDATION_ERROR` | LS rechazó el payload (422) | Ver `internalMessage` del log: suele ser una variante inválida |
| `LEMON_RATE_LIMITED` | 429 de LS | Reintentar más tarde; no es culpa del cliente |
| `LEMON_API_ERROR` | 5xx, timeout o red | Temporal. Reintentar |
| `INVALID_WEBHOOK_SIGNATURE` | Firma ausente o incorrecta | El secret no coincide con el del panel de LS |

## Errores comunes y síntomas

| Síntoma | Causa probable |
|---|---|
| "El checkout no abre" | Provider sin configurar (503), o el plan no tiene variante |
| El pago abre en pestaña completa en vez de overlay | lemon.js no cargó (bloqueador/red). Es el fallback previsto, el pago funciona igual |
| "Pagué pero mi plan no cambió" | No llegó `subscription_payment_success`, la firma falló, o la variante no mapea a ningún Plan. Mirar primero la correlación |
| Existe la correlación pero no hay Subscription | Todavía no llegó el pago (`PENDING_PAYMENT`) o la factura no era `initial`+`paid` |
| "Pagué y me sigue pidiendo pagar" | Mira `accessState`: si es `PAYWALL_REQUIRED` con una correlación de más de 30 min, el webhook nunca confirmó. NO le pidas pagar otra vez |
| Tras pagar aterriza en el dominio equivocado | `FRONTEND_URL` (o `LEMONSQUEEZY_SUCCESS_URL`) del backend apunta a otro ambiente |
| El checkout se cierra solo al pagar y no ve la confirmación | Alguien volvió a cerrar el overlay desde `Checkout.Success`; hay una prueba estática que lo impide |
| Webhook respondido con 503 | No se pudo verificar la suscripción contra la API de LS. LemonSqueezy reintenta solo; el pago ya quedó sellado en la correlación |
| Webhook 401 en logs | `LEMONSQUEEZY_WEBHOOK_SECRET` distinto del configurado en LS |
| Webhook con `outcome: FAILED` | La variante cobrada contradice el plan de `custom_data`: NO se activa en silencio, requiere revisión |
| Webhook con `outcome: IGNORED` | Evento sin tenant correlacionable, o evento que no toca el entitlement (ej. `order_created`) |

## Diagnóstico de un alta que "no se activó"

1. `GET /api/support/health` → `lemonSqueezy.configured`.
2. Tabla **`LemonSqueezySubscriptionCorrelation`** — es el primer sitio a mirar
   en un alta. Una fila por suscripción de LemonSqueezy:

   | `status` | Qué significa | Qué hacer |
   |---|---|---|
   | `PENDING_PAYMENT` | Correlacionada, pero LS no ha confirmado el primer cobro | Esperar/ver el pago en el panel de LS. Es normal durante unos segundos |
   | `PENDING_CORRELATION` | Llegó el pago ANTES que `subscription_created` | Se resuelve solo al llegar ese evento. Si no llega, reenviarlo desde LS |
   | `PAID` | Pago confirmado, pero la Subscription aún no pudo escribirse | Suele ser la API de LS caída: el webhook se responde 503 y LS reintenta |
   | `PROCESSED` | Alta completada: la Subscription existe | Nada |
   | `INVALID` | Inconsistencia (variante/producto/tenant). **Nunca activa** | Tier 2: leer `lastError` |

3. Tabla **`LemonSqueezyWebhookEvent`**: el registro de todo lo recibido.
   - `status = PROCESSED` → se aplicó. Mirar `tenantId`/`subscriptionId`.
   - `status = FAILED` → leer `lastError`.
   - `status = IGNORED` → leer `lastError` (explica por qué; p. ej.
     `billing_reason=renewal`, factura `pending`, evento sin correlación).
   - `attemptCount > 1` → LemonSqueezy reintentó; la idempotencia lo absorbió.
4. Tabla **`UnmatchedBillingWebhook`**: eventos que no se pudieron asociar a
   ningún tenant. Nunca se activa un tenant adivinando.
5. `Subscription.lemonSqueezyStatus` guarda el estado CRUDO del proveedor junto
   al `status` mapeado de Sendwary: si difieren de lo esperado, el mapeo es el
   primer sitio a mirar (`lemonSqueezy.status-map.ts`).
6. `Subscription.lemonSqueezyTestMode` dice si la suscripción vino de test mode.

**Ojo con la carrera pago↔redirección**: el cliente puede volver a Sendwary
(botón *Continuar* de LemonSqueezy) antes de que el webhook termine. Durante
esos segundos el paywall sigue puesto y es CORRECTO: el panel consulta
`/api/billing/status` y entra en cuanto el backend confirma. No existe ninguna
pantalla que dé el pago por bueno desde el navegador.

## Qué NO activa una suscripción

- `order_created` (una orden no es una suscripción cobrada).
- `subscription_created` (correlaciona, no cobra).
- Una factura con `status` `pending`, `void`, `refunded` o `partial_refund`.
- Una factura con `billing_reason` `renewal` o `updated` (se reconocen y se
  registran; la lógica de renovación y de cambio de plan llega en otra fase).
- `Checkout.Success` del navegador.

## Mapeo de estados (referencia)

| Estado LemonSqueezy | `Subscription.status` | `paymentStatus` | ¿Acceso? |
|---|---|---|---|
| `on_trial` | TRIALING | NOT_REQUIRED | Sí, hasta `currentPeriodEnd` |
| `active` | ACTIVE | PAID | Sí |
| `past_due` | PAST_DUE | OVERDUE | Sí, 3 días de gracia |
| `unpaid` | PAST_DUE | OVERDUE | Sí, 3 días de gracia |
| `paused` | PAST_DUE | (sin cambio) | Sí, 3 días de gracia |
| `cancelled` | CANCELLED | PAID | **Sí hasta `endsAt`** |
| `expired` | EXPIRED | NOT_REQUIRED | No — vuelve el paywall |

**Cancelar no corta el servicio de inmediato**: el cliente pagó ese período y
conserva el acceso hasta `endsAt`. Si alguien reclama que "canceló y todavía
puede entrar", eso es lo correcto, no un bug.

## Pasos de solución

- **Config faltante** → completar envs; cargar variantes en los Planes.
- **Pago sin reflejar** → mirar `LemonSqueezySubscriptionCorrelation` y después
  `LemonSqueezyWebhookEvent`, y contrastar con el dashboard de LemonSqueezy. Si LS
  lo envió pero aquí no está, es un problema de entrega (URL del webhook / red).
  Reenviar el evento desde el panel de LS es seguro: la idempotencia impide
  efectos dobles (la misma factura no se aplica dos veces).
- **Correlación `PENDING_CORRELATION`** → reenviar `subscription_created` desde
  el panel de LemonSqueezy: al llegar, la activación pendiente se completa sola.
- **Mientras se corrige** → SUPER_ADMIN asigna el plan manualmente. El
  `billingMode` pasará a LEMONSQUEEZY en cuanto llegue un webhook válido.

## Automatizable por el agente (Tier 1)

- Detectar provider no configurado y explicar el modo manual.
- Explicar que tras pagar la activación tarda unos segundos (la confirma el webhook
  del primer cobro, no el checkout ni la redirección).
- Explicar que cancelar mantiene el acceso hasta el fin del período pagado.

## Requiere humano (SIEMPRE)

- Asignar/cambiar planes, reenviar webhooks, reembolsos, tocar credenciales.
- Cualquier evento en `FAILED` por variante inconsistente.
- Cualquier correlación en `INVALID`: significa que lo cobrado no corresponde al
  plan declarado. No activar a mano sin entender por qué.

## Logs / env / endpoints

- Logs: `billing.checkout.create.*`, `billing.webhook.received|verified|processed|duplicate|failed|retry`,
  `billing.lemon.subscription.created.received`, `billing.lemon.subscription.correlated`,
  `billing.lemon.payment.success.received`, `billing.lemon.payment.initial.confirmed`,
  `billing.lemon.payment.non_initial|not_paid|already_applied`,
  `billing.lemon.correlation_missing`, `billing.lemon.variant_mismatch`,
  `billing.lemon.activation_rejected`, `billing.lemon.test_mode_mismatch`,
  `billing.checkout.redirect_configured`, `billing.confirmation.pending`,
  `billing.subscription.created|activated|synced|status_changed`, `billing.payment.failed|recovered`.
  **Nunca** se loguean la API key, el webhook secret, el header Authorization ni el payload crudo.
- Env: `FRONTEND_URL` (destino del botón Continuar), `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`,
  `LEMONSQUEEZY_API_URL`, `LEMONSQUEEZY_TEST_MODE`, `LEMONSQUEEZY_*_VARIANT_ID`,
  `LEMONSQUEEZY_SUCCESS_URL`, `LEMONSQUEEZY_CANCEL_URL`.
- Endpoints:
  - `POST /api/billing/create-checkout` y `POST /api/billing/lemon-squeezy/checkout` (sesión, OWNER/ADMIN)
  - `POST /api/webhooks/lemon-squeezy` (canónico, firma) y `POST /api/billing/lemonsqueezy/webhook` (histórico, mismo controlador)
  - `GET /api/billing/status`, `GET /api/billing/subscription`

## Escalamiento

Cualquier discrepancia de dinero → Tier 2 mínimo, con IDs de transacción.
Cobros incorrectos a varios tenants → Tier 3 inmediato.
