# ADR 065 — Tablero, Lista y Backlog filtran en el servidor

**Fecha:** 2026-10-04 · **Estado:** aceptada

**Contexto.** La Tabla, el Calendario y el Gantt piden las tareas con un filtro que
resuelve el motor del servidor (ADR 014). Tablero, Lista y Backlog seguían recortando
en el navegador, cada uno a su manera: el Backlog con otra definición de «esta semana»
(domingo fijo, sin la preferencia de la persona) y leyendo las etiquetas de una caché
por tarea que casi siempre estaba vacía, de modo que su filtro de etiquetas no traía
nada. Era el último punto que le faltaba al criterio de aceptación de la Fase 4.

**Decisión.**

- **Un solo constructor** (`lib/task-view-filter.ts`): los menús (estado, prioridad,
  asignado, equipo, épica, etiqueta, vencimiento) y el buscador se traducen a un árbol
  `FilterNode` y es el servidor quien lo evalúa. Las tres vistas piden
  `useGetTasks(projectId, filter)`; ya no queda filtrado en memoria.
- **Las fechas relativas se calculan en el navegador**, con el primer día de la semana de
  la persona, y viajan como días sueltos (que el servidor lee como el día entero de
  Madrid, ADR 014). El Backlog adopta así la misma semana que el Tablero.
- **El buscador espera 250 ms** tras la última tecla antes de preguntar, y mientras llega
  la respuesta se conserva la anterior (`placeholderData`, solo del mismo proyecto) para
  que el tablero no parpadee a esqueleto.
- **El filtro de menús sigue acordándose por proyecto en el navegador**, y ahora se lee
  al crear el estado: con un efecto de lectura y otro de escritura en el mismo montaje, el
  segundo borraba lo guardado antes de que el primero lo aplicara.

**Consecuencias.**

- **Un número en el buscador casa con el número exacto**, no con cualquiera que lo
  contenga: `2` ya no trae la 12 ni la 20. `#2` y `PROY-2` (de este proyecto) siguen
  funcionando. Es la única regresión de comportamiento y es deliberada: el motor compara
  números, no cadenas.
- **Las etiquetas se filtran por nombre**, que es lo que ya hacían en la práctica; deja de
  distinguirse el color entre dos etiquetas con el mismo nombre. Si todas las elegidas han
  desaparecido, el filtro no trae nada (no todo).
- **«Mover todo» del Backlog mueve lo que el Backlog muestra.** Antes movía también las
  planificadas que el filtro ocultaba, que es sorprendente en una acción masiva.
- El almacén del proyecto (`useProjectStore`) guarda ahora la respuesta *filtrada*; cada
  vista pinta el esqueleto hasta que llega la de su propia consulta, para no enseñar la
  de otro filtro. `ProjectSizeWarning` cuenta lo que viaja, que es lo que pesa.
- Medido sobre un proyecto de 10.000 tareas: título o descripción o número, más prioridad,
  13 ms. Los filtros de etiqueta y fecha ya los usaba la Tabla.
