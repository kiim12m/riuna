# ADR 090 — «Mi semana» lee el plan, y «Vencen esta semana» la semana natural

**Fecha:** 2026-10-15 · **Estado:** aceptada · **Precisa la
[ADR 043](043-rejilla-de-doce-columnas-del-panel.md)**

**Contexto.** En el panel de inicio, «Mi semana» salía vacía mientras «Vencen esta semana» marcaba
1. Las dos miraban cosas distintas. La tira repartía por `due_date` la semana natural (lunes a
domingo). La tarjeta usaba `week`, una ventana **móvil** de mañana a hoy+7, así que una tarea del
martes siguiente contaba en la cifra y no salía en ningún día. Además, la tira enseñaba
vencimientos, cuando lo que se espera de ella es lo **planificado**: desde la ADR 040, vencer y
planificar son datos distintos. Se decidió preguntando (2026-10-15).

**Decisión.**

- **La tira lee `personal_plan_entry`**, la misma fuente que Planificador, Hoy y Cronograma: lo que
  quien mira tiene planificado cada día de la semana natural, en el orden del Planificador. Las
  hechas siguen saliendo, tachadas.
  - **Sin ámbito personal**: el plan ya es de quien mira y planificar no exige estar asignado. El
    proyecto y el filtro del widget siguen acotando, y lo archivado sigue fuera. El editor deja
    de ofrecer el ámbito en este tipo de widget.
- **«Vencen esta semana» cuenta de mañana al final de la semana natural**, con el inicio de semana
  de quien mira. Es un valor nuevo, `thisWeek`, solo para widgets (`WIDGET_DUE_WINDOWS`). La `week`
  compartida no cambia: es una ventana móvil que leen Mi trabajo, el Planificador y el reparto por
  `dueWindow`, y el `CASE` que etiqueta ese reparto no admite dos ramas solapadas.
- **La migración 0093** pasa a `thisWeek` las tarjetas sembradas que conservan el título «Vencen
  esta semana». El editor no ofrece `dueWindow`, así que una tarjeta con otro nombre que pida
  `week` la montó alguien a propósito y se queda como está.

**Consecuencias.**

- El último día de la semana, «Vencen esta semana» da 0: no queda semana natural. Es la respuesta
  correcta, y «Vencen hoy» sigue cubriendo ese día.
- Cambiar el inicio de semana cambia la cifra. Ya iba en la clave de la consulta del panel por la
  tira, así que se recalcula sola.
- Los paneles nuevos siembran «Mi semana» sin `scope`. Los ya guardados conservan el suyo, que se
  ignora.
