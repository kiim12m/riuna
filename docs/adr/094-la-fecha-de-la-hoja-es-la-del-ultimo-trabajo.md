# ADR 094 — La columna B de la hoja SERVITEC es la fecha del último trabajo, no `updated_at`

**Fecha:** 2026-10-25 · **Estado:** aceptada · **Precisa la
[ADR 069](069-la-hoja-de-servitec-vuelve.md)**

**Contexto.** La columna B («FECHA») se llenaba con `task.updated_at`, que se mueve con cualquier
escritura de la fila, también las que nadie decide: reimportar la hoja reescribe **todas** las filas
que ya existían (no compara, `write-tasks.ts`), y recalcular fechas automáticas, propagar un estado o
desplazar una rama tocan tareas que nadie ha abierto. Caso real: una tarea sin cambios desde el 19/10
salió con 23/10. Se decidió preguntando (2026-10-25).

**Decisión.** B es la fecha **más reciente** de estas tres:

- **El alta de la tarea** (`task.created_at`), que es el suelo: sin nada más, B dice desde cuándo
  existe.
- **Un comentario** (`activity.type = 'comment'`, por `created_at`). Editarlo no cuenta.
- **Tiempo trabajado** (`time_entry`): cronómetro, registro manual y sesión de foco, que viven en la
  misma tabla. Cada entrada cuenta por `COALESCE(end_time, start_time)`: un cronómetro en marcha por
  su arranque, uno cerrado por su cierre.

Nada más la mueve: ni estado, prioridad, fechas o responsables, ni importaciones ni recálculos. La
lista va fija en `export-workspace-tasks.ts`; no se hace configurable para un solo uso.

**Consecuencias.**

- Un registro manual cuenta con **su** fecha, no con el día en que se escribió.
- Arrancar el cronómetro en otra tarea cierra el anterior y le pone `end_time`: esa tarea adelanta su
  fecha en ese momento.
- Borrar un comentario o una entrada de tiempo hace retroceder la fecha.
- Los comentarios importados de la hoja llevan la fecha de su día (`servitec-comments.ts`), así que
  reimportar no la adelanta. La importación no lee B, y la ida y vuelta no cambia.
- Descripción y etiquetas no escriben en `activity`, así que no pueden contar aunque se quisiera.
- Medido en el banco de 50.000 tareas (2026-10-25), con 50.000 comentarios, 100.000 eventos de otros
  tipos y 40.000 entradas de tiempo: las dos consultas agregadas tardan 83 ms y 65 ms sobre **todo** el
  espacio; la exportación se corta en 20.000 filas. Recorren `activity` y `time_entry` enteras, como
  corresponde a un libro completo.
