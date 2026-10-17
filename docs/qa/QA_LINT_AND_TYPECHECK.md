# Sendwary — Lint y typecheck

> **Creado:** 2026-09-09 · Paso 3 del plan de QA (`QA_INITIAL_AUDIT.md` §13).
> Elimina los **falsos verdes** y los comandos rotos: hallazgo **H4** y riesgos
> **R9** (pruebas fuera del compilador) y **R10** (señales falsas).

---

## 1. Comandos

| Paquete | Comando | Qué hace |
|---|---|---|
| backend | `npm run lint` | ESLint sobre `src/`, `tests/`, `scripts/`, `prisma/` |
| backend | `npm run lint:fix` | Lo anterior, aplicando los arreglos automáticos |
| backend | `npm run typecheck` | **`src/` + `tests/` + `scripts/`** |
| backend | `npm run typecheck:src` | Solo la API (lo que se compila a `dist/`) |
| backend | `npm run typecheck:test` | Solo pruebas, scripts, seed y `prisma.config.ts` |
| frontend | `npm run lint` | ESLint del panel |
| frontend | `npx tsc -b` | Typecheck (⚠️ `--noEmit` **no** sirve aquí: hay project references) |
| webpage | `npm run lint` | ESLint de la landing |

---

## 2. Qué estaba roto y cómo quedó

| Antes | Ahora |
|---|---|
| `backend: lint` era `echo "Lint pendiente de configurar"` → **pasaba siempre sin analizar nada** | ESLint 9 real sobre todo el paquete |
| `frontend: lint` fallaba: *"couldn't find an eslint.config file"* | `eslint.config.js` (las dependencias ya estaban instaladas desde el inicio) |
| `webpage: lint` fallaba igual, y **ESLint ni siquiera estaba instalado** — script fantasma | Dependencias instaladas + `eslint.config.js` |
| `tests/` y `scripts/` no pasaban por el compilador | `tsconfig.test.json`, enganchado a `npm run typecheck` |

---

## 3. Criterio de severidad

**`error`** solo para lo que puede romper algo en ejecución o filtrar
información. **`warn`** para deuda técnica (`any`, variables sin usar,
*fast refresh*). Así el lint puede usarse como puerta en CI sin que la deuda
acumulada lo bloquee, y un `error` significa siempre "esto hay que mirarlo".

Excepciones deliberadas configuradas:

- `no-empty` con `allowEmptyCatch: true` — `catch {}` es intencional cuando el
  fallo no cambia el resultado (el logout limpia el estado local aunque la API
  falle).
- `@typescript-eslint/no-explicit-any` apagado en `tests/` y `scripts/`: ahí
  `any` se usa a propósito para construir datos de prueba.

---

## 4. Invariantes del proyecto convertidos en reglas

Dos reglas `no-restricted-syntax` traducen decisiones de `LOCKED_DECISIONS.md`
en verificación automática. Es la primera vez que un invariante de seguridad
tiene una comprobación que corre sola:

**Frontend — credenciales fuera del navegador.** Bloquea
`localStorage`/`sessionStorage` cuando la clave contiene `token`, `jwt`, `auth`,
`session`, `password`, `secret` o `credential`. La sesión vive en la cookie
httpOnly `sid`; el navegador no debe poder leer ni guardar credenciales.
Sigue permitido para preferencias de interfaz (el colapso del sidebar).

**Backend — secretos fuera de las respuestas.** Bloquea que el valor de una
variable de entorno sensible (`*APIKEY`, `*API_KEY`, `*SECRET`, `*TOKEN`,
`*PASSWORD`) llegue a un `res.json()` o `res.send()`. Para exponer si algo está
configurado, devolver un booleano, nunca el valor.

> Ninguna de las dos detecta todos los casos posibles — el análisis estático no
> llega a todo. Son una red, no una garantía; las pruebas HTTP del paso 5 son
> las que deben cubrirlo de verdad.

---

## 5. Estado al cerrar el paso 3 **[VERIFICADO ejecutando]**

| Comando | Resultado |
|---|---|
| `backend: typecheck` (src + tests) | **exit 0** ✅ — las pruebas no tenían errores de tipos ocultos |
| `backend: lint` | 29 problemas — **8 errores**, 21 warnings |
| `frontend: lint` | **0 errores**, 43 warnings (el único error era el bug de §6.1, ya corregido) |
| `frontend: npm run build` | ✅ built (el comando que corre Netlify) |
| `webpage: lint` | 7 problemas — **0 errores** |
| `backend: test:unit` | 56/56 ✅ |

---

## 6. Los errores que quedan abiertos

### 6.1 ✅ Bug real — `OnboardingPage.tsx` — **CORREGIDO 2026-09-09**

```
error  React Hook "useState" is called conditionally.
```

El componente hace un `return <Navigate />` condicional **antes** de declarar el
`useState` del formulario:

```tsx
const [step, setStep] = useState(0)
const [loading, setLoading] = useState(false)
const [error, setError] = useState('')

if (user && user.emailVerified === false) {
  return <Navigate to="/verificar-correo" replace />   // ← corta aquí
}

const [form, setForm] = useState<FormData>({ ... })    // ← este ya no se llama
```

El número de hooks cambia entre renders. Mientras el usuario no verificado se
redirija y el componente se desmonte, no se nota; pero si `emailVerified` pasa
de `false` a `true` **sin desmontar** (por ejemplo un `refreshUser()` tras
verificar en otra pestaña), React lanza *"Rendered more hooks than during the
previous render"* y la pantalla de onboarding se rompe.

**Arreglo aplicado** (única excepción autorizada al veto de tocar código
funcional en esta fase): el `if` se movió debajo de todos los hooks. Se verificó
que no quedaba ningún otro hook después del `return` — el `useState` del
formulario era el último. `npm run build` y el lint quedan en verde.

Este es el primer bug que encuentra la infraestructura de QA. Llevaba en el
código sin que nadie lo viera, y lo detectó una herramienta que hasta hoy no
funcionaba.

### 6.2 🟡 Ocho errores de estilo en el backend — ninguno es un bug

Los revisé uno por uno. **Ninguno afecta al comportamiento**:

| Archivo | Error | Diagnóstico |
|---|---|---|
| `automation/automation-errors.ts` ×4 | `Unnecessary escape character: \-` | En `SECRET_PATTERNS`, dentro de clases `[A-Za-z0-9._\-]`. `\-` y `-` son **idénticos** ahí. `sanitizeErrorText()` funciona correctamente. |
| `customer/customer-import.service.ts` | `Irregular whitespace` | Es un **BOM UTF-8 literal** dentro de `content.replace(/^﻿/, "")`, que limpia los CSV que exporta Excel. Funciona; sería más robusto escribirlo con el escape `﻿` en vez del carácter crudo, que un editor puede borrar sin avisar. |
| `agents-crud.service.ts` | `no-empty-object-type` | El tipo `{}` acepta cualquier valor no nulo. Deuda de tipos, sin efecto observado. |
| `whatsapp-integration.service.ts` ×2 | `prefer-const` | Autofixable con `npm run lint:fix`. |

Se dejaron **a propósito** sin corregir: la fase de QA no toca código funcional,
y un lint que refleja la realidad es más útil que uno maquillado.

---

## 7. Lo único que se tocó fuera de configuración

`frontend/src/pages/AutomationsPage.tsx:661` — un comentario
`eslint-disable-next-line react-hooks/rules-of-hooks`.

`useTemplate` ahí es una función normal ("usar esta plantilla"), **no un hook**;
la regla solo se guía por el prefijo `use` del nombre. El comentario no cambia
el comportamiento. Cuando se pueda tocar código funcional, lo correcto es
renombrarla a `applyTemplate` y borrar el disable.

---

## 8. Pendiente

- **CI (paso 7)**: `lint` + `typecheck` + `test:unit` en cada push. Hoy nada de
  esto corre solo — Railway y Netlify despliegan sin ejecutarlos.
- Cuando se levante el veto de tocar código funcional: el bug de §6.1, los
  arreglos de §6.2, y bajar la deuda de `any` (43 warnings en el panel).
