# ADR 056 — Modo foco sobre entradas de tiempo reales

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

**Consecuencias.**

- **El parte de horas y las cifras siguen siendo una sola verdad**: el foco
  no inventa tiempo. Las sesiones aparecen como entradas normales con su
  modo.
- **Sin una pestaña abierta, el bloque no se para solo a su hora.** El
  cronómetro sigue en el servidor hasta que se vuelve. Es el mismo límite de
  los avisos del navegador.
- **Verificado:**
  - 9 pruebas unitarias de la máquina;
  - 4 de integración: el modo guardado y contado, la idempotencia, el CHECK y
    el resumen del cierre;
  - 1 de extremo a extremo de un pomodoro: trabajo, descanso sin registrar,
    siguiente bloque y fin cuando el cronómetro se para desde fuera.
