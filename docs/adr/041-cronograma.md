# ADR 041 — El Cronograma es una vista de `personal_plan_entry`, no un motor nuevo

**Fecha:** 2026-09-22 · **Estado:** aceptada

**Contexto.** El bloque 7 del interludio pide una línea de tiempo por horas:
qué hueco ocupa cada tarea planificada dentro del día, con eventos fijos
(visita de obra, comida) que no se mueven y una tarea en curso que sí. Es el
único bloque sin diseño previo, así que el primer paso fue leer el motor real
de esto en otra aplicación: `src/app/features/schedule/map-schedule-data/` de
super-productivity (`github.com/super-productivity/super-productivity`,
licencia MIT — el proyecto se trasladó de `johannesjo/super-productivity` a
una organización propia, mismo repositorio y licencia). Son ~1.900 líneas
puras sin importes de Angular, doce variantes de `SVEType`, una máquina de
particiones que arrastra una tarea partida a través de la medianoche, y un
algoritmo de solapes a N bandas — todo justificado allí porque el motor no
tiene ningún sitio donde ya conste "qué día piensa alguien hacer esto": lo
deriva de eventos de calendario importados y de un mapa día→tareas calculado
en cada render.

Riuna ya tiene ese sitio: `personal_plan_entry` (ADR 040). El Cronograma no
necesita reconstruir el motor entero, solo la parte que a Riuna le falta —
colocar esas entradas en una franja horaria y partirlas alrededor de lo que sí
tiene hora fija—. Se porta el álgebra de solapes y el barrido que parte un
bloque de trabajo cuando un bloque fijo cae dentro; se deja fuera el resto,
con la razón de cada corte anotada abajo.

**Decisión.**

- **Las entradas que fluyen siguen siendo `personal_plan_entry`.** Para un
  día, sus filas (ya ordenadas por `position`) se colocan de forma
  secuencial desde el inicio de la jornada — o desde «ahora» si el día es
  hoy, como hace `create-schedule-days.ts` —, cada una ocupando `estimate`
  segundos con un mínimo de 10 min para no crear bloques de anchura cero
  (mismo mínimo que `SCHEDULE_TASK_MIN_DURATION_IN_MS`). No hace falta tabla
  nueva para esto: es la misma fila que ya arrastra el Planificador,
  mostrada con otra proyección.
- **Columna nueva `start_minute` en `personal_plan_entry`** (`smallint`,
  0–1439, nullable). Nula: la entrada fluye, como hoy. Con valor: la entrada
  queda anclada a esa hora del día y actúa como un bloqueador frente a las
  demás — el equivalente de `TaskWithDueTime`/`ScheduledTask` en
  super-productivity, pero sin la tabla paralela que allí hace falta porque
  una tarea puede tener hora fija sin haber entrado nunca en el flujo. Aquí
  una fila del plan es la única forma de estar en el Cronograma, así que
  una columna aditiva resuelve lo mismo que allí exige un segundo modelo.
- **Tabla nueva `schedule_block`** para lo que no es una tarea: cita fija o
  bloqueo (visita de obra, comida). `id`, `workspace_id`, `user_id`, `title`,
  `kind` (`fixed` | `break`), `planned_date` (nullable), `cadence` (jsonb,
  nullable), `start_minute`, `end_minute`, timestamps. Un bloque suelto
  lleva `planned_date`; uno repetido lleva `cadence` y `planned_date` nula
  — misma forma que `task_recurrence`/`personal_plan_entry` conviviendo,
  nunca las dos a la vez (CHECK). El `cadence` reutiliza el tipo `Cadence` y
  `parseCadence`/`nextOccurrence`/`firstOnOrAfter` de
  `apps/api/src/recurrence/cadence.ts` tal cual — cierra la pregunta abierta
  «repeat reutiliza el mecanismo de fantasmas» sin escribir un proyector
  nuevo.
- **La tarea en curso se lee de `time_entry`, no se guarda.** Un
  `time_entry` con `userId` propio y `end_time IS NULL` se proyecta como un
  bloque fijo de solo lectura desde su `start_time` hasta «ahora», igual que
  super-productivity no persiste su equivalente tampoco.
- **Los fantasmas de recurrentes reutilizan `computeGhosts` tal cual**
  (`apps/api/src/planner/ghosts.ts`, ya construido para el Planificador) y
  se muestran como una lista de solo lectura junto al día, **no** insertados
  en la rejilla horaria. Evita el algoritmo de bandas a N solapes que
  `map-schedule-days-to-schedule-events.ts` necesita allí porque fantasma,
  evento de calendario y tarea con hora fija pueden solaparse los tres entre
  sí; en Riuna solo los bloques con hora real pueden solaparse (ver
  siguiente punto), así que una lista aparte basta.
- **Se porta el álgebra de solapes, reducida a dos tipos.**
  `mergeBlocksRecursively` + `isOverlappingBlock`
  (`create-sorted-blocker-blocks.ts`) fusiona bloques fijos que se solapan
  entre sí; el barrido de
  `insert-blocked-blocks-view-entries-for-schedule.ts` — una entrada que
  fluye se parte en «antes» y «después» cuando un bloque fijo cae dentro,
  desplazando lo siguiente — se porta con dos variantes en vez de doce (una
  entrada de plan, un bloque fijo), sin la familia
  `SplitTask/SplitTaskContinued/RepeatProjectionSplit*` que allí existe para
  que una tarea partida seguida siga partiéndose contra el siguiente bloque:
  aquí, si una entrada ya partida vuelve a topar con otro bloque, la
  segunda mitad se recorta sin generar un tercer fragmento — un caso raro
  (dos bloques fijos sobre la misma tarea el mismo día) que no merece la
  máquina de estados completa.
- **Sin acarreo entre días.** El mayor recorte: `create-schedule-days.ts`
  lleva `viewEntriesPushedToNextDay` de un día al siguiente para que una
  tarea que no cupo hoy aparezca mañana. El Cronograma no lo hace — una
  entrada que no cabe antes del fin de jornada pasa a «sin hueco hoy» (lista
  aparte, igual que `beyondBudgetTasks` allí), y ahí se queda: quien
  planifica ya decidió el día en el Planificador, y arrastrarla
  automáticamente a mañana cambiaría esa decisión por su cuenta —
  precisamente lo que la ADR 040 evita para `due_date`. Es la misma barra de
  sobrecarga que ya tiene el Planificador, vista por horas en vez de por
  segundos sumados.
- **Horario laboral fijo para esta iteración**: constante de instancia
  (08:00–18:00), no configurable por persona — mismo aplazamiento que la
  capacidad de 8 h del Planificador, declarado, no una pantalla de ajustes
  que este bloque no abre.
- **Matemática de rejilla nueva, no la del Gantt.** `gantt-timeline.ts` mide
  en píxeles por día; el Cronograma necesita minuto→fila dentro de un solo
  día. Módulo puro nuevo `schedule-timeline.ts` con el mismo patrón (función
  pura + `.test.ts` al lado), no una rejilla CSS con `grid-row`/`span` como
  super-productivity: sigue la convención ya establecida en este repo en vez
  de portar la de allí.
- **Arrastre con matemática de puntero continua**, como `gantt-task-bar.tsx`
  y como preveía el plan original de este bloque — aquí sí encaja, a
  diferencia del Planificador (ADR 040), porque la rejilla es un eje
  continuo de horas y no columnas discretas. Arrastrar verticalmente dentro
  de un día fija o libera `start_minute`; reordenar dentro de la bandeja de
  «sin hora fija» sigue tocando solo `position`.
- **`NOTICE` gana una entrada para super-productivity** (MIT) en el commit
  que introduce el módulo portado, junto al de Kaneo ya existente.

**Por qué no las alternativas.** Portar el motor completo (los doce
`SVEType`, el acarreo entre días, el algoritmo de bandas a N) habría
importado complejidad que existe allí por problemas que Riuna no tiene —
sincronizar con un calendario externo evento a evento, decidir "qué semana es
la actual" sin una tabla de plan, forzar una tarea partida a seguir
partiéndose indefinidamente—. Guardar `start_minute` en una tabla nueva en
vez de una columna aditiva habría reproducido la bifurcación
tarea-normal/tarea-con-hora que super-productivity necesita y Riuna no,
porque aquí ya existe un sitio único para "esta persona piensa hacer esto
este día". Generar los bloques repetidos como filas reales de
`schedule_block` en vez de proyectarlos con `cadence` habría repetido el
atajo que la ADR 026 ya rechazó para las tareas.

**Consecuencias.**

- **Una entrada partida dos veces en el mismo día se recorta, no se
  triplica.** Documentado arriba como límite aceptado, no como bug pendiente.
- **Nada se mueve solo de un día a otro.** Una entrada que no cabe se ve como
  «sin hueco hoy»; moverla de día sigue siendo una acción del Planificador,
  no algo que el Cronograma haga por su cuenta.
- **El horario 08:00–18:00 puede no ajustarse a quien no trabaja jornada
  partida estándar.** Igual que la carga de 8 h del Planificador: declarado,
  sin pantalla de ajustes todavía.
- **`schedule_block` es la tercera tabla del interludio con forma
  `cadence` opcional** (junto a `task_recurrence` y, ahora, los bloques
  fijos repetidos): reutiliza el mismo tipo en vez de inventar una cuarta
  forma de decir «cada lunes».
- **Actualización 2026-09-23.** `get-schedule.ts` calculaba `todayKey` y la
  clave de cada día con `toISOString().slice(0, 10)` —UTC— mientras
  `windowStart` salía de `setHours(0,0,0,0)` —hora local—; en un servidor con
  offset positivo, `isToday` señalaba el día equivocado casi toda la jornada,
  y con él el recorte «empieza en ahora» y el bloque del cronómetro en
  marcha. Corregido con `serverDayKey` (`utils/day-boundaries.ts`), la misma
  puerta que usa el Planificador (ADR 040).
