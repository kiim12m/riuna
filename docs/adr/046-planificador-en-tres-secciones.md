# ADR 046 — El Planificador reparte cada día en tres secciones, como super-productivity

**Fecha:** 2026-09-30 · **Estado:** aceptada

**Contexto.** El bloque 6 del interludio (ADR 040) entregó columnas discretas
sin distinguir lo que tiene hora de lo que no, sin lo planificado en días
pasados y sin lo que vence. Además, reordenar dentro de una columna estaba
roto: `handleDragEnd` mandaba el índice que la tarjeta ya tenía, no el que le
tocaba en el sitio donde se soltaba, así que dos tarjetas competían por la
misma posición. La maqueta (`barra-lateral.html`) y el planificador real de
super-productivity (`planner-day.component.html`) coinciden en la forma:
tres secciones por día.

**Decisión.**

- **`PUT /planner/order`**, nueva: reescribe la posición de un día entero, en
  el orden recibido, en vez de que cada tarjeta suelta intente adivinar su
  índice. Los ids que no sean de quien pide, ese día y ese espacio se
  ignoran en vez de fallar la llamada entera.
- **`GET /planner` gana tres piezas**, todas leídas al vuelo y no guardadas
  —misma filosofía que «sin planificar» en la ADR 040—:
  - `previous`: planificado antes de la ventana y aún sin terminar —«De días
    anteriores» de super-productivity—. Nada se mueve solo: hace falta
    arrastrar o (fase futura) «Añadir a hoy».
  - `deadlines`: lo que vence dentro de la ventana, esté planificado o no
    —en Riuna el vencimiento es un dato aparte del plan, ADR 040—, con su
    `plannedDate` si ya tiene una, para poder avisar «planificada el vie»
    cuando no coincide con el día del vencimiento.
  - `fixedBlocksByDay`: las citas fijas de cada día, para «Con hora» y para
    sumarlas a la carga.
  - Cada entrada lleva ahora `startMinute` y `loggedSeconds` (suma de
    `time_entry` cerradas de la tarea).
- **La carga del día es lo que queda, no el estimado bruto**: `estimate −
  loggedSeconds` (mínimo 0) de cada entrada, más la duración de los bloques
  fijos. Los fantasmas de recurrentes siguen fuera —la ADR 040 ya explicó
  por qué—.
- **Tres secciones en la web** (`components/planner/planner-day.tsx`): sin
  hora (se reordena con `dnd-kit` + `PUT /planner/order`; el Cronograma la
  coloca en el primer hueco libre en este mismo orden, así que no enseña
  hora prevista), con hora (alarma; tareas ancladas y bloques fijos
  mezclados y ordenados por minuto, sin reordenar —el orden lo da la hora—,
  oculta si está vacía) y vence este día (bandera, solo lectura, oculta si
  está vacía).
- **Anclar abre un popover con la hora** (`time-popover.tsx`), no un valor
  fijo silencioso: soltar en «Con hora» ancla primero a un valor por defecto
  —la hora de inicio de la jornada personal, ADR 045— y abre el popover para
  ajustarla; pulsar la hora de una tarjeta ya anclada abre el mismo popover,
  con «Quitar hora».
- **La estimación se edita en la propia tarjeta** (`InlineEstimate`,
  compartido con Hoy en la fase siguiente): un clic la convierte en un
  campo; Enter o `blur` guardan, Escape cancela. Guarda con el
  `PUT /task/estimate/:id` que ya existía —sin ruta nueva—, con
  `stopPropagation` en `click` y `pointerdown` para no abrir el detalle ni
  arrancar un arrastre de `dnd-kit`. Se edita la estimación **total**,
  prellenada con ella —desviación deliberada de super-productivity, que
  prellena lo que queda y lo guarda como total, comiéndose lo ya
  registrado—.
- **`parseDurationInput`** (`lib/duration.ts`) acepta `1h 30m`, `1h30`,
  `90m`, `1:30` y `1,5` (horas decimales); `task-tree.tsx` pasa a usarlo en
  vez de su parseo propio, de solo horas decimales, para que la estimación
  se escriba igual en todas partes.
- **Corrección de seguridad de paso**: `GET /planner` no filtraba
  `personal_plan_entry` por `workspace_id` —el mismo fallo que la ADR 041 ya
  había corregido en `get-schedule.ts`, sin aplicar aquí—. Una entrada
  planificada en un espacio se colaba en el Planificador de otro espacio del
  mismo usuario en una fecha compartida. Corregido con una prueba de
  regresión.

**Por qué no las alternativas.** Anclar sin abrir el popover —solo con el
valor por defecto— habría dejado la hora exacta a un segundo paso manual
distinto de arrastrar, que es justo lo que el popover evita. Editar «lo que
queda» en vez de la estimación total —el convenio de super-productivity—
significa que un registro parcial se pierde en cuanto se toca la
estimación; declarado como desviación consciente, no como fallo.

**Consecuencias.**

- `usePlannerMutations` ya no reconstruye con precisión `loggedSeconds` en
  su valor optimista —usa `0` o lo que hubiera antes— porque la tarjeta
  puede venir de tres listas de forma distinta (`entries`, `previous`,
  `unplanned`); `onSettled` lo corrige en cuanto vuelve la respuesta real.
- Quedan fuera de esta ADR, declarados: la casilla de «hecha» en la
  tarjeta, el menú contextual, cargar más días al llegar al final del
  desplazamiento, y el filtro de texto en «Sin planificar». Ninguno estaba
  en la maqueta original; se añadirán si hace falta.
