# ADR 039 — Mis tareas: vistas personales sobre el motor del espacio

**Fecha:** 2026-09-22 · **Estado:** aceptada

**Contexto.** El bloque 8 del interludio pide Lista, Tablero, Gantt y Tabla
personales, sobre `GET /my-work/tasks/search` (ADR 037) y el registro de
campos del espacio (ADR 038). Las cuatro vistas de proyecto ya existen, pero
tres de ellas no son directamente reutilizables cruzando proyectos: `list-view`
y `kanban-board` leen `useProjectStore()` —un singleton de **un** proyecto—
tanto en el contenedor como dentro de cada fila y tarjeta, y el Gantt de
proyecto arrastra siempre para reprogramar. `table-view` es la excepción: no
lee ningún store ni dispara ninguna mutación por sí misma, así que es
directamente reutilizable.

**Decisión.**

- **Lista y Tablero se construyen ligeros sobre `WidgetTaskRow`**
  (`dashboard/widget-task-row.tsx`), el mismo componente sin estado que ya
  estrenó "Hoy": sin tienda de proyecto, sin mutación propia. No se fuerza
  `list-view`/`kanban-board` a un modo multi-proyecto que no tenían: el coste
  de desacoplar su lectura de `useProjectStore` en cada fila y tarjeta es
  mayor que escribir un contenedor nuevo sobre una fila ya hecha.
- **`table-view` se reutiliza tal cual.** Es la única de las cuatro que no
  hacía falta tocar.
- **Los carriles del Tablero son ventanas de vencimiento** (Vencidas / Hoy /
  Esta semana / Más adelante / Sin fecha, `lib/due-window.ts`), no estado:
  `status`/`column` no existen en el registro del espacio (ADR 038) porque
  comparan contra las columnas de un proyecto y mentirían en otro.
- **Arrastrar no hace nada en esta iteración**, ni en el Tablero ni en el
  Gantt. Un carril de vencimiento no es un estado que "mover a" signifique
  algo, y el Gantt personal no tiene todavía un destino con sentido para un
  arrastre: ese destino es el plan personal del bloque 6 (Planificador), que
  no existe aún. Forzar un significado ahora —tocar `due_date`— chocaría
  después con el principio de esa misma tabla: el vencimiento es un
  compromiso con el equipo, no algo que el plan personal deba poder mover.
- **La Lista es plana, sin modo árbol.** `parent` y `depth` describen un árbol
  acotado a un proyecto (ADR 011) y están fuera del registro del espacio por
  la misma razón que `status`.
- **La Tabla personal no lleva campos personalizados en esta iteración.**
  `getWorkspaceFieldRegistry` ya calcula qué campos de espacio sobreviven sin
  ambigüedad para *filtrar*, pero no existe un endpoint que los liste para
  *pintarlos como columna*: construirlo es una pieza nueva, no una reutilizada,
  y no la pide el criterio de aceptación del bloque. Declarado, no olvidado.
- **El Gantt personal es de solo lectura**, sin capa de dependencias
  (`GanttDependencyLayer` pide `task_relation` de **un** proyecto) y con
  "hecha" resuelto por `isDone` —que `searchTasks` ya calcula igual que en
  todas partes desde la ADR 030— en vez de las columnas finales de un
  proyecto. `GanttTaskBar` no tenía forma de desactivar el arrastre: gana un
  prop `readOnly` aditivo, con `false` por defecto, así que el Gantt de
  proyecto no cambia.
- **El filtro y las vistas guardadas llegan primero a la Tabla.** Es la única
  de las cuatro que ya traía barra de filtros (`table-view/filter-bar.tsx`) sin
  nada más que enchufarle el registro del espacio. Lista y Tablero se quedan
  en esta iteración con un selector de ámbito (asignadas a mí / de mis
  equipos) y nada más filtrable —es lo mismo que tenía "Mi trabajo" antes de
  la ADR 024—, y ganan la barra de filtros completa cuando alguien la pida.
- **Vistas guardadas de espacio, con las rutas nuevas mínimas.** `getViews` y
  `createView` ya aceptaban `projectId: null` desde que existen —el modelo de
  datos de la ADR 015 ya preveía esto—, pero ninguna ruta HTTP los llamaba sin
  un `projectId` en la URL. Se añaden `GET/POST /view/workspace` (por
  `workspaceId` en la query, con `workspaceAccess.fromQuery()`); `PATCH /:id`
  y `DELETE /:id` ya eran agnósticas de proyecto y sirven sin tocarlas.
  El alcance de clave de API en el `POST` es `task:update` y no
  `project:update`: no hay proyecto que anclar, y compartir una vista con el
  espacio entero es, igual que en la de proyecto, una escritura y no una
  simple lectura.

**Por qué no las alternativas.** Adaptar `list-view`/`kanban-board` para
aceptar el proyecto de cada fila como prop —en vez de leerlo de la tienda—
tocaría dos componentes que ya funcionan y son el camino caliente de las
vistas de proyecto, por una reutilización que ahorra menos código del que
parece: la mayor parte de su complejidad es el árbol y el estado por columna
de un único proyecto, que una vista personal no tiene. Ofrecer `status` con la
promesa de que cada proyecto lo interprete a su manera ya se descartó en la
ADR 038 por el mismo motivo que aquí: un recuento que parece correcto y no lo
es es peor que una función que falta.

**Consecuencias.**

- **Sin tiempo real en las vistas guardadas de espacio.** `view.changed`
  descarta ya el evento cuando `projectId` es nulo (`if (!projectId) return`),
  así que compartir una vista de espacio no avisa a nadie en vivo. Es el mismo
  hueco que ya tenía cualquier cambio a nivel de espacio sin canal por
  workspace; no lo abre este bloque, lo hereda.
- **El Tablero y el Gantt personales no tienen affordance de arrastre en el
  DOM**: no es una limitación técnica silenciada, es la ausencia intencionada
  de la interacción hasta que el Planificador le dé un destino real.
- **La Tabla personal muestra menos columnas que la de proyecto** —sin campos
  personalizados— hasta que exista el endpoint de listado de campos de
  espacio.
- **Lista y Tablero no tienen filtro ni vista guardada propia todavía**, solo
  el selector de ámbito. Cuando lo pidan, es la misma barra de filtros y los
  mismos hooks de vista de espacio que ya usa la Tabla.
- **`GanttTaskBar.readOnly`** es la única pieza compartida que cambia; todo lo
  demás de este bloque es aditivo (rutas, fetchers, hooks y componentes
  nuevos).
