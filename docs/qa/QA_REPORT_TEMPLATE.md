# QA_REPORT_TEMPLATE — Formato estándar de reporte

> Se copia este archivo, se rellena con datos **reales** y el resultado se
> guarda en `LAST_QA_REPORT.md`.
>
> Reglas al rellenarlo:
> - Un estado sin evidencia es `NO PROBADO`. Sin excepciones.
> - Todo comando lleva su **exit code**.
> - Toda prueba HTTP lleva **endpoint + status code**.
> - Lo que no se probó **también se escribe**.
> - Ningún valor de secreto. URLs de base de datos enmascaradas.
>
> Borrar los comentarios `<!-- ... -->` al rellenar.

---

# Reporte de QA local — Sendwary

**Fecha:** AAAA-MM-DD
**Ejecutado por:** <!-- nombre o "Claude Code (sesión X)" -->
**Entorno:** LOCAL
**Rama:** `main`
**Commit / estado del árbol:** <!-- hash, o "árbol sucio: N rutas sin commitear" -->

**Alcance:** <!-- qué cambió y qué filas de LOCAL_QA_MATRIX.md aplican -->

---

## 1. Veredicto

| | |
|---|---|
| **Resultado global** | <!-- PROBADO CORRECTAMENTE / FALLA DETECTADA / PROBADO PARCIALMENTE --> |
| **¿Apto para pasar a DEV?** | <!-- Sí / No + motivo. Checklist en QA_RULES.md §7 --> |
| **Fallas abiertas** | <!-- número --> |
| **Riesgos detectados** | <!-- número --> |

<!-- Dos o tres frases: qué se probó, qué salió mal, qué quedó fuera. -->

---

## 2. Cambio auditado

```
<!-- salida de: git status --porcelain  y  git diff --stat
     Recordar: los repos anidados (backend/.git, frontend/.git) no aparecen
     en el git status de la raíz. -->
```

**Módulos afectados:** <!-- Auth, Prisma, WhatsApp… -->
**Áreas exigidas por la matriz:** <!-- lista -->

---

## 3. Comandos ejecutados

Literalmente, con su exit code. Esta tabla es la columna vertebral del reporte.

| # | Directorio | Comando | Exit | Resultado |
|---|---|---|---|---|
| 1 | `backend` | `npm run typecheck` | | |
| 2 | `backend` | `npm run lint` | | |
| 3 | `backend` | `npm run test:unit` | | |
| 4 | `backend` | `npm run test:db:setup` | | |
| 5 | `backend` | `npm run test:db` | | |
| 6 | `backend` | `npm run test:http` | | |
| 7 | `frontend` | `npx tsc -b` | | |
| 8 | `frontend` | `npm run lint` | | |
| 9 | `frontend` | `npm run build` | | |
| 10 | `webpage` | `npm run lint` | | |
| 11 | `webpage` | `npm run build` | | |

<!-- Añadir o quitar filas según lo ejecutado. NO dejar filas que no se corrieron:
     moverlas a la sección 6 como NO PROBADO. -->

### Conteos de pruebas

| Suite | tests | pass | fail |
|---|---|---|---|
| `test:unit` | | | |
| `test:db` | | | |
| `test:http` | | | |
| **Total** | | | |

---

## 4. Resultados por área

Estados permitidos, y ningún otro (`QA_RULES.md` §1):
`PROBADO CORRECTAMENTE` · `FALLA DETECTADA` · `PROBADO PARCIALMENTE` ·
`NO PROBADO` · `PENDIENTE POR CREDENCIALES EXTERNAS` ·
`PENDIENTE POR AMBIENTE PÚBLICO` · `NO VERIFICABLE EN LOCAL` · `RIESGO DETECTADO`

| Área | Estado | Evidencia | Nota |
|---|---|---|---|
| Auth | | | |
| Cookies | | | |
| Roles | | | |
| SUPER_ADMIN | | | |
| Tenants | | | |
| Onboarding | | | |
| Billing | | | |
| Email | | | |
| Agents | | | |
| Conversations | | | |
| Admin | | | |
| WhatsApp | | | |
| Embedded Signup | | | |
| Prisma | | | |
| Security | | | |
| Frontend | | | |
| Backend (global) | | | |

<!-- "Evidencia" = comando + exit code, o endpoint + status, o "observado en
     navegador: <qué se vio>". Si la casilla queda vacía, el estado es NO PROBADO. -->

---

## 5. Verificaciones HTTP

<!-- Solo si se probaron endpoints a mano. Las suites automáticas ya quedan
     cubiertas por la sección 3. -->

| Método | Endpoint | Como | Status | Código de error | ¿Esperado? |
|---|---|---|---|---|---|
| | | | | | |

---

## 6. Lo que NO se probó

Obligatorio. Un reporte que solo lista lo verde miente por omisión.

| Área / caso | Estado | Motivo |
|---|---|---|
| | | |

---

## 7. Fallas detectadas

<!-- Una por bloque. Si no hubo ninguna, escribir "Ninguna." -->

### F1 — <!-- título corto -->

| | |
|---|---|
| **Estado** | `FALLA DETECTADA` |
| **Área** | |
| **Gravedad** | 🔴 bloqueante / 🟠 alta / 🟡 media |
| **Detiene la pasada** | <!-- Sí/No — ver QA_RULES.md §6 --> |

**Cómo reproducirlo**

```
<!-- comandos exactos -->
```

**Qué se esperaba:**
**Qué ocurrió:** <!-- salida real, exit code, status -->

**Evidencia**

```
<!-- salida literal, recortada, sin secretos -->
```

**Causa (si se identificó):** <!-- archivo:línea. Si no se investigó, decirlo. -->

---

## 8. Riesgos detectados

<!-- Cosas que no fallaron pero pueden romperse. Con archivo y línea. -->

| # | Riesgo | Dónde | Impacto | Cómo se detectó |
|---|---|---|---|---|
| R1 | | | | `[EJECUTADO]` / `[LEÍDO]` |

---

## 9. Verificación manual en navegador

<!-- Solo lo observado de verdad en pantalla. -->

| Recorrido | Estado | Qué se observó |
|---|---|---|
| Login OWNER → panel | | |
| Recarga de ruta profunda | | |
| Logout → `/login` | | |
| Cookie `sid` HttpOnly ✓ en DevTools | | |
| SUPER_ADMIN → `/admin` sin paywall | | |

---

## 10. Estado de la base de datos

| Comprobación | Resultado |
|---|---|
| `npx prisma migrate status` (dev) | |
| Base de pruebas usada | `ferreteria_ai_agent_test` |
| ¿Se escribió en la base de desarrollo? | <!-- debe ser NO --> |
| Residuos de prueba en dev <!-- Tenant LIKE '\_\_%test%' --> | <!-- debe ser 0 --> |

---

## 11. Conclusión

<!-- Tres líneas: qué quedó verde, qué quedó rojo, qué hay que hacer ahora. -->

**Siguiente acción recomendada:**
