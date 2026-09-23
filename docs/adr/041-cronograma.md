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
- **Actualización 2026-09-23 (segunda).** La ventana fija de 7 días desde
  hoy, sin navegación ni vista de mes, no dejaba planificar *desde* el
  Cronograma — pedido explícito de acercarlo a Schedule de super-productivity
  (`schedule.component.html`, `schedule-month.component.html`,
  `create-task-placeholder.component.ts`, mismo MIT ya en `NOTICE`). Cambios:
  - `GET /schedule` gana `from` (opcional, `yyyy-mm-dd` por `parseServerDay`;
    por defecto el día del servidor) y devuelve `serverToday`; la ventana
    máxima sube de 30 a **42 días** (seis semanas, una rejilla de mes
    completa). La consulta de `personal_plan_entry` ganó el filtro por
    `workspaceId` que ya tenían los bloques — sin él, una entrada planeada
    desde otro espacio de la misma persona se colaba.
  - `PUT /planner/:taskId` acepta `startMinute` opcional: crear una tarea
    desde una celda de la rejilla planea el día **y** ancla la hora en una
    sola llamada, en vez de encadenar `PUT /planner` + `PUT
    /schedule/entries`. Ausente, no se toca — mover una tarea de día en el
    Planificador ya no desancla una hora puesta desde el Cronograma.
  - La web gana tres vistas (Día/Semana/Mes, `schedule-range.ts`, rango en la
    URL) sobre una rejilla de **24 h fijas**, siempre visible aunque el día
    esté vacío — se retira el estado vacío «Nada que mostrar». La rejilla se
    desplaza a la jornada laboral (u «ahora» en hoy) al entrar, no empieza
    siempre a medianoche.
  - `CreateTaskPlaceholder` porta la caja discontinua de
    `create-task-placeholder.component.ts`: en reposo, un mensaje de "pulsa
    aquí para crear una tarea" con la hora encima; en edición, un campo que
    crea una tarea nueva (30 min, como `timeEstimate` allí) o planifica una
    ya existente sin planificar, con el mismo alternador Ctrl+1 entre "a esta
    hora" y "para el día" (`isForDayMode` allí). Es puntero-only, como el
    original — el fondo de cada columna expone además `role="button"` con
    Enter/Espacio para quien navega por teclado, algo que el original no
    ofrece.
- **Actualización 2026-09-23 (tercera).** Tres ajustes tras una pasada visual
  sobre lo anterior:
  - **Bug de posición en la pestaña de hora**: `bottom-full` ya deja su borde
    inferior en el borde superior del quadre; sumarle `-translate-y-full`
    desplazaba dos veces y la separaba, flotante, del resto. Corregido a un
    solo desplazamiento (`translate-y-px`, para solapar los dos bordes
    discontinuos de 2 px en vez de dejar una línea doble).
  - **Una tarea sin estimar ocupa media hora, no el mínimo de diez.**
    `UNESTIMATED_ENTRY_SECONDS` (`apps/api/src/schedule/constants.ts`) sustituye
    a `MIN_ENTRY_DURATION_SECONDS` como base del tramo cuando `estimate` es
    `null` o 0 — a 10 min el tramo mide 14 px y no se lee, y el hueco de 30 min
    ya se reserva en el reparto (`layoutDay`), no solo se pinta más grande. La
    web distingue estos tramos con borde punteado y color apagado
    (`segment-card.tsx`); las tareas con estimación se ven igual que antes.
  - **Redimensionar arrastrando un borde.** Dos asas de 6 px, puntero-only
    como el resto del arrastre del Cronograma (sin equivalente de teclado,
    igual que mover el tramo). Matemática pura nueva,
    `resizeSegment` (`schedule-timeline.ts`): el borde inferior solo cambia la
    duración; la superior mueve el inicio y mantiene fijo el final. El delta
    arrastrado se suma **a la estimación de la tarea**
    (`PUT /task/estimate/:id`, ya existía), nunca a la duración del tramo
    mostrado — un tramo partido alrededor de un bloque fijo no es la tarea
    entera, y sustituir por la duración visible la habría recortado sin
    querer. Arrastrar el borde superior también ancla la tarea a la nueva hora
    (`PUT /planner/:taskId`, `startMinute`), como ya hacía arrastrar el
    cuerpo del tramo.
  - **Consecuencia declarada:** la estimación es un campo de la tarea,
    compartido con el equipo — el mismo que se ve en el detalle y que suma en
    Objetivos y Paneles. Redimensionar en el Cronograma la cambia para todos,
    igual que en super-productivity, donde `timeEstimate` tampoco es privado
    de la vista Schedule.
- **Actualización 2026-09-23 (cuarta).** Tres correcciones de una pasada real
  en navegador, mas una funcionalidad nueva:
  - **La vista saltaba a "ahora" al mutar, no solo al navegar.** El
    reencuadre inicial (`TimeGrid`) dependía de `days`, y `days` cambia de
    identidad en cada refresco de la consulta — mover, redimensionar o
    anclar una tarea disparaba el mismo salto que entrar por primera vez.
    Corregido con `rangeKey` (los `dayDate` visibles, unidos), que solo
    cambia al navegar de dia/semana/mes.
  - **La casilla de crear tarea aparecia encima del tramo que se estaba
    arrastrando o redimensionando.** El fondo de la columna (que escucha el
    puntero para el hueco de crear) no sabia que un tramo estaba en pleno
    gesto; el puntero pasaba por encima suyo en cuanto el arrastre salia del
    area del propio tramo. `ScheduleSegmentCard` avisa ahora a la columna con
    `onInteractionChange` al empezar y al soltar, y la columna calla el hueco
    (y lo borra si ya estaba mostrado) mientras dure.
  - **El punteado de una tarea sin estimar no se distinguia de un borde
    continuo.** A 1 px, un borde punteado y uno solido se ven casi iguales.
    Subido a `border-2` solo para el caso sin estimar.
  - **Mover una tarea a otro dia arrastrandola a otra columna** (vista
    Semana): `dayKeyAtPoint` (`segment-card.tsx`) lee el `data-day-key` que
    `time-grid.tsx` pone en el contenedor de cada rejilla via
    `document.elementFromPoint` en el punto donde se suelta -la coordenada
    vertical se calcula igual sea cual sea la columna, asi que solo hace
    falta averiguar de quien es el punto de soltar-. Pasa por
    `PUT /planner/:taskId` (cambia `plannedDate` **y** `startMinute` en una
    sola llamada), no por `setEntryTime`, que no toca el dia. Nueva mutacion
    `moveEntryDay`; insignia flotante con el dia y la hora de destino
    mientras se arrastra, y el tramo se atenua para señalar que se va de la
    columna. Verificado con un test e2e que arrastra entre columnas y
    comprueba que la tarea desaparece del dia de origen y aparece en el de
    destino a la hora esperada.
- **Actualización 2026-09-23 (quinta).** El movimiento entre dias de la
  actualización anterior funcionaba pero confundía: no se veía que el tramo
  quedaba "agarrado", el destino seguía ofreciendo crear una tarea encima del
  hueco al que se apuntaba, y al soltar la tarea desaparecía hasta que
  llegaba el refetch. Tres cambios, sin tocar la API:
  - **Sombra en la columna de destino** (`drag-ghost.tsx`, nuevo): mientras
    se arrastra sobre otra columna, esa columna dibuja un recuadro punteado
    con el título y la franja horaria donde caería la tarea — como el
    "fantasma" de Google Calendar o super-productivity. Sustituye a la
    insignia flotante que llevaba el tramo (`crossDayKey`, en
    `segment-card.tsx`): ahora la marca vive en la columna correcta, no
    pegada al origen.
  - **El estado de "se está arrastrando" y de "estoy silenciando el hueco de
    crear" suben de `TimeGridColumn` a `TimeGrid`.** Antes cada columna sólo
    sabía de sus propios gestos: la columna de origen callaba su hueco de
    crear mientras el tramo se movía, pero la de destino — la que de verdad
    importa, porque es donde el puntero está — seguía ofreciéndolo encima.
    `ScheduleSegmentCard` gana `onCrossDayDrag(target | null)`, que informa a
    la rejilla de a qué día y minuto caería el tramo en cada `pointermove`;
    de ahí sale tanto la sombra como el `isSegmentInteracting` compartido.
  - **Sin salto al soltar.** `moveEntryDay` (`use-schedule-mutations.ts`)
    pasa a escribir la cache de **todas** las consultas `["schedule",
    workspaceId, …]` en `onMutate`, antes de que la petición salga — retira
    el tramo de su día de origen y lo inserta, ya anclado, en el destino, en
    todas las vistas de Cronograma que haya en cache (Día/Semana/Mes pueden
    convivir). Mismo patrón que `usePlannerMutations.moveTask`, y por el
    mismo motivo: el tramo deja de dibujarse en cuanto se suelta el puntero
    (ya no queda estado de arrastre local que lo sostenga), así que sin
    escribir la cache antes se vería un frame con la tarea "desaparecida".
    `onError` restaura la instantánea previa de cada consulta tocada;
    `onSettled` invalida como ya hacía, para traer el reparto real (posición
    entre las que fluyen, `conflict`, etc.).
  - Verificado ampliando el mismo test e2e: con el puntero aún sobre la
    columna de destino, comprueba que la sombra es visible y que no hay
    ninguna casilla de crear tarea en pantalla; tras soltar, que el tramo ya
    está en la columna de destino sin esperar a la llamada a la API.
  - **El propio tramo de origen ya no sigue verticalmente al puntero
    mientras se va a otro día** -solo la sombra de destino se mueve-: seguir
    con `dragMinute` también aquí lo hacía subir y bajar en su columna, que
    es justo lo contrario de "se queda quieto, se va la sombra".
- **Actualización 2026-09-23 (sexta).** Los bloques (`schedule_block`) se
  podían crear pero no editar ni borrar desde el Cronograma — la API y las
  mutaciones ya existían (`updateBlock`/`deleteBlock`), sin conectar a
  ningún sitio. Ahora un clic sobre un bloque de verdad (no el cronómetro en
  marcha, que no tiene fila; no uno fusionado con otro que se solapaba, caso
  raro sin un único `id` al que abrir el diálogo) abre `CreateBlockDialog`
  ya relleno, con un botón de eliminar (confirmación con `AlertDialog`,
  mismo patrón que borrar una tarea). Nunca cambia si es suelto o repetido
  -eso sigue siendo borrar y crear de nuevo, `update-block.ts` ya lo decía-,
  pero dentro de cada forma ahora sí se puede mover:
  - **Un bloque suelto puede cambiar de día** (`plannedDate` en el PATCH).
  - **Uno repetido puede ponerse o quitarse una fecha límite** (`endsAt`,
    nueva columna nullable, mismo nombre y patrón que
    `task_recurrence.ends_at`: `get-schedule.ts` recorta la proyección igual
    que `computeGhosts` recorta los fantasmas). Los días de la semana que
    repite no se pueden tocar desde el diálogo de edición -se ven de fondo,
    sin poder pulsarlos-, solo desde crear uno nuevo.
  - `update-block.ts` valida contra la fila real antes de escribir -no
    contra lo que mande quien llama-: mover el día de uno repetido, o poner
    `endsAt` a uno suelto, es 400, no la CHECK `schedule_block_date_xor_cadence`/
    `schedule_block_ends_at_only_repeating` reventando en un 500 crudo.
  - `get-schedule.ts` decora cada `entry` de un tramo `block` con la fila
    completa (`entries[].block`), no solo `{id, title, kind}`: el diálogo de
    edición necesita el horario y la forma (suelto/repetido) propios del
    bloque, que el tramo fusionado y recortado a la ventana no lleva.
  - Verificado con pruebas de integración nuevas (proyección cortada por
    `endsAt`, mover un bloque suelto de día, rechazo cruzado de `plannedDate`
    en uno repetido y `endsAt` en uno suelto, poner y quitar el límite,
    forma decorada de `entries[].block`) y typecheck/Biome en los archivos
    tocados.
- **Actualización 2026-09-23 (séptima).** Dos fallos de la anterior, ambos
  en `time-grid.tsx`/`create-block-dialog.tsx`, sin tocar la API:
  - **Dos bloques solapados quedaban sin poder tocarlos.** `mergeBlockers`
    (`layout.ts`) funde en un mismo tramo visual los bloques que coinciden en
    hora, y el clic para editar solo estaba cableado cuando `entries.length
    === 1` -a propósito, para no complicar el diseño con un caso que se
    creía raro-. En la práctica, poner un bloque encima de otro es fácil de
    hacer sin querer, y el resultado era un recuadro fusionado, atascado, sin
    ninguna manera de editar ninguno de los dos. Corregido: cada `entry` es
    ahora su propio `<button>` dentro del recuadro -ya no un único
    `<span>` con `.join(" / ")`-, así que cada bloque solapado se edita por
    su cuenta, sea cual sea el número de bloques fundidos.
  - **El día no se podía tocar al crear un bloque.** El campo "Día" del
    diálogo llevaba `disabled={!editingBlock}` a propósito -mantenía el
    comportamiento anterior a poder editar nada, donde el día era implícito
    y era el que se había pulsado con "+"-, pero volverlo visible-pero-fijo
    fue peor que dejarlo invisible: parece un campo roto. Ahora es editable
    también al crear, con el día pulsado como valor por defecto.
  - Verificado en navegador real: dos bloques que se solapan se editan y
    borran cada uno por separado sin afectar al otro; crear un bloque con un
    día distinto al que se pulsó "+" lo deja en el día elegido, no en el
    original.
