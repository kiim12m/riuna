# ADR 078 — Acciones de un clic

**Fecha:** 2026-10-12 · **Estado:** aceptada

**Contexto.** Punto 1.3 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
un botón en la tarea que haga varias cosas a la vez, como «Enviar a revisión». El motor de
automatizaciones (ADR 066 y 067) ya sabe condiciones y acciones; solo le faltaba un disparador
que no venga de un evento.

**Decisión.**

- **Un disparador nuevo, `manual`** («Se pulsa el botón»), sin configuración. Vale en reglas de
  proyecto y de espacio, como los demás. No escucha el bus ni lo mira el planificador.
- **La regla sale como botón** con su nombre:
  - en el detalle de la tarea, junto al cronómetro;
  - en el menú contextual de filas y tarjetas, en «Acciones».

  Solo sale mientras la tarea cumple su «Si», que se evalúa con el mismo motor de filtros que
  las demás reglas. Si deja de cumplirlo, pulsar responde 409.
- **Actúa en nombre de quien pulsa**, no de quien guardó la regla, como enseñaba la maqueta.
  - Pulsar pide `task:update`, y además `task:assign` si la regla reparte la tarea.
  - Quien no puede editar no ve ningún botón.
  - Quien guardó la regla tiene que seguir pudiendo, como en las que disparan solas: si no, la
    regla se pausa.
- **El historial de siempre, con quien pulsó.**
  - El contexto de la regla lleva `pressedBy`.
  - La actividad lo guarda, y la web la firma como «Ana con «Enviar a revisión»».
  - La ejecución lo apunta en su detalle.
  - La cadena empieza en la propia regla: lo que haga puede disparar otras reglas, con el corte
    de bucles de siempre.
- **MCP**: `list_task_actions` y `run_task_action`.

**Consecuencias.**

- No hay tabla nueva: una regla de un clic se crea, se pausa y se archiva donde las demás.
- Cada botón cuesta una consulta de condición al abrir la tarea. Son pocas reglas por proyecto,
  y la lista cuelga de `["task", id]`, así que se refresca con cada cambio de la tarea.
