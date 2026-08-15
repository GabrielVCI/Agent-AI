# Análisis: registro y configuración de WhatsApp por empresa (y cómo evitar bloqueos de Meta)

## 1. Estado actual del código

Hoy Sendwary opera en **modelo centralizado (tipo BSP)**:

- El backend usa **un solo token global** (`META_WHATSAPP_TOKEN` en env) para
  enviar TODOS los mensajes vía Graph API (`meta-whatsapp.service.ts`).
- Cada agente del tenant guarda su `whatsappPhoneNumberId` +
  `whatsappDisplayPhone`; el webhook único (`POST /api/whatsapp/meta`) rutea el
  mensaje entrante al agente por ese phone_number_id.
- Existe el modelo `Integration` (type WHATSAPP, `encryptedConfig` AES-256-GCM)
  con endpoints en Settings, **pero el envío NO lo consume todavía**: está listo
  para guardar credenciales por tenant de forma cifrada.

Implicación: los números de los clientes deben vivir **dentro de la WABA
(WhatsApp Business Account) de Sendwary**, o hay que evolucionar al modelo
multi-tenant (sección 3).

## 2. Cómo debe registrar WhatsApp una empresa hoy (flujo operativo)

1. **Requisitos del cliente**: número de teléfono que NO esté registrado en la
   app de WhatsApp normal (o liberarlo), y datos del negocio verificables.
2. **Sendwary (admin)** en Meta Business Manager:
   - Agregar el número a la WABA de Sendwary (Add phone number).
   - Verificarlo por SMS/llamada y completar display name (debe coincidir con
     la marca del cliente; Meta lo revisa).
   - Copiar el **phone_number_id** del número.
3. **En el panel Sendwary**: asignar ese phone_number_id al agente del tenant
   (Agentes → número de WhatsApp). Desde ese momento el webhook rutea y el
   agente responde.
4. **Verificación del negocio (Business Verification)** del cliente en Meta si
   quiere pasar del tier inicial (250 conversaciones únicas/día) a 1K/10K/100K.

## 3. Evolución recomendada: credenciales por tenant (fase futura)

Para que cada empresa use SU PROPIA WABA (y su propia api key):

- **UI**: en Settings → Integraciones → WhatsApp, formulario con:
  `wabaId`, `phoneNumberId`, `accessToken` (system user token permanente),
  `verifyToken` propio opcional. Se guarda en `Integration.encryptedConfig`
  (ya cifrado hoy; NUNCA se devuelve al frontend — solo `hasConfig: true`).
- **Backend**: `meta-whatsapp.service.ts` resuelve el token así:
  `Integration WHATSAPP del tenant (desencriptado) || META_WHATSAPP_TOKEN global`.
  El webhook sigue siendo único; el ruteo por phone_number_id no cambia.
- **Onboarding ideal**: *Embedded Signup* de Meta (el cliente conecta su WABA
  con OAuth de Facebook sin copiar tokens a mano). Requiere app de Meta
  aprobada con permisos `whatsapp_business_management` +
  `whatsapp_business_messaging` — es el mismo flujo que usa respond.io.
- **Validación al guardar**: llamada de prueba a Graph
  (`GET /{phone_number_id}?fields=display_phone_number,quality_rating`) para
  confirmar token/número antes de activar, y guardar `quality_rating` para
  monitoreo.

## 4. Cómo evitar que Meta bloquee/limite los mensajes

Meta califica cada número (quality rating verde/amarillo/rojo) y castiga con
límites o baneo. Reglas que Sendwary ya cumple y las que hay que operar:

**Ya cubiertas por el producto:**
- *Ventana de 24 horas*: el bot solo responde a mensajes entrantes (sesión
  abierta). No inicia conversaciones frías.
- *Respuesta rápida*: la IA contesta en segundos (la capacidad de respuesta
  mejora la calidad del número).
- *Control anti-spam propio*: el runtime corta spam/insultos/número equivocado
  y no insiste a quien no quiere hablar (menos reportes "bloquear/reportar").
- *Opt-out implícito*: si el cliente dice número equivocado, se cierra y no se
  le vuelve a escribir.

**Reglas operativas a respetar (documentar al cliente):**
1. **Opt-in**: solo escribir a personas que iniciaron contacto o dieron su
   consentimiento; nunca comprar listas.
2. **Plantillas aprobadas** para todo mensaje fuera de la ventana de 24h
   (recordatorios de citas incluidos cuando pasan 24h) — categoría UTILITY,
   texto claro, sin cebo.
3. **Warm-up de número nuevo**: no pasar de 0 a cientos de conversaciones el
   primer día; subir volumen gradualmente (los tiers de Meta suben solos con
   calidad alta: 250 → 1K → 10K → 100K únicos/día).
4. **Display name y perfil completos** (foto, descripción, web) — reduce
   reportes de usuarios.
5. **Contenido**: no préstamos/cripto/apuestas u otras categorías restringidas
   por la Commerce Policy; no acortadores de URL sospechosos.
6. **Monitorear quality_rating** (Graph lo expone): amarillo = bajar volumen y
   revisar contenido; rojo = pausar campañas salientes de inmediato.
7. **Business Verification** temprana: sube límites y credibilidad.

**Mejores prácticas para recordatorios de citas (feature existente):**
- Enviar dentro de la ventana de 24h cuando sea posible; si no, plantilla
  UTILITY aprobada tipo "Recordatorio de tu cita {{fecha}} — responde 1 para
  confirmar".
- Incluir siempre cómo cancelar ("responde CANCELAR"), lo que reduce reportes.

## 5. Roadmap sugerido

| Fase | Entregable |
|---|---|
| Ahora | Playbook whatsapp.md + este análisis; asignación de phone_number_id por agente (existe) |
| Corto plazo | Resolver token por tenant desde `Integration.encryptedConfig` con fallback al global; UI de captura de credenciales con validación en vivo |
| Mediano | Monitor de quality_rating por número en el dashboard + alerta al bajar |
| Largo | Embedded Signup de Meta (conexión self-service sin copiar tokens) |
