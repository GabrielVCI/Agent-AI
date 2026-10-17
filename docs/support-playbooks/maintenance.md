# Playbook: Cronograma de mantenimiento (Módulo 4)

- **Feature**: Pantalla `/mantenimiento` — a quién le toca volver, quién está vencido y desde hace cuánto, con filtros por servicio y por días de retraso.
- **Tier por defecto**: TIER_1 · **Riesgo**: BAJO (solo lectura; expone nombres y teléfonos de clientes)

## Descripción
El cronograma responde a una pregunta: **¿a quién hay que llamar hoy?**

Se construye solo, cruzando dos cosas que el negocio ya tiene:

```txt
Última vez que el cliente recibió ese servicio   (historial de citas)
                    +
Cada cuánto se repite ese servicio               (catálogo)
                    ↓
              Le toca el <fecha>
```

Estados: **Vencido** · **Le toca hoy** · **Próximo**.

Reglas que hay que saber para dar soporte:
- Solo cuenta la **última** vez que ese cliente recibió ese servicio. Quien se tiñe cada mes es una fila, no doce.
- Un servicio **sin recurrencia configurada** no aparece nunca. Es la causa nº1 de "está vacío".
- Quien **ya tiene cita** para ese servicio **no aparece** (no hay que llamarle). Se pueden ver con el interruptor "Incluir los que ya tienen cita".
- Las fechas se calculan con la recurrencia que el servicio tiene **hoy**, no con la que tenía el día de la visita.

Detalle técnico: `docs/SERVICE_HISTORY.md` §14.

## Errores comunes y síntomas
| Síntoma | Causa |
|---|---|
| "La pantalla está vacía / dice que no hay servicios que se repitan" | Ningún servicio tiene recurrencia configurada. Ir a **Catálogo** → editar el servicio → "Este servicio se repite". Es la causa nº1. |
| "Configuré el tinte y sigue sin salir nadie" | Nadie tiene aún una **cita completada** con ese servicio. El cronograma sale del historial: sin visitas cerradas no hay nada que planificar. |
| "Falta una clienta que sé que se tiñó" | Tres causas: (1) la cita no está **COMPLETADA**; (2) el servicio de la cita no es el ítem del catálogo con recurrencia; (3) **ya tiene cita futura** y por eso se oculta — activar "Incluir los que ya tienen cita". |
| "Cambié el intervalo y las fechas se movieron todas" | Correcto y deliberado: el cronograma usa la configuración actual. Los recordatorios ya programados NO se mueven (se ven en la ficha del cliente). |
| "Aparece gente que ya no es cliente" | Los archivados se excluyen. Si aparece, no está archivado: archivarlo desde su ficha. |
| "Puse 'cada 1 mes' y esperaba 30 días" | No son lo mismo a propósito: 1 de enero + 1 mes = 1 de febrero. |
| "Dice vencido hace 15 días y yo cuento 14" | El corte es el **día del negocio** (zona horaria de la empresa), no la hora exacta. |
| "Sale un producto y yo esperaba solo servicios" | Un producto de mantenimiento con recurrencia (champú, aceite) también se planifica: es una **recompra**. Lleva icono de bolsa. |
| "El tinte que gastamos en el salón genera recompra" | No debería: el material marcado como **usado internamente** se excluye. Si aparece, la línea se registró como *producto vendido*. |
| "Los contadores no cuadran con la tabla" | Los contadores excluyen a los ya agendados (que se cuentan aparte en "Ya agendados"). Al pulsar un contador se aplica ese filtro. |
| "No puedo cambiar una fecha desde aquí" | Es correcto: el cronograma se **deriva**. Se cambia configurando el servicio o cerrando la cita. |

## Diagnóstico
1. ¿El servicio tiene recurrencia? **Catálogo** → debe decir "Se repite cada X".
2. ¿Hay historial? Ficha del cliente → **Visitas** y servicios realizados.
3. ¿Está oculto por tener cita? Activar "Incluir los que ya tienen cita": si aparece con la etiqueta verde, ese es el motivo.
4. Contadores de arriba = cifras reales; pulsarlos filtra la tabla.
5. Zona horaria de la empresa en **Configuración**: define cuándo algo pasa a "vencido".

## Pasos de solución
- **Cronograma vacío** → configurar la recurrencia de los servicios en el Catálogo (tinte 30 días, keratina 90, botox 60, aceite 6 meses…).
- **"Clientes con más de 40 días sin retoque"** → filtro de servicio = Tinte + chip **40+ días**.
- **Contactar a alguien** → botón de agendar (precarga nombre y teléfono) o ir a Conversaciones.
- **Que el aviso salga solo** → además de la recurrencia, activar la automatización "Recordatorio de mantenimiento" en **Automatizaciones**. Sin ella el cronograma informa, pero no escribe a nadie.
- **Sacar un servicio del cronograma** → apagar su recurrencia en el Catálogo (desaparece al instante, no se pierde historial).

## Automatizable por el agente (Tier 1)
- Explicar que hace falta configurar la recurrencia en el Catálogo para que el cronograma exista.
- Explicar por qué alguien con cita agendada no aparece.
- Explicar que solo cuenta la última visita de cada servicio.
- Explicar la diferencia entre el cronograma (informa) y la automatización (envía).
- Guiar el filtro de "vencidos hace N días".
- Explicar que "1 mes" ≠ "30 días".

## Requiere humano (Tier 2+)
- Citas completadas sin cliente vinculado (no aparecen en ningún cronograma).
- Mensaje de mantenimiento distinto **por servicio** (hoy el texto vive en la automatización, uno para todos).
- Anticipación del recordatorio por servicio (hoy el adelanto se fija en la automatización).

## Riesgo
BAJO: la pantalla es de **solo lectura** y no dispara envíos. El riesgo real aparece al usar la lista para contactar en masa: confirmar el criterio con el negocio antes de una campaña.

## Endpoints
```txt
GET /api/maintenance/schedule   ?serviceId= &status= &overdueMinDays=
                                &search= &includeScheduled= &page= &limit=
GET /api/maintenance/counters
GET /api/maintenance/services
```

## Escalamiento
- Ver clientes de otra empresa → **TIER_3 inmediato**.
- Fechas manifiestamente imposibles (año equivocado, vencidos de hace décadas) → TIER_2: revisar `performedAt` del historial.
