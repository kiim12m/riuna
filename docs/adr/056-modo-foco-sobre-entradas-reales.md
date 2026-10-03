# ADR 056 — Modo foco y avisos de ritmo sobre entradas de tiempo reales

**Fecha:** 2026-10-02 · **Estado:** aceptada

**Contexto.** El usuario pidió el modo foco completo: Pomodoro, Flowtime,
cuenta atrás y avisos de ritmo. Super Productivity lleva el foco en el
cliente, con su propio reloj. En Riuna ya existe un cronómetro en el servidor
—uno por persona, ADR 044—, y un segundo reloj que registrara por su cuenta
daría dos verdades sobre el tiempo trabajado.

**Decisión.**

- **El trabajo de una sesión de foco es una entrada de tiempo real**, con un
  modo nuevo en `time_entry.focus_mode`: `pomodoro`, `flowtime` o
  `countdown`, con su CHECK. Es una columna y no un campo personalizado
  porque se filtra: `GET /today` cuenta las sesiones del día
  (`totals.focusSessions`) y el cierre del día las guarda en su resumen.
- **`POST /time-entry/start` acepta `focusMode`.** Con la misma tarea y el
  mismo modo no hace nada. Si cambia el modo, abre otra entrada: la sesión
  empieza ahí.
- **Los descansos no registran tiempo**: acabar un bloque para el cronómetro.
  Si el final se comprueba más de un minuto tarde —el portátil suspendido—,
  la entrada se cierra a la hora del final del bloque, no al comprobarlo
  (revisión de código del 2026-10-03).
- **Las fases son una máquina pura en el cliente** (`lib/focus/machine.ts`):
  - Pomodoro: 25 minutos de trabajo y 5 de descanso, con uno de 15 cada
    cuatro bloques;
  - Flowtime: se trabaja hasta que se decide, y el descanso es el 20 % de lo
    trabajado, entre 1 y 30 minutos;
  - cuenta atrás: un bloque de los minutos elegidos.

  Tras un descanso la sesión queda «lista»: el siguiente bloque no empieza
  solo, para no registrar tiempo de alguien que no ha vuelto. Una transición
  que se comprueba tarde se fecha cuando tocaba.
- **La sesión vive en un store persistido en el navegador** y se comparte
  entre pestañas con el evento `storage`. `useFocusRuntime`, en
  `WorkspaceRuntime`, hace las transiciones en una sola pestaña, con el
  cerrojo y las claves de la ADR 055, y avisa por la misma vía.
- **El cronómetro del servidor manda.** Si en pleno bloque deja de correr en
  esa tarea —se paró en otra pestaña, en el móvil o desde MCP—, la sesión de
  foco se acaba también.
- **Pantalla completa** en `focus/$taskId`, sin barra lateral. Fuera de ella,
  la fase y su reloj se ven en el pie de la barra lateral. Se entra desde el
  menú de fila (ADR 053).
- **Avisos de ritmo** (`lib/reminders/workday-nudges.ts`), reglas puras sobre
  la jornada personal (ADR 045), por la misma vía que los de la ADR 055:
  - descanso, tras 90 minutos seguidos registrando, y otra vez cada 90. Una
    cadena de entradas con huecos de menos de 5 minutos cuenta como seguida:
    cambiar de tarea no es descansar. Pomodoro y la cuenta atrás ya marcan
    sus descansos;
  - sin registrar: en la jornada, fuera de la comida y de los descansos del
    foco, tras 15 minutos sin cronómetro, como mucho uno por hora;
  - fuera de jornada: el cronómetro sigue pasada la hora de salida, en un
    día no laborable o desde otro día. Una vez al día.

  `GET /time-entry/running` da `workingSince` y `lastStoppedAt`, que cuentan
  todos los espacios porque es la misma persona trabajando. Cada aviso se
  activa aparte, por navegador, y están apagados de serie.

**Consecuencias.**

- **El parte de horas y las cifras siguen siendo una sola verdad**: el foco
  no inventa tiempo. Las sesiones aparecen como entradas normales con su
  modo.
- **Sin una pestaña abierta, el bloque no se para solo a su hora.** El
  cronómetro sigue en el servidor hasta que se vuelve. Es el mismo límite de
  los avisos del navegador, y los de ritmo tampoco suenan.
- **Las ausencias aún no existen** (Bloque 5). Hasta entonces, un día de
  ausencia que sea laborable avisa de que no se registra, si hay una pestaña
  abierta.
- **Verificado:**
  - 9 pruebas unitarias de la máquina;
  - 4 de integración: el modo guardado y contado, la idempotencia, el CHECK y
    el resumen del cierre;
  - 1 de extremo a extremo de un pomodoro: trabajo, descanso sin registrar,
    siguiente bloque y fin cuando el cronómetro se para desde fuera;
  - de los avisos de ritmo: 8 pruebas unitarias de las reglas, 4 de
    integración de `workingSince` y `lastStoppedAt`, y 1 de extremo a
    extremo, del ajuste al aviso.
