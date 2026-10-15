# ADR 082 — Hitos

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 2.1 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado):
marcar un punto en el tiempo —«boletín entregado», «entrega al cliente»— que no es un trabajo
que dure. Hasta ahora se hacía con una tarea de un día, que sumaba estimación, admitía
cronómetro y se dibujaba como una barra más.

**Decisión.**

- **Una columna `is_milestone`** en la tarea (migración 0087), propia porque se filtra.
- **Un hito tiene una sola fecha.** El inicio es siempre el vencimiento. Al marcarlo se queda
  con la fecha del final, y cualquier camino que cambie una de las dos cambia las dos: la
  edición completa (el Gantt manda las dos al arrastrar), el vencimiento suelto o la creación.
- **Ni estimación, ni cronómetro, ni subtareas.**
  - Marcarlo borra la estimación.
  - Estimarlo responde 400 y arrancar el cronómetro, 409.
  - Una tarea con subtareas no puede ser hito (400), y bajo un hito no se cuelga nada, ni al
    crear ni al reparentar.
- **Dónde se ve:**
  - rombo en el Gantt, que se arrastra pero no se estira;
  - `◆` delante del título en el Calendario, el tablero, la lista y la Tabla;
  - interruptor «Hito» en el lateral del detalle, que esconde la fecha de inicio, el
    cronómetro, la estimación y las subtareas;
  - el filtro «Hito» del motor (ADR 014);
  - la copia JSON del proyecto.
- **Actividad**: `milestone_changed`. **MCP**: `set_task_milestone` y `isMilestone` en
  `create_task`.
- **API**: `PUT /task/milestone/:id`, que pide `task:update`.

**Consecuencias.**

- La hoja CSV/Excel de ida y vuelta no lleva todavía la marca de hito: el importador la ignora y
  la exportación no la escribe.
- El importador puede colgar una tarea bajo un hito, porque arma los nodos del árbol sin leer la
  fila entera; la interfaz y la API no.
