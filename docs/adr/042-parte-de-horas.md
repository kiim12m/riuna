# ADR 042 — Parte de horas vive fuera de `time-entry/`

**Fecha:** 2026-09-22 · **Estado:** aceptada

**Contexto.** El bloque 9 del interludio pide el registro de tiempo propio,
cruzando proyectos: agrupado por día, tarea o proyecto, y exportable.
`time_entry` hoy solo se lee **por tarea** (`apps/api/src/time-entry/`,
`GET /task/:taskId`); no hay lectura por usuario ni por rango de fechas, y
no la necesita para lo que ya hace — registrar y editar una entrada dentro
de una tarea concreta.

**Decisión.**

- **Módulo nuevo `apps/api/src/time-sheet/`**, plano, sin depender de
  ningún otro bloque del interludio. Mismo motivo que `my-work/` frente a
  `task/` (ADR de la Fase 4.5) y que `planner/`/`schedule/` frente a
  `personal-plan/`: una lectura transversal no es un método más del recurso
  que agrega, es una pregunta de forma distinta —"todo lo mío en un
  rango"— y mezclarla dentro de `time-entry/` ataría su ciclo de vida al de
  las rutas por tarea que no tienen nada que ver.
- **Una sola consulta, agregada en servidor** por `día` / `tarea` /
  `proyecto` (parámetro `groupBy`), sobre `time_entry` filtrado por
  `userId` propio y `project.workspace_id`. Una entrada en marcha
  (`end_time` nulo) cuenta con su duración transcurrida hasta ahora, no se
  descarta del total: un parte que omite lo que se está cronometrando en
  este momento parecería tener un hueco.
- **La exportación reutiliza `buildExchangeWorkbookOf`**
  (`apps/api/src/task/exchange/build-file.ts`), ya generalizado a varias
  hojas por `export-dashboard.ts`. Tercer consumidor fuera de `task/`:
  precedente sólido. Exporta exactamente los grupos que pinta la pantalla
  —la misma consulta, no una reimplementación—, siguiendo el criterio ya
  sentado ahí de "se exporta lo que se está mirando".
- **Sin índice nuevo dedicado**: `time_entry_userId_idx` ya existe: se
  sustituye por un índice compuesto `(user_id, start_time)`, que sirve
  tanto el filtro por usuario que ya cubría como el rango de fechas nuevo,
  en vez de mantener los dos.

**Consecuencias.** Los proyectos archivados no se excluyen: es un informe
histórico, y archivar un proyecto no borra las horas que se le dedicaron.

**Actualización 2026-09-23.** El agrupado por día formateaba la clave con
`toISOString().slice(0, 10)` —UTC—, discrepando con el resto de superficies
que ya usan el día del servidor. Corregido con `serverDayKey`
(`utils/day-boundaries.ts`); `resolveWindow` también pasa a interpretar
`start`/`end` con `parseServerDay`, que cierra un desfase de un día latente
en servidores con offset negativo.
