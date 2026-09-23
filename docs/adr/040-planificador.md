# ADR 040 — El Planificador tiene su propia tabla, y no toca `due_date`

**Fecha:** 2026-09-22 · **Estado:** aceptada

**Contexto.** El bloque 6 del interludio pide una ventana rodante de 15 días
donde arrastrar una tarea de un día a otro —o desde «sin planificar»— organiza
el trabajo de quien mira, sin cambiar lo que el equipo ve. `due_date` es un
compromiso con el equipo (ADR 011 y siguientes lo usan así en todas partes:
Gantt, calendario, ventanas de vencimiento de ADR 038); que planificar mi
semana mueva esa fecha sería escribir en una columna que no es mía. Hace falta
un sitio distinto para «qué día pienso hacerlo», y una forma de mostrar las
tareas recurrentes que aún no existen sin inventarlas antes de tiempo.

**Decisión.**

- **Tabla nueva `personal_plan_entry`**, aditiva, con la misma forma que
  `cycle`/`goal`/`task_recurrence` (`id` cuid2, timestamps `mode:"date"`,
  `updatedAt` con `$onUpdate`):

  ```
  id            text primary key
  workspace_id  text not null → workspace (cascade)   -- regla de "siempre presente"
  user_id       text not null → user (cascade)
  task_id       text not null → task (cascade)
  planned_date  timestamp not null
  position      integer not null default 0
  created_at / updated_at
  ```

  Único por `(user_id, task_id)` —una tarea tiene un solo sitio en el plan de
  cada persona—, indexado por `(user_id, planned_date)` —la consulta de la
  ventana—. Cae en cascada con el usuario o la tarea: un plan personal no
  sobrevive a lo que planifica.
- **Módulo nuevo `apps/api/src/planner/`**, plano como `my-work/` y no
  colgado de `task/`. Tres rutas: `GET /api/planner` (la ventana, por
  `workspaceId` + `days`), `PUT /api/planner/:taskId` (planea o mueve;
  cuerpo `{ plannedDate, position }`), `DELETE /api/planner/:taskId` (vuelve a
  «sin planificar»). Ninguna de las tres escribe en `task.due_date` — es la
  invariante que existe esta ADR, y la prueba de integración más importante
  del bloque es demostrarla.
- **«Sin planificar» se calcula, no se guarda**: lo asignado y sin terminar
  (mismo `assignedCondition`/`notDoneCondition` de `my-work/`) que **no**
  tiene ninguna fila en `personal_plan_entry`, sin importar la fecha — un
  `NOT EXISTS`, no acotado a la ventana. Si estuviera acotado, una tarea
  planeada la semana pasada y no completada reaparecería como «sin
  planificar» cada vez que la ventana avanza, que es lo contrario de lo que
  planificarla quería decir.
- **Los fantasmas de recurrentes se proyectan, nunca se guardan.**
  `apps/api/src/recurrence/cadence.ts` ya expone `firstOnOrAfter` y
  `nextOccurrence`, funciones puras sin escritura; encadenarlas desde el
  principio de la ventana hasta el final entrega las fechas de ocurrencia
  exactas que generaría el planificador real, sin tocar la función ni
  duplicar su lógica. Se filtran las `task_recurrence` activas cuyo
  `template->>'assigneeId'` sea quien mira, dentro de proyectos de su
  espacio. **Un fantasma no se arrastra ni cuenta en la carga**: la tarea no
  existe todavía —no hay `task_id` al que colgar una fila del plan—, y
  contarlo prometería una capacidad ocupada por algo que aún puede no
  llegar a crearse si la recurrencia se apaga antes.
- **La carga del día es `SUM(estimate) / capacidad`**, sumando solo
  `personal_plan_entry` reales (no fantasmas). La capacidad es una
  **constante de 8 h por persona** en esta iteración — hacerla configurable
  es una pantalla de ajustes que este bloque no abre, y se declara así en vez
  de fingir que ya es por-usuario.
- **Arrastre con `dnd-kit`, no la matemática de puntero del Gantt.** El
  Planificador son columnas discretas —15 días más «sin planificar»—, el
  mismo problema que ya resuelve `kanban-board` (`useDroppable` por columna,
  `useSortable` por tarjeta, `onDragEnd` decide destino por `over.id`). La
  matemática continua de `gantt-task-bar.tsx` está pensada para una línea de
  tiempo en píxeles, no para saltar entre columnas.
- **Tarjeta propia, no la de `kanban-board`.** Su `TaskCard` lee
  `useProjectStore()` —el proyecto activo, uno solo— tanto en el contenedor
  como dentro de la tarjeta; el Planificador cruza proyectos como «Mis
  tareas», así que gana una tarjeta ligera nueva en la misma línea que
  `WidgetTaskRow`, con `useSortable` añadido.
- **Tiempo real por el mismo patrón que `NOTIFICATION_CREATED`**, el más
  simple de los dos que ya existen: `personal-plan.changed` lleva el
  `userId` en el propio evento y se difunde directo con `broadcastToUser`,
  sin la resolución de destinatarios que sí hace falta para un evento de
  equipo. Mensaje nuevo `PLAN_INVALIDATED` en el canal de usuario que ya
  abre `useUserWebSocket`.
- **La frontera de "hoy" hereda la limitación ya declarada** de
  `apps/api/src/utils/day-boundaries.ts`: día del servidor, no por huso
  horario de quien mira. Es la misma deuda de la Fase 4.5, no una nueva.

**Por qué no las alternativas.** Escribir el día planeado en una columna de
`task` (aunque fuera `planned_date` y no `due_date`) habría acoplado el plan
personal al ciclo de vida de la tarea —borrar una tarea borraría sin querer
el historial de cuándo se planeó, y una tarea no puede tener un plan distinto
para dos personas si alguna vez hay reasignación—. Materializar los
fantasmas al abrir el Planificador —crear la tarea antes de que le tocara— es
exactamente el atajo que la ADR 026 ya rechazó: adelantaría lo que el
generador real decide, y una recurrencia que se pausa a mitad de semana
dejaría tareas creadas de más. Guardar la capacidad por usuario desde ya
añadía una pantalla de ajustes que ningún criterio de aceptación pide
todavía.

**Consecuencias.**

- **El endpoint de lectura hace tres consultas** (ventana de
  `personal_plan_entry`, «sin planificar», fantasmas) en vez de una: son tres
  preguntas de forma distinta —filas reales, ausencia de filas, fechas
  proyectadas sin fila— y forzarlas a una sola consulta las mezclaría peor de
  lo que cuesta pedirlas aparte.
- **Un fantasma que se materialice** (el generador crea la tarea de verdad)
  no hereda ningún sitio en el plan: aparece como «sin planificar» hasta que
  alguien lo arrastre, igual que cualquier tarea nueva. No hay traspaso
  automático.
- **Reasignar una tarea no mueve su fila del plan.** `personal_plan_entry` es
  de quien la creó, no de quien tiene la tarea ahora; si el nuevo responsable
  no la había planificado, la verá en «sin planificar» en su propio
  Planificador. Es coherente con que el plan es personal y no un campo de la
  tarea.
- **La carga por defecto (8 h) puede estar mal** para quien no trabaja jornada
  completa o reparte su tiempo entre proyectos fuera de Riuna. Declarado, no
  resuelto: la pantalla de ajustes que lo cambiaría no existe todavía.
- **Actualización 2026-09-23.** La revisión de código de este bloque encontró
  que la frontera de "hoy" no se aplicaba de forma consistente: la rejilla de
  15 días del Planificador se construía con el reloj del navegador y
  `PUT /planner/:taskId` interpretaba un `yyyy-mm-dd` en UTC en vez de en la
  zona del servidor. `serverDayKey`/`parseServerDay`
  (`utils/day-boundaries.ts`) son ahora el único punto de entrada y salida
  para un día, y la API publica su propio `serverToday` para que el cliente
  deje de calcularlo. La decisión de fondo —qué zona horaria define un día—
  sigue sin resolverse.
