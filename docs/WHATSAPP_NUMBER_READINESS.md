# Preparación del número de WhatsApp

> Qué significa "conectar tu número" en Sendwary, por qué no basta con
> escribirlo, y qué hacemos con cada caso. Complementa
> `docs/WHATSAPP_ONBOARDING_STRATEGY.md` (que explica los **modos** de conexión);
> este documento explica los **estados del número**.

## 1. Por qué no basta con escribir el número

Sendwary funciona sobre **WhatsApp Business Platform**, la plataforma oficial
de Meta para empresas. No usamos ni usaremos automatización de WhatsApp Web.

Eso implica una regla que no podemos saltarnos: **un número de teléfono solo
puede vivir en un sitio a la vez.** O está en la app de WhatsApp (personal o
Business) en un teléfono, o está registrado en la plataforma para empresas. No
en ambos.

Por eso "escribe tu número y listo" es una promesa falsa: si ese número está
en uso en un teléfono, primero hay que **liberarlo o migrarlo**, y eso tiene
consecuencias que el cliente debe conocer antes (pierde el WhatsApp de ese
teléfono, no se transfiere el historial de chats).

Prometerlo genera clientes frustrados y tickets evitables. Sendwary prefiere
decirlo claro al principio.

## 2. Las tres cosas que la gente llama "WhatsApp"

| | Qué es | ¿Sirve para Sendwary? |
|---|---|---|
| **WhatsApp** (personal) | La app de siempre, en tu teléfono | ❌ No directamente. Hay que migrar el número (y perderías ese WhatsApp) o usar otro |
| **WhatsApp Business App** | La app verde para negocios: catálogo, respuestas rápidas | ⚠️ Candidato. Requiere el paso oficial de migración; el historial no se transfiere |
| **WhatsApp Business Platform** (Cloud API) | La plataforma oficial para empresas; sin app, se opera desde sistemas como Sendwary | ✅ Es lo que Sendwary necesita |

Un cuarto caso: el número ya está en la plataforma **a través de otro
proveedor** (Twilio, 360dialog, Infobip…). Ahí se evalúa una migración entre
proveedores, que normalmente **no requiere cambiar de número**.

## 3. Cuándo conviene un número nuevo dedicado

**Casi siempre, para clientes no técnicos.** Es la recomendación por defecto:

- No pierdes acceso a ningún WhatsApp que ya uses.
- La activación es más rápida: no hay que liberar ni migrar nada.
- Tu número personal sigue siendo personal.
- Sirve cualquier línea que pueda recibir un SMS o una llamada de verificación
  (incluidas líneas fijas).

Conviene el número existente cuando **el número ya es público y conocido por
los clientes** (está en el rótulo, en la web, en publicidad) y perderlo tendría
coste comercial. En ese caso se hace migración asistida.

## 4. Cuándo se requiere migración

- El número está en la app de WhatsApp o WhatsApp Business y el cliente
  **quiere conservarlo** para atender por Sendwary.
- El número está con otro proveedor y el cliente quiere traerlo.

En ambos casos la migración la coordina el equipo Sendwary. Requisitos del
cliente: acceso de administrador donde esté el número hoy y disponibilidad para
recibir el código de verificación.

## 5. Estados del número (`WhatsAppNumberReadiness`)

| Estado | Significa |
|---|---|
| `UNKNOWN` | Aún no se evaluó |
| `PERSONAL_WHATSAPP` | Está en WhatsApp normal: no se conecta escribiéndolo |
| `WHATSAPP_BUSINESS_APP` | En la app Business: candidato, requiere flujo oficial |
| `CLOUD_API_READY` | Ya tiene Cloud API: puede ir a configuración avanzada |
| `BSP_CONNECTED` | Está con un proveedor externo: evaluar migración |
| `NEW_NUMBER_RECOMMENDED` | Lo más rápido y seguro: número dedicado |
| `NEEDS_MIGRATION` | Hay que migrarlo desde donde está |
| `NEEDS_ASSISTED_SETUP` | El equipo Sendwary debe intervenir |
| `CONNECTED` | Conectado y **validado contra la API oficial** |
| `ERROR` | Falló la validación |

Etapa operativa paralela (`WhatsAppReadinessStage`, la mueve el equipo):
`PENDING` → `IN_REVIEW` → `READY_TO_CONNECT` → `CONNECTED`, más
`REQUIRES_CUSTOMER_ACTION` cuando esperamos algo del cliente.

> **`CONNECTED` solo se marca tras validar contra la API oficial.** Nunca se le
> dice al cliente que su número está conectado si no lo está.

## 6. Qué hace Sendwary

1. Pregunta dónde vive hoy el número (wizard "Preparar número", 1 pregunta).
2. Da una recomendación honesta, sin jerga, con las consecuencias explicadas.
3. Registra el estado del número para que soporte vea lo mismo que el cliente.
4. Si hace falta, crea un ticket `WHATSAPP_SETUP` con todo el contexto (número
   **enmascarado**, nunca credenciales).
5. Configura el número con el cliente y **valida** antes de darlo por conectado.

## 7. Qué debe hacer el cliente

- Decir con sinceridad dónde usa hoy su número.
- Tener acceso de administrador al negocio en Meta (o decirnos que no lo tiene).
- Estar disponible para recibir el código de verificación.
- Decidir si prefiere número nuevo o migrar el actual.

## 8. Qué NO debe hacer nunca

- ❌ **Compartir contraseñas** de WhatsApp, Facebook o Meta Business. Sendwary
  jamás las pide. Si alguien las pide en nombre de Sendwary, es fraude.
- ❌ **Enviar tokens o credenciales por WhatsApp**, chat o correo. Se ingresan
  únicamente en el panel, donde se guardan cifrados.
- ❌ **Enviar capturas de pantalla con datos privados** (tokens, claves,
  códigos de verificación).
- ❌ **Usar herramientas no oficiales** que prometen conectar WhatsApp Web con
  un bot: violan los términos de WhatsApp y **el número baneado es el del
  cliente**, no el del proveedor.

## 9. Riesgos de usar el número personal

- Pierdes ese WhatsApp en tu teléfono: deja de funcionar la app con ese número.
- El historial de conversaciones **no se transfiere**.
- Tu número personal queda expuesto como canal comercial (y no se puede
  "deshacer" fácilmente: revertir implica otra migración).
- Si el número está asociado a tu identidad personal, mezclas ámbitos: cualquier
  persona del equipo con acceso al panel ve esas conversaciones.

Por eso la recomendación por defecto es un número dedicado.

## 10. Referencias

- Modos de conexión y roadmap a Embedded Signup/BSP: `WHATSAPP_ONBOARDING_STRATEGY.md`
- Configuración manual paso a paso: `WHATSAPP_SETUP.md`
- Guion de soporte: `support-playbooks/whatsapp.md`
