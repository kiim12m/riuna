# ADR 085 — Línea base

**Fecha:** 2026-10-13 · **Estado:** aceptada

**Contexto.** Punto 2.4 del [interludio de ideas de OpenProject](../plan.md#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado):
comparar una vista con un momento pasado, para ver qué tareas entran, cuáles salen y qué cambió.
Riuna no guarda instantáneas. La historia está en `activity`, pero varias filas no guardaban el
valor anterior.

**Decisión.**

- **Se reconstruye desde `activity`, sin instantáneas.** El primer cambio de cada campo después
  del momento guarda su valor de entonces; sin cambios, vale el de ahora. No hay tabla ni
  migración nuevas.
- **Se cubren los huecos de la actividad**, de aquí en adelante:
  - quitar el asignado guarda quién lo tenía, y cambiarlo, también el id anterior;
  - con el equipo pasa lo mismo;
  - la estimación pasa a dejar actividad;
  - la edición completa deja rastro del título, en su transacción como la ruta del título, y de
    la prioridad;
  - el inicio ya lo dejaba desde la ADR 083.

  Una fila antigua sin el valor anterior se da por igual que ahora. Así la comparación puede
  callar un cambio viejo, pero nunca inventa uno.
- **El filtro de la vista se evalúa contra el pasado con el motor de siempre**
  ([ADR 014](014-motor-de-filtros.md)): el pasado se monta en una CTE llamada `task` que
  sombrea la tabla, así que la semántica es la de la barra de filtros.
- **Límites aceptados**:
  - las pertenencias (asignados, etiquetas, épicas, observadores) se evalúan como están ahora;
  - `completed_at` solo sabe si se completó después;
  - las tareas borradas no salen, y las creadas después no estaban.
- **`GET /task/tasks/:projectId/baseline?at=&filter=&treeScope=`** devuelve:
  - lo que entra, como ids;
  - lo que sale, con sus valores de entonces;
  - lo que cambia, con solo los campos que cambiaron: título, estado, prioridad, asignado, fechas
    y estimación.

  Un momento futuro devuelve 400.
- **Momentos**: ayer, el último día laborable, hace una semana o una fecha.
  - Se compara siempre con el comienzo de ese día (00:00 local).
  - El último día laborable salta los fines de semana y los festivos del espacio, el calendario
    de la ADR 083.
  - Los relativos se recalculan cada día, también en una vista guardada.
- **Tabla**: selector «Línea base», en la URL y en la vista guardada. Marca `+` lo que entra y `●`
  lo que cambió, con el valor anterior tachado; lo que sale va al final en gris, y un resumen
  arriba lo cuenta.
- **Gantt**: el mismo selector, y la barra de entonces como franja discontinua bajo la de ahora.
- **MCP**: `compare_task_baseline`.

**Consecuencias.**

- **Medido con 50.000 tareas** (proyectos de 10.000 y 250.000 filas de actividad):
  - ayer y hace una semana, entre 95 y 155 ms de p95, con filtro, sin él o con su rama;
  - dos meses atrás, con el proyecto entero cambiado (9.726 tareas), 282 ms de p95 sin filtro y
    295 ms con la rama. Es el peor caso: el coste crece con la actividad de la ventana.

  Con la batería de integración corriendo a la vez, ese peor caso llegó a 358 ms.
- **`EXPLAIN`** obligó a cuatro cambios:
  - **Sin estadísticas de la CTE**, el planificador estimaba 50 filas en vez de 10.000. «Lo que
    casa, más su rama» acababa en un bucle anidado de 33 millones de comparaciones: 2.152 ms.
    Ahora lo que casa se calcula una vez y cada fila lo mira con un `IN` en la lista de columnas,
    que Postgres resuelve con un hash: 140 ms.
  - **Lo que casa ahora** viajaba como un array de 10.000 ids que se recorría por cada fila. Ahora
    va en la misma consulta, en una CTE declarada antes de `task`, donde `task` aún es la tabla
    de verdad.
  - **La agregación se iba a disco** (21 lotes, 7 MB) porque cada fila llevaba su `event_data`
    entero. Ahora solo viaja el valor anterior.
  - **Un índice `activity (task_id, created_at)` se probó y se descartó**: el planificador sigue
    con el recorrido en paralelo de `activity` (12 ms).
- Al añadir la línea base a la vista guardada salió que `v.object` descartaba también el color de
  las filas de la 1.5: la vista volvía sin él. Ahora se declaran los dos.
