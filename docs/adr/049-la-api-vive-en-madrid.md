# ADR 049 — La API vive en Europe/Madrid; PostgreSQL, en UTC

**Fecha:** 2026-10-01 · **Estado:** aceptada

**Contexto.** «Hoy» es el día del proceso de la API (`utils/day-boundaries.ts`),
y ninguna imagen fijaba `TZ`: la API corría en UTC. Los navegadores de quienes
usan Riuna están en la península, y eso producía dos fallos.

- **Los vencimientos salían un día antes.** El selector de fecha manda su
  medianoche local en ISO, así que el 1 de octubre llega como
  `2026-09-30T22:00Z`. Con las fronteras de día en UTC, esa tarea **vencía hoy
  el 30 y salía vencida el día 1, que era cuando vencía**. Era así en Hoy, Mis
  tareas, los paneles y los contadores. Ninguna prueba lo veía, porque el
  proceso de prueba también estaba en UTC.
- **El cambio de zona tenía una trampa.** Los días del plan se guardan como
  la medianoche del servidor (`parseServerDay`) y tres sitios los comparan por
  igualdad exacta: reordenar un día, calcular la siguiente posición y «Hechas
  hoy». Con solo cambiar la zona, todo lo planificado antes del cambio dejaría
  de casar.

Todo el mundo está en la península (decisión del interludio de productividad),
así que basta una zona por instancia.

**Decisión.**

- **`ENV TZ=Europe/Madrid` en las dos imágenes de la API** (`Dockerfile.riuna` y
  `apps/api/Dockerfile`, con `tzdata`), en el script `dev` de la API y en las
  configuraciones de prueba: Vitest de API y web, y Playwright (proceso y
  navegador).
- **PostgreSQL se queda en UTC.** `now()` en los disparadores (`completed_at`)
  y los `DEFAULT now()` escriben la hora de pared de la sesión en columnas sin
  zona, y drizzle las lee como UTC. Por eso `TZ` **no** va en el `.env`, que
  `compose.yml` y `compose.local.yml` comparten con el contenedor de Postgres:
  una instalación nueva inicializaría la base en Madrid y `completed_at` saldría
  dos horas corrido. `.env.sample` lo advierte. Al arrancar, la API avisa si la
  base no está en UTC.
- **Un normalizador de arranque** (`utils/migrate-day-columns-to-local-midnight.ts`)
  lleva los días guardados con la medianoche UTC a la medianoche de la zona del
  proceso: `personal_plan_entry.planned_date`, `schedule_block.planned_date` y
  `schedule_block.ends_at`.
  - Solo toca filas a las 00:00 exactas.
  - Es idempotente, porque la medianoche de Madrid nunca cae a las 00:00Z.
  - Es seguro con dos réplicas: la segunda reevalúa el `WHERE` tras el bloqueo
    de fila.
  - Si falla, el arranque falla.

**Lo que encontró pasar las pruebas en Madrid.** Con la API en UTC, la hora
local del proceso y la UTC eran la misma, y eso escondía tres cosas.

- **node-postgres serializa un `Date` crudo en hora local.** Escribe
  `…T00:00:00+02:00`, y contra una columna `timestamp` sin zona PostgreSQL
  ignora el desfase. Los `Date` que viajan como parámetro de un `sql` —las
  fronteras de día de `due-window.ts`— se corrían dos horas. Por eso el `CASE`
  de la ventana de vencimiento contradecía a la condición tipada, que sí pasa
  por drizzle y viaja en UTC. Con `defaults.parseInputDatesAsUTC = true`
  (`database/index.ts`), la capa de base queda exactamente como cuando el
  proceso estaba en UTC.
- **Los días que se cortan dentro del SQL cortaban en UTC.** Les pasaba a la
  tendencia de los paneles, al reparto de la «semana en curso» y al burndown:
  lo cerrado a las 00:30 de Madrid caía en la víspera. `serverWallTime()`
  (`utils/day-boundaries.ts`) lleva una columna a la hora de pared de la zona
  del servidor antes de `date_trunc`.
- **El diálogo de editar un bloque leía el día con `iso.slice(0, 10)`.** Con
  los días ya convertidos, habría mostrado la víspera, y guardar habría movido
  el bloque. Ahora lee la hora local del navegador.

**Consecuencias.**

- **Se arregla el vencimiento corrido un día**, sin tocar `task.due_date`: la
  medianoche de Madrid pasa a ser exactamente el principio del día. Lo vigila
  una prueba de integración que falla con la API en UTC.
- **Otras fechas no se tocan**: `task.due_date`, ciclos, épicas, objetivos y
  recurrencias. Se comparan por rangos, y una medianoche UTC cae dentro del
  mismo día de Madrid, a las 02:00 o la 01:00.
- **Las filas del plan que el navegador escribió antes del 2026-09-23**, a las
  22:00 o 23:00Z, no se convierten: con la API en Madrid ya son la medianoche
  del día que se quiso decir.
- **Volver a UTC no es simétrico.** Exigiría la conversión inversa, y no se
  automatiza.
- **La zona por persona sigue siendo deuda**: alguien en Canarias vería el
  cambio de día una hora tarde.
- **Quedan dos cortes de fecha en el navegador que no dependen del
  servidor**: los rangos por defecto del parte de horas y de crear un ciclo, que
  se calculan con `toISOString().slice(0, 10)` y dan la víspera entre las 00:00
  y las 02:00. Son de antes, y se arreglan donde tocan: el del parte de horas,
  en el sub-bloque 0.3.
- **Ensayado** sobre una copia de la base de desarrollo, con 14 filas del plan
  de los dos tipos y 3 de bloques:
  - la primera vuelta convierte 13 días;
  - la segunda no encuentra ninguno;
  - las 14 filas del plan conservan su día.

  `docs/actualizar.md` explica cómo repetir el ensayo sobre una copia de
  producción antes de desplegar.
