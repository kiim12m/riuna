# ADR 032 — Objetivos: el progreso se mide al leer

**Fecha:** 2026-09-08 · **Estado:** aceptada

**Contexto.** La Fase 7 pide «objetivos con progreso automático» y su criterio de
aceptación es «un OKR trimestral que **avanza al cerrar tareas**». La tentación
obvia es guardar el progreso en una columna y mantenerlo con un disparador o un
recalculo programado — que es exactamente el segundo mecanismo para lo mismo que
la ADR 025 rechazó para el burndown, y la desnormalización de contadores que la
ADR 011 rechazó para el árbol.

**Decisión.** `goal` (periodo) y `goal_target` (resultado clave). Un resultado
clave es **la consulta de un widget más un valor diana**: su `config` tiene la
misma forma que el de un widget menos la agrupación, y el progreso lo calcula el
mismo `aggregate()` en la lectura. No se guarda ninguna cifra derivada.

**Consecuencias.**

- **«Avanza al cerrar tareas» sale gratis.** Cerrar una tarea mueve
  `completed_at` —lo mantiene el disparador de la ADR 025— y la siguiente lectura
  ya cuenta distinto. Ni disparador nuevo, ni tarea programada, ni columna que se
  pueda quedar obsoleta.
- **El periodo es la medida, no una etiqueta.** `starts_at`/`ends_at` se le pasan
  al agregado como ventana de cierre. Para ello `from`/`to` dejan de aplicarse
  solo cuando se agrupa por tiempo: son una ventana de **cierre**, agrupe o no.
  Sin eso, «cerrar 40 este trimestre» contaría las de siempre.
- **`sumLogged` no es una métrica de objetivo.** Mide sobre `time_entry
  .start_time` y no sobre el cierre de la tarea, así que el periodo significaría
  otra cosa que en el resto. Entrará con su propia ventana y dicho aquí, no de
  tapadillo.
- **`count` y `doneRatio` tampoco** (añadido el 2026-09-19). Sobre una ventana de
  cierre solo quedan tareas cerradas, así que las dos medían lo mismo que
  `doneCount`, y `doneRatio` enseñaba un recuento en vez de una proporción. Un
  resultado clave es `doneCount` o `sumEstimate`; la migración 0059 pasa los que
  había a `doneCount`, que es la cifra que ya mostraban. «Qué parte del trabajo
  del trimestre está hecha» pide otra ventana —las tareas abiertas en algún
  momento del periodo— y entraría como métrica propia.
- **El último día del periodo cuenta.** `ends_at` llega como día sin hora; el
  agregado recibe el día siguiente como fin exclusivo.
- **Un resultado que no se puede medir lleva su error y no tumba el objetivo**,
  igual que un widget roto no tumba el panel. Es el mismo fallo que `get-tasks.ts`
  documenta: archivar una definición de campo no puede dejar una pantalla en
  blanco.
- **Propiedad, no permiso nuevo.** Como paneles y vistas: añadir un recurso
  `goal` a `@riuna/permissions` daría 403 a todo espacio con roles
  personalizados. Compartir un OKR con el equipo —que es lo que un OKR acaba
  pidiendo— llega con el `is_shared` de la rebanada 2, a la vez para paneles y
  objetivos: una columna y un gate, no un modelo distinto. **Hasta entonces un
  OKR solo lo ve quien lo crea, que es la limitación más visible de esta
  rebanada.**
- **El avance del objetivo es la media de sus resultados.** Ponderarlos pide un
  peso por resultado que nadie ha pedido; cuando haga falta es una columna.
- **Objetivos tiene pantalla propia y no se funde con el panel.** Es una
  superficie de gestión —crear, fijar periodos, editar dianas—, no una respuesta
  a «qué me toca hoy», que es lo que la [ADR 031](031-panel-personal-unificado.md)
  unificó. Un widget de objetivo en el panel es pulido de la rebanada 2: exige
  tocar el `CHECK` de tipos de widget, y la 0057 ya está aplicada.
