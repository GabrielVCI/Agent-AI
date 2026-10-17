# QA_RULES — Reglas permanentes de QA local

> **Vinculante.** Estas reglas no dependen de la fase del proyecto ni de quién
> ejecute las pruebas. Si una instrucción puntual contradice una regla de este
> documento, se detiene y se pregunta; no se improvisa.
>
> Última revisión: 2026-09-10.

---

## 1. La regla que manda sobre todas

**Una prueba solo puede marcarse `PROBADO CORRECTAMENTE` si fue ejecutada de
verdad y existe evidencia observable de ello.**

Evidencia observable = salida del comando, exit code, status HTTP, conteo de
filas, captura de pantalla. Leer el código **no es evidencia**.

### Estados permitidos

Son los únicos ocho. No se inventan variantes ni se combinan.

| Estado | Cuándo se usa |
|---|---|
| `PROBADO CORRECTAMENTE` | Se ejecutó y el resultado fue el esperado. Hay evidencia. |
| `FALLA DETECTADA` | Se ejecutó y el resultado **no** fue el esperado. Hay evidencia del fallo. |
| `PROBADO PARCIALMENTE` | Se ejecutó una parte. Se detalla exactamente qué quedó fuera. |
| `NO PROBADO` | No se ejecutó. Se explica por qué. |
| `PENDIENTE POR CREDENCIALES EXTERNAS` | Falta una clave o cuenta (Meta, ElevenLabs, LemonSqueezy, Google…). |
| `PENDIENTE POR AMBIENTE PÚBLICO` | Necesita HTTPS accesible desde internet (webhooks entrantes, Embedded Signup). |
| `NO VERIFICABLE EN LOCAL` | Ni con credenciales ni con túnel se puede reproducir en local. |
| `RIESGO DETECTADO` | No es un fallo reproducible, pero se observó algo que puede romperse. |

### Expresiones prohibidas

Nunca como equivalente de PASS:

> ~~"debería funcionar"~~ · ~~"parece correcto"~~ · ~~"seguramente funciona"~~ ·
> ~~"el código se ve bien"~~ · ~~"no debería haber problema"~~ · ~~"está implementado"~~

Si no se ejecutó, el estado es `NO PROBADO`. Sin matices.

### Inspección ≠ ejecución

Se distinguen siempre y se etiquetan:

- **[EJECUTADO]** — se corrió el comando; hay salida y exit code.
- **[LEÍDO]** — solo se leyó el código. **Nunca** sostiene un `PROBADO CORRECTAMENTE`.

Un `[LEÍDO]` puede sostener, como mucho, un `RIESGO DETECTADO`.

---

## 2. Antes de probar

**2.1 Auditar el diff.** Antes de ejecutar nada:

```bash
git status --porcelain
git diff --stat
```

⚠️ Este repositorio tiene **repos git anidados** (`backend/.git`, `frontend/.git`,
`webpage/.git`, `skills/.git`). El `git status` de la raíz **no** muestra los
cambios internos de esos paquetes. Para ver los del backend:

```bash
cd backend && git status --porcelain
```

Sin saber qué cambió, no se puede elegir qué probar: el diff es lo que decide la
fila de `LOCAL_QA_MATRIX.md` que aplica.

**2.2 Confirmar contra qué base se va a trabajar.** Las suites de integración y
HTTP escriben en la base de datos. Deben apuntar a `ferreteria_ai_agent_test`.
La guarda `backend/tests/setup/use-test-db.ts` aborta si el nombre no termina en
`_test`, pero eso no exime de comprobarlo.

**2.3 Partir de un árbol conocido.** Si hay cambios sin commitear, se anota en el
reporte. Un PASS sobre un árbol sucio solo vale para ese árbol.

---

## 3. Lo que nunca se hace

| Prohibido | Por qué |
|---|---|
| **Resetear la base de datos** (`prisma migrate reset`, `DROP DATABASE` sobre dev) | Borra datos reales. La base de pruebas se recrea con `npm run test:db:setup`, que nunca borra. |
| **Ejecutar migraciones destructivas** para "arreglar" un fallo | Un fallo se reporta, no se tapa. |
| **Mostrar secretos** en reportes, logs o mensajes | Se listan **nombres** de variables, jamás valores. Ver §5. |
| **Modificar producción** (o su configuración) para que una prueba pase | Convierte un fallo real en un falso verde. |
| **Cambiar una prueba para que deje de fallar**, sin entender el fallo | Primero se explica la causa; después se decide si el error estaba en la prueba o en el código. |
| **Marcar PASS por lectura de código** | Ver §1. |
| **Ejecutar las suites contra la base de desarrollo** | Crean y borran datos. |
| **Usar WhatsApp Web no oficial** para probar mensajería | Decisión cerrada del proyecto. |
| **Saltar una prueba en silencio** | Si no se puede ejecutar, se registra con su estado y su motivo. |

### Sobre `prisma migrate dev`

Desde el baseline del 2026-09-09 **ya no hay drift** y el comando es seguro en
desarrollo. Aun así: si alguna vez Prisma propone un **reset**, se cancela y se
investiga. Nunca se acepta un reset sobre una base con datos.

---

## 4. Qué se registra siempre

Todo reporte debe permitir que otra persona repita exactamente lo mismo.

**4.1 Comandos ejecutados**, literalmente, con el directorio desde el que se
lanzaron:

```
cd backend && npm run test:http
```

**4.2 Exit code** de cada comando. Es el dato que distingue "pasó" de "creo que
pasó":

```
cd backend && npm run typecheck   → exit 0
cd backend && npm run lint        → exit 1
```

**4.3 Endpoints y status codes**, cuando se prueba HTTP:

```
POST /api/auth/login          → 200  (Set-Cookie: sid, HttpOnly)
GET  /api/auth/me   sin cookie → 401  code=UNAUTHENTICATED
GET  /api/admin/tenants  OWNER → 403  code=FORBIDDEN
```

Se registra el **código de error** del contrato (`{message, error:{code}}`), no
el texto del mensaje: el texto cambia sin que cambie el comportamiento.

**4.4 Conteos de pruebas**: `tests / pass / fail` tal como los imprime el runner.

**4.5 Lo que NO se probó.** Un reporte que solo lista lo verde miente por
omisión. Toda área de `LOCAL_QA_MATRIX.md` que no se ejecutó aparece con su
estado (`NO PROBADO`, `PENDIENTE POR…`) y su motivo.

**4.6 Riesgos pendientes.** Todo `RIESGO DETECTADO` se anota aunque no haya
fallado nada, con el archivo y la línea donde se observó.

---

## 5. Secretos

- Nunca se imprime el **valor** de una variable de entorno. Se listan nombres:
  `RESEND_APIKEY`, `META_APP_SECRET`, `META_WHATSAPP_TOKEN`, `ENCRYPTION_KEY`,
  `SESSION_SECRET`, `OPENAI_API_KEY`, `LEMONSQUEEZY_*`, `ELEVENLABS_API_KEY`.
- Las URL de base de datos se enmascaran antes de pegarlas en cualquier sitio:

  ```bash
  sed -E 's#://[^@]+@#://***@#'
  ```

- `backend/.env` y `backend/.env.test` **no se versionan** y su contenido no se
  copia a un reporte. Las plantillas (`.env.example`, `.env.test.example`) sí
  pueden citarse: no llevan valores reales.
- Si una prueba imprime un secreto por accidente, eso es un
  **`FALLA DETECTADA`** de seguridad, no una molestia: se reporta.

---

## 6. Cuándo un fallo detiene todo

Se para y se avisa de inmediato, sin seguir ejecutando, si:

1. Una prueba escribió en la base de **desarrollo** (o hay sospecha de ello).
2. Un secreto apareció en una respuesta HTTP, un log o un reporte.
3. Un usuario de una empresa accedió a datos de otra.
4. Un `SUPER_ADMIN` quedó bloqueado por paywall, verificación o implementación.
5. El login o el registro dejaron de funcionar.

Estos cinco son los invariantes que el producto no puede romper. Todo lo demás
se anota y la ejecución continúa hasta el final.

---

## 7. Cuándo LOCAL puede pasar a DEV

Se cumple **todo** lo siguiente, con evidencia en `LAST_QA_REPORT.md`:

- [ ] `node scripts/qa-preflight.mjs` → **exit 0** (ningún `FAIL`; los `WARN` se
      anotan en el reporte). Cubre las cuatro casillas siguientes y añade
      entorno, secretos y configuración
- [ ] `cd backend && npm run typecheck` → **exit 0**
- [ ] `cd backend && npm test` → **exit 0** (unitarias + integración + HTTP)
- [ ] `cd frontend && npx tsc -b` → **exit 0**
- [ ] `cd frontend && npm run build` → **exit 0**
- [ ] `cd frontend && npm run lint` → **0 errores** (los warnings se permiten)
- [ ] Las áreas que marca `LOCAL_QA_MATRIX.md` para el cambio están ejecutadas.
- [ ] Ningún `FALLA DETECTADA` abierto sobre los cinco invariantes de §6.
- [ ] Todo lo no probado está listado con su estado y su motivo.
- [ ] `LAST_QA_REPORT.md` actualizado y con fecha.

**Excepción conocida y aceptada:** `cd backend && npm run lint` devuelve **exit 1**
por 8 errores de estilo preexistentes, ninguno de los cuales es un bug (se
revisaron uno por uno; ver `QA_LINT_AND_TYPECHECK.md` §6.2). No bloquea el paso a
DEV, pero **sí** bloquea que el lint del backend se use como puerta automática
mientras no se limpien. Si aparecen errores **nuevos**, sí bloquean.

---

## 8. Reglas para quien escribe pruebas nuevas

- Toda suite que toque la base **debe** cargar la guarda:
  `--import ./tests/setup/use-test-db.ts`. Sin eso no hay red de seguridad.
- Los datos de prueba llevan prefijo (`__http_test__`, `__customer_test__`…) y se
  borran en el `after()`. El borrado filtra **siempre** por el prefijo.
- Si falta la base de datos, la suite **falla**; nunca "pasa" saltándose.
- Un bypass o una excepción se prueba **por contraste**: el caso que sí debe
  bloquearse, el que no, y el excepcional. Sin el primero, un control que no
  aplica nada produce un falso verde.
- Se afirma sobre códigos de error, no sobre textos de mensajes.
- Probar un middleware contra una ruta real mezcla causas. Para aislarlo existe
  `middlewareApp()` en `tests/helpers/http.ts`.
