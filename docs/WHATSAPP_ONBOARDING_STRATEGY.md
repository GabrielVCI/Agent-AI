# Estrategia de conexión de WhatsApp en Sendwary

> Decisión técnica y comercial sobre cómo los clientes conectan su WhatsApp.
> Estado: **vigente**. Reemplaza como fuente de verdad al análisis exploratorio
> `docs/whatsapp-onboarding-analysis.md` (que se conserva como contexto histórico).

## 1. Problema

Hasta ahora el único camino real para que un cliente conectara WhatsApp era:
crear una app en **Meta Developers**, habilitar WhatsApp Business Platform,
generar un token de System User, copiar el Phone Number ID, configurar el
webhook con Callback URL y Verify Token, y validar.

Eso funciona para un equipo técnico. Para una ferretería, una clínica o un
salón de belleza —el cliente objetivo de Sendwary— es una barrera de entrada
que mata la conversión: el cliente paga, no logra conectar, y abandona.

**Conclusión**: el cliente estándar no debe tener que crear una app en Meta
Developers para usar Sendwary.

## 2. Decisión

El flujo **principal** es una **conexión guiada**: el cliente pulsa un botón,
responde cuatro datos de negocio y el resto ocurre sin que vea nada técnico.
La configuración manual pasa a ser un **modo avanzado** (sigue existiendo, sin
degradarse), y se agrega un **modo demo** para probar antes de comprometerse.

Ningún modo expone tokens, app secrets ni webhook secrets al frontend.

## 3. Opciones soportadas por el sistema

El modelo `WhatsAppIntegration.mode` (enum `WhatsAppConnectionMode`) distingue:

| Modo | Para quién | Qué ve el cliente | Estado |
|---|---|---|---|
| `EASY_ONBOARDING` | La mayoría de negocios | "Conectar WhatsApp" + checklist de requisitos | ✅ Operativo (vía asistida) |
| `MANUAL_CLOUD_API` | Quien ya tiene Cloud API | Wizard de 5 pasos con campos técnicos | ✅ Operativo |
| `DEMO_SANDBOX` | Quien quiere probar primero | Número demo de Sendwary con cuota | ✅ Operativo (si el entorno lo habilita) |

`EASY_ONBOARDING` es un **contrato de experiencia**, no de tecnología: hoy se
resuelve con intervención del equipo Sendwary, y mañana con Embedded Signup o
un BSP **sin cambiar el modelo, el webhook ni la UI del cliente**. Lo que
cambia es el campo `provider` y quién ejecuta los pasos.

## 4. Opciones evaluadas

### 4.1 Embedded Signup oficial de Meta — *objetivo de mediano/largo plazo*
El cliente conecta su WABA con un popup de Facebook (OAuth) y Sendwary recibe
el token sin que nadie copie nada. Es el flujo que usan respond.io, ManyChat y
similares.

- **Requiere**: app de Meta con `whatsapp_business_management` +
  `whatsapp_business_messaging` aprobados, App Review, verificación del negocio
  Sendwary y (para el flujo completo) estatus de **Tech Provider**.
- **Bloqueador actual**: no tenemos la aprobación. Por eso el código queda
  preparado (`WHATSAPP_EMBEDDED_SIGNUP_ENABLED`, `META_APP_ID`,
  `META_EMBEDDED_SIGNUP_CONFIG_ID`) pero **desactivado por defecto**.

### 4.2 BSP / partner (Twilio, 360dialog, Infobip, 8x8) — *puente pragmático*
Un BSP ya tiene el estatus de proveedor ante Meta y expone su propio onboarding
embebido. Sendwary se apoya en ellos y evita el App Review.

- **A favor**: time-to-market corto, soporte del partner, onboarding self-service.
- **En contra**: coste por conversación/mensaje sobre el de Meta, dependencia
  comercial, y cada uno tiene su propia API.
- **Mitigación**: la abstracción `WhatsAppProviderAdapter` — ningún BSP se
  filtra al resto del código. Cambiar de partner es implementar una clase.

### 4.3 Configuración manual con Meta Cloud API — *modo avanzado, se mantiene*
Sigue siendo el camino más barato (Meta cobra directo al cliente) y da control
total. Se conserva íntegro para clientes con equipo técnico.

### 4.4 Número demo controlado por Sendwary — *para probar*
Un número de la plataforma, con cuota (`WHATSAPP_DEMO_MESSAGE_LIMIT`) y avisos
explícitos de que no sirve para producción. Reduce la fricción de "quiero ver
cómo funciona antes de conseguir un número".

### 4.5 Automatización de WhatsApp Web no oficial — ❌ **DESCARTADA**
Librerías tipo `whatsapp-web.js`/Baileys que controlan WhatsApp Web con un
navegador headless o un socket no oficial.

**Se descarta para producción, sin excepciones:**

1. **Riesgo de bloqueo**: viola los Términos de Servicio de WhatsApp. Meta
   detecta y banea el número del cliente — y el daño lo sufre el negocio del
   cliente, no nosotros.
2. **Inseguridad**: exige la sesión completa del WhatsApp personal del cliente
   (equivalente a pedirle su contraseña). Un compromiso de nuestro servidor
   expone conversaciones privadas de sus clientes finales.
3. **Inestabilidad**: cualquier cambio de WhatsApp Web rompe la integración sin
   aviso ni SLA. No hay soporte ni versionado.
4. **No es viable para un SaaS serio**: sin plantillas oficiales, sin métricas
   de calidad, sin garantías de entrega, y sin posibilidad de firmar un
   contrato con un cliente empresarial que audite su cumplimiento.

Sendwary opera exclusivamente sobre **WhatsApp Business Platform oficial**.

## 5. Recomendación por horizonte

| Horizonte | Acción |
|---|---|
| **Corto plazo (hecho)** | Conexión guiada asistida por el equipo + modo manual avanzado + demo sandbox. Arquitectura de providers lista. |
| **Mediano plazo** | Contratar un BSP con onboarding embebido (evaluar 360dialog por coste y Twilio por robustez). Implementar su adaptador; el modo del cliente sigue siendo `EASY_ONBOARDING`. |
| **Largo plazo** | Embedded Signup propio con estatus de Tech Provider: mejor margen y control total del onboarding. |

La secuencia importa: cada paso **no invalida** al anterior. Un cliente
conectado hoy en modo asistido sigue funcionando cuando llegue el BSP.

## 6. Arquitectura implementada

```
Cliente → "Conectar WhatsApp"
            ├── Conexión guiada  → solicitud + ticket → equipo Sendwary configura → mark-connected (valida contra Meta)
            ├── Config avanzada  → wizard 5 pasos → validate() → asignar agente
            └── Modo demo        → número Sendwary con cuota
                                          │
                            WhatsAppIntegration (mode, provider, status, token cifrado)
                                          │
                            WhatsAppProviderAdapter  ← abstracción
                              ├── MetaCloudWhatsAppProvider   (implementado)
                              ├── SendwaryDemoWhatsAppProvider(implementado)
                              └── Twilio / 360dialog / Infobip / 8x8  (declarados, responden "no disponible")
                                          │
                     Webhook único /api/whatsapp/webhook → resuelve tenant por phone_number_id
```

**Resolución multi-tenant del webhook** (sin cambios de contrato con Meta):
1. Agente con ese `whatsappPhoneNumberId` asignado.
2. `WhatsAppIntegration` CONNECTED con ese número → primer agente activo del
   mismo tenant (evita perder mensajes cuando falta el paso de asignación).
3. Credenciales de envío: demo → token de la plataforma; tenant → su token
   descifrado; fallback global **solo** con `ALLOW_GLOBAL_META_TOKEN_FALLBACK=true`.

## 7. Seguridad y cumplimiento

- Access tokens cifrados con AES-256-GCM; al frontend solo `hasToken` +
  `tokenLastFour`. Ni el admin ve el token completo.
- `META_APP_SECRET` y los verify tokens nunca se exponen en ningún endpoint.
- `phoneNumberId` es único global: dos tenants no pueden compartir número.
- El token global de Sendwary **no** se usa para clientes en producción; solo
  demo o dev con el flag explícito.
- Reglas de Meta que la UI comunica al cliente: opt-in obligatorio, plantillas
  aprobadas fuera de la ventana de 24h, nada de spam, número no personal sin
  migrar, datos del negocio correctos y monitoreo de `quality_rating`.

## 8. Qué falta para cada evolución

**Embedded Signup real:**
1. App de Meta con `whatsapp_business_management` + `whatsapp_business_messaging` aprobados (App Review).
2. Verificación del negocio Sendwary en Meta Business.
3. Configuración de Embedded Signup (`config_id`) y URL de redirección.
4. Implementar el intercambio código→token en `MetaCloudWhatsAppProvider.refreshTokenIfSupported()` y el endpoint de callback.
5. Activar `WHATSAPP_EMBEDDED_SIGNUP_ENABLED=true`.

**BSP/partner:**
1. Contrato con el proveedor y credenciales de sandbox.
2. Implementar su adaptador (reemplazar la clase `Unimplemented*` correspondiente).
3. Mapear su formato de webhook al del sistema (adaptador de entrada).
4. Definir `WHATSAPP_BSP_PROVIDER` y validar costes por conversación.
