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
  «sin hueco hoy» — no se arrastra a mañana por su cuenta. Moverla de día si
  sigue siendo una acción explícita, ahora también desde el propio
  Cronograma (arrastrar entre columnas, ver más abajo), no solo desde el
  Planificador.
- **El horario 08:00–18:00 puede no ajustarse a quien no trabaja jornada
  partida estándar.** Igual que la carga de 8 h del Planificador: declarado,
  sin pantalla de ajustes todavía.
- **`schedule_block` es la tercera tabla del interludio con forma
  `cadence` opcional** (junto a `task_recurrence` y, ahora, los bloques
  fijos repetidos): reutiliza el mismo tipo en vez de inventar una cuarta
  forma de decir «cada lunes».
**Estado actual (revisado 2026-09-24).** Lo de arriba fue la decisión
original; desde entonces el Cronograma creció de la ventana fija de 7 días a
un calendario de verdad, acercándolo a Schedule de super-productivity
(`schedule.component.html`, `schedule-month.component.html`,
`create-task-placeholder.component.ts`, mismo MIT en `NOTICE`) y ganando la
edición de bloques que antes solo existía a medias. Por concepto, no por
fecha de cada cambio -el detalle día a día queda en el historial de git-:

- **Vistas y navegación.** Día/Semana/Mes (`schedule-range.ts`), con la
  vista y el día ancla en la URL. La rejilla son **24 h fijas**, siempre
  visible aunque el día esté vacío -se retiró el estado vacío "Nada que
  mostrar"-, desplazada a la jornada laboral (u "ahora" si el día es hoy) al
  entrar. El reencuadre depende solo de qué días hay a la vista, no de la
  identidad del objeto `days` -que cambia en cada refresco tras mutar-, para
  no saltar a "ahora" cada vez que se mueve o redimensiona una tarea.
- **Crear desde un hueco.** `CreateTaskPlaceholder` (portado de
  `create-task-placeholder.component.ts`): en reposo, un mensaje de "pulsa
  aquí para crear una tarea"; en edición, un campo que crea una tarea nueva
  (30 min por defecto, como `timeEstimate` allí) o planifica una ya
  existente sin planificar, con Ctrl+1 para alternar "a esta hora"/"para el
  día" (`isForDayMode` allí). Puntero-only como el original, con
  `role="button"` + Enter/Espacio en el fondo de cada columna para quien
  navega por teclado. Silenciado mientras cualquier tramo de cualquier
  columna se mueve o redimensiona (`isSegmentInteracting`, en `TimeGrid`,
  no en cada columna): si viviera por columna, la columna de destino de un
  arrastre entre días seguiría ofreciendo crear una tarea encima de donde
  se apunta.
- **Tareas sin estimar.** Ocupan 30 min (`UNESTIMATED_ENTRY_SECONDS`), no el
  mínimo de 10 -a 10 min el tramo no se lee-, reservados de verdad en el
  reparto (`layoutDay`), no solo pintados más grandes; borde punteado y
  color apagado las distingue (`segment-card.tsx`).
- **Mover y redimensionar.** Arrastrar un tramo verticalmente ancla o libera
  `start_minute`, con matemática de puntero continua
  (`gantt-task-bar.tsx`, `schedule-timeline.ts`). Redimensionar un borde
  cambia **la estimación de la tarea** (`PUT /task/estimate/:id`), no una
  columna propia del Cronograma -es la única fuente de duración que existe,
  compartida con el equipo, el mismo campo que se ve en el detalle y suma
  en Objetivos y Paneles-: el borde inferior solo cambia la duración, el
  superior mueve el inicio y también ancla la tarea a la nueva hora. Las
  asas de redimensionar se limitan al bloqueador fijo vecino más cercano
  -no al día entero-, y solo se ofrecen en la primera/última parte de una
  tarea partida (partir un tramo intermedio no dejaría dónde alargarlo). El
  mínimo de duración y la base sin estimar los manda la API en la propia
  respuesta (`minEntrySeconds`, `unestimatedEntrySeconds`) en vez de vivir
  copiados a mano en la web.
- **Mover de día (vista Semana).** Arrastrar un tramo a la columna de otro
  día lo replanifica ahí: `dayKeyAtPoint` (`segment-card.tsx`) lee, con
  `document.elementFromPoint`, el `data-day-key` que `time-grid.tsx` pone en
  el contenedor de cada rejilla, y pasa por `PUT /planner/:taskId` (cambia
  `plannedDate` **y** `startMinute` en una sola llamada), no por
  `setEntryTime`. Mientras se arrastra, la columna de destino dibuja una
  sombra (`drag-ghost.tsx`) con el título y la franja horaria de destino -el
  tramo de origen se queda quieto en su sitio, solo atenuado, en vez de
  seguir al puntero-; al soltar, `moveEntryDay` escribe la caché de todas
  las vistas de Cronograma en `onMutate` (antes de que la petición salga),
  para que la tarea no "desaparezca" hasta el refetch. Sin `position`
  explícita -este gesto solo sabe de hora y día-, `setPlanEntry` conserva la
  posición si el día no cambia, o la manda al final del día de destino si
  cambia, en vez de reiniciarla siempre a 0.
- **Bloques (`schedule_block`).** Citas fijas o descansos, sueltos o
  repetidos por `cadence` (mismo tipo que `task_recurrence`, reutilizando
  `parseCadence`/`nextOccurrence`/`firstOnOrAfter`), con el cronómetro en
  marcha proyectado de solo lectura desde `time_entry`. Un clic sobre un
  bloque real (no el cronómetro; cada entrada de un tramo fusionado -dos
  bloques que se solapan- es su propio botón, editable por separado) abre
  el mismo diálogo de crear, ya relleno, con un botón de eliminar. Nunca
  cambia si es suelto o repetido -eso sigue siendo borrar y crear de
  nuevo-, pero dentro de cada forma sí se puede mover: uno suelto cambia de
  día (`plannedDate` en el PATCH, editable también al crear, no solo fijado
  al día donde se pulsó "+"); uno repetido pone o quita una fecha límite
  (`endsAt`, misma columna y patrón que `task_recurrence.ends_at` -parseada
  como día del servidor, `parseServerDay`, igual que `plannedDate`, no como
  instante UTC-, que `get-schedule.ts` usa para recortar la proyección
  igual que `computeGhosts` recorta los fantasmas). `update-block.ts` valida
  la forma contra la fila real antes de escribir, nunca contra lo que mande
  quien llama, para devolver 400 en vez de que reviente la CHECK de la
  tabla con un 500 crudo -y sigue comprobando el resultado de su propio
  `UPDATE`, no solo el `SELECT` previo, porque un `DELETE` concurrente entre
  los dos dejaría un 200 con cuerpo vacío-. `get-schedule.ts` decora cada
  entrada de un tramo `block` con la fila completa (`entries[].block`), no
  solo `{id, title, kind}`: el diálogo de edición necesita el horario y la
  forma propios del bloque, que el tramo fusionado y recortado a la ventana
  no lleva.
- **El servidor manda, el cliente no recalcula.** `serverToday`,
  `workStartMinute`/`workEndMinute`, `minEntrySeconds` y
  `unestimatedEntrySeconds` viajan en la respuesta de `GET /schedule` -mismo
  patrón que `get-plan.ts` ya usaba para "hoy"-, así que "qué día es hoy" y
  los mínimos de duración solo se calculan y declaran en un sitio.
  `getSchedule` (`apps/api/src/schedule/controllers/get-schedule.ts`) delega
  la proyección de bloques repetidos y el reparto de un día a funciones
  puras en `build-day.ts`, separadas de las consultas.

Verificado con pruebas unitarias (API y web), de integración
(`schedule.test.ts`, `planner.test.ts`) y e2e (`schedule.spec.ts`: anclar
arrastrando, crear desde un hueco, redimensionar, mover de día entre
columnas) en cada cambio, más pasadas de navegador real para lo puramente
visual.
