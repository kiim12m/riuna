# ADR 050 — Recordatorios por asignado, rearmados por un disparador; una sola carga del día

**Fecha:** 2026-10-01 · **Estado:** aceptada

**Contexto.** La revisión del interludio de productividad encontró cuatro
incoherencias.

- **Recordatorios.** El de vencimiento solo avisaba a `task.assignee_id`, el
  responsable principal. Quien estaba asignado además, en `task_assignee`, no se
  enteraba.
- **Rearme.** El registro de «ya avisado» solo se borraba desde
  `PUT /task/due-date/:id`. Si la fecha cambiaba por el `PUT` completo, la
  edición en bloque, la importación, MCP o un webhook, nunca volvía a avisar.
- **Tareas archivadas.** Lo terminado se excluía por `column.is_final`, y una
  tarea archivada, sin columna, recibía avisos.
- **La carga del día tenía dos fórmulas.** El Planificador la calculaba en el
  navegador, contando también lo ya hecho. El Cronograma sumaba la duración de
  sus tramos, con los 30 min de relleno de lo no estimado, frente a la jornada
  bruta, sin restar la comida ni los días libres. El mismo día salía con dos
  porcentajes.

**Decisión.**

- **El trabajo recorre `task_assignee`**, que incluye al responsable principal
  (ADR 010): una fila por asignado, cada uno con su antelación y su
  interruptor. El «ya avisado» lleva a quién, `configured_before:<userId>` u
  `overdue:<userId>`, el patrón de `generic_webhook:<id>` de los webhooks de
  proyecto.
- **La migración 0069** atribuye las filas existentes al responsable principal
  y quita las de tareas sin responsable.
- **El disparador `task_rearm_due_reminders`**, `AFTER UPDATE OF due_date` con
  `WHEN (OLD IS DISTINCT FROM NEW)`, borra los avisos de la tarea cuando la
  fecha cambia de verdad, venga del camino que venga. Es la misma razón que la
  ADR 025 dio para `completed_at`: muchos escritores, una sola regla en la base.
  El controlador deja de hacerlo a mano.
- **Lo terminado es `completed_at IS NULL`** (ADR 030), y lo archivado se
  excluye aparte.
- **Un prefiltro sargable sobre `due_date`.** La antelación está acotada a 30
  días, así que solo pueden tocar los vencimientos de esa franja.
- **`dayLoad()`** (`work-schedule/day-load.ts`), pura: lo que queda de cada
  tarea planificada y **sin terminar** (estimación menos registrado, nunca
  negativo), más los bloques fijos, frente a `capacityForDay`.
  `GET /planner` devuelve `loadByDay` y cada día de `GET /schedule` su `load`;
  ninguna de las dos pantallas la calcula ya.

**Consecuencias.**

- **Avisos multiplicados por diseño.** Con tres asignados, una tarea genera
  tres avisos de vencimiento y tres de «vencida». Cada uno pasa por los canales
  de su persona.
- **La carga del Planificador baja** cuando hay tareas hechas en el día, que
  antes contaban. La del Cronograma cambia de criterio: ya no cuenta el relleno
  de lo no estimado.
- **El disparador también borra los avisos de webhook** al cambiar la fecha,
  igual que hacía el controlador.
- **De paso**, `user_work_schedule` se registra en el esquema de drizzle.
  Faltaba, como `task_assignee` en la Fase 1, y `db.query` no la conocía.
- **Verificado:**
  - 6 pruebas de integración de los recordatorios, que fallan todas con el
    trabajo anterior;
  - una que fija que el Planificador y el Cronograma dan la misma carga para
    el mismo día;
  - 4 unitarias de `dayLoad`.
