# ADR 047 — Hoy compone el plan, lo urgente y los contadores de la barra lateral

**Fecha:** 2026-09-30 · **Estado:** aceptada

**Contexto.** El bloque 7 del interludio cierra `barra-lateral.html`: la
pantalla «Hoy» heredada de Kaneo listaba todo lo asignado agrupado por
ventana de vencimiento, sin leer el plan personal (ADR 040), sin cronómetro
(ADR 044) y sin estimación editable (ADR 046). La maqueta y super-productivity
coinciden en la forma: el plan del día primero, lo atrasado sin perderse,
lo urgente sin planificar al final, y lo hecho aparte.

**Decisión.**

- **`GET /today`**, módulo nuevo `today/`, compone sobre las mismas
  consultas que `planner/queries.ts` —`getPreviousEntries`,
  `getEntriesInRange`, `loggedSecondsByTask`— para que una tarea atrasada se
  vea igual en Hoy y en el Planificador. Devuelve:
  - `previous`: lo planificado antes de hoy y sin terminar —«De días
    anteriores»—, igual que en el Planificador.
  - `planned`: el plan de hoy, con `startMinute` y `loggedSeconds`.
  - `urgent`: vencido o vence hoy, sin planificar hoy ni antes; si está
    planificada para un día futuro sale igual, con su `plannedDate`, para
    poder decir «planificada el lun» en vez de esconderla.
  - `done`: terminadas hoy que estaban asignadas o planificadas para hoy por
    quien mira —una tarea de otro que nadie de por aquí planificó no cuenta
    como «lo que hice hoy»—, con `loggedSeconds` para la fila.
  - `totals`: `estimateRemaining` (lo que queda de `planned`, nunca de
    `urgent` sin planificar), `workedToday` (todas las tareas, vía
    `GET /time-sheet` reutilizado) y `capacitySeconds` (ADR 045).
  - La condición de `urgent` vive en `today/queries.ts`
    (`urgentTasksQuery`/`urgentTaskIds`) y no se repite: es la misma clase de
    fuga entre espacios de `personal_plan_entry` que las ADR 041 y 046 ya
    tuvieron que corregir dos veces.
- **`POST /task/complete/:id { done }`**, en `task/`: mueve la tarea a la
  primera columna final (o primera no final) de su proyecto, con respaldo al
  slug heredado `done` para una instalación sin ninguna columna marcada
  final (`my-work/decorate.ts`). Por dentro es `updateTaskStatus`: la
  cascada al árbol, el evento y la parada del cronómetro de la tarea
  (ADR 044) salen de ahí, no se repiten aquí. La usa la casilla de «hecha»
  de la fila de Hoy; la del Planificador sigue declarada fuera desde la
  ADR 046 —la ruta ya existe para cuando se retome—.
- **`GET /my-work/counts`**, en `my-work/`: los dos números de la barra
  lateral, `today` (`previous.length + planned.length + urgent.length`) y
  `myTasks` (asignadas y sin terminar en el espacio, con el mismo tope de
  500 y la misma valla `OFFSET 0` que `get-my-work.ts`). Solo cuenta —sin
  decorar filas con etiquetas, asignados ni proyecto— porque un contador que
  se pide en cada carga de página no puede pagar ese coste.
- **Invalidación**: `PLAN_INVALIDATED` y `TIMER_CHANGED` (canal de usuario)
  invalidan también `["today"]` y `["my-work","counts"]`, además de lo que
  ya invalidaban.
- **La fila de Hoy** (`components/today/today-task-row.tsx`) comparte
  `TimerButton` e `InlineEstimate` con el pie de la barra y el Planificador:
  casilla de hecha, cronómetro, hora si está anclada, título, proyecto y,
  a la derecha, lo que toque según la sección —estimación editable en
  «anteriores»/«plan de hoy», aviso «vence hoy»/«vencida» en lo urgente, o
  lo registrado en lo hecho—. «Plan de hoy» se reordena con `dnd-kit` +
  `PUT /planner/order` (ADR 046); «De días anteriores» y «vence hoy o
  vencida» ofrecen «Añadir a hoy» / «Planificar hoy», que son la misma
  llamada (`PUT /planner/:taskId` con la fecha de hoy).

**Por qué no las alternativas.** Repetir la condición de `urgent` en
`get-today.ts` y en `get-counts.ts` —dos consultas, misma forma— habría sido
la ruta corta, pero es exactamente el patrón que ya causó una fuga real dos
veces con esta tabla; de ahí `today/queries.ts` en vez de copiar el `WHERE`.

**Consecuencias.**

- Quedan fuera de este bloque, declarados: la casilla de «hecha» en la
  tarjeta del Planificador (`PlannerTaskCard`, pendiente desde la ADR 046 —
  `POST /task/complete/:id` ya está listo para ella—), el campo de añadir
  rápido (`quick-add`, pensado para compartirse con el Planificador, tampoco
  se construyó en la ADR 046), el diálogo «Terminar el día», «Añadir todo a
  hoy» en bloque (necesitaría `POST /planner/bulk`, no construido), el menú
  contextual de la tarjeta y los anuncios de `dnd-kit` en español. Ninguno
  estaba en la maqueta original como bloqueante; se añadirán si hace falta.
- **El humo de Playwright sí corre en este entorno sin Docker**, contra lo
  declarado en los bloques 5-7: `E2E_DATABASE_URL` apuntado al mismo
  PostgreSQL nativo que ya usan las pruebas de integración —una base propia,
  `riuna_e2e_test`— basta; `compose.local.yml` no hace falta para esto. De
  paso salió una regresión real de la ADR 045, sin relación con este bloque:
  `schedule.spec.ts` esperaba el ancla de flujo en torno a las 08:00, la
  constante de instancia que esa ADR sustituyó por las 09:00 por defecto.
  Corregida. Las 25 pruebas de `tests/e2e/` quedan en verde, incluidas las
  tres nuevas de Hoy (`today.spec.ts`, reescrito para la pantalla nueva).
