# ADR 083 — Tareas resumen

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 2.2 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--cerrado).
Los agregados de rama ya se calculaban al leer y el Gantt dibujaba un corchete, pero un padre
conservaba fechas propias editables y la fecha «heredada» solo se anunciaba. Las decisiones se
tomaron preguntando (2026-10-13).

**Decisión.**

- **Una marca `auto_dates`** en la tarea y **las fechas guardadas en la propia fila**
  (migración 0088). Un padre con fechas automáticas toma el inicio más temprano y el fin más
  tardío de toda su rama sin archivar. Como se guardan, los filtros, el orden, el Calendario y
  la exportación las ven sin saber nada de ramas.
- **Los padres sin fechas propias pasan solos a automáticas**, al desplegar y desde entonces.
  La migración lo hace con los que ya existían y les escribe las fechas de su rama. Un padre con
  fechas propias las conserva. Volver a «propias» se queda con las que tuviera.
- **Se recalcula al escribir**, en `task/schedule`:
  - el núcleo puro `computeSchedule` decide qué cambia;
  - `rescheduleProject` lo carga y lo escribe bajo el cerrojo del proyecto (ADR 016);
  - `scheduleAfter` lo llama cada camino que mueve fechas, estados o el árbol: crear,
    editar, el vencimiento suelto, archivar, la edición en bloque, reparentar, borrar, mover
    de proyecto, el importador y la hoja de SERVITEC.

  Una consulta barata por los segmentos del `path` mira antes si hay algún ancestro automático
  o sin fechas; si no, no se carga el proyecto.
- **Lo que mueve la planificación es efecto secundario** (`cascadedFrom`): deja actividad
  («(planificación automática)») y refresca las vistas, pero ni avisa ni dispara
  automatizaciones.
- **Las fechas automáticas no se editan a mano.** El vencimiento suelto responde 409. La edición
  completa las ignora en vez de rechazar el título que venía con ellas.
- **Mover la rama entera**: `POST /task/shift-branch/:id`, con días laborables o con el día en
  que tiene que empezar.
  - Cada fecha de la rama se mueve los mismos días laborables, de lunes a viernes y saltando
    los festivos del espacio.
  - Arrastrar cualquier padre en el Gantt lo usa. La barra de resumen de unas fechas
    automáticas no se estira.
- **Aviso de desviación**: el detalle de un padre con fechas propias desbordado dice cuántos días
  laborables acaban después las subtareas. Ofrece mover el vencimiento o pasar a automáticas.
  En el Gantt, el corchete sale en tono de peligro.
- **Progreso ponderado**: ajuste de jerarquía por proyecto (`weighted_progress`). Cada subtarea
  pesa su estimación. Una sin estimar pesa la media de la rama, un hito no pesa, y sin ninguna
  estimada se vuelven a contar tareas. Lo calcula `serializeAggregate`, que es lo que leen
  todas las vistas.
- **La fecha de inicio deja actividad** (`start_date_changed`), y también el cambio de modo y
  mover la rama. **MCP**: `set_task_auto_dates` y `shift_task_branch`.

**Consecuencias.**

- Cada cambio de fechas bajo un padre automático paga una carga del proyecto (una consulta). Con
  50.000 tareas, cargar un proyecto de 10.000 cuesta unos milisegundos (ver ADR 084).
- Los recordatorios de vencimiento llegan ahora también por los padres automáticos, que antes no
  tenían fecha.
- Mover la rama no avisa del vencimiento de cada tarea movida: es un gesto de planificación.
