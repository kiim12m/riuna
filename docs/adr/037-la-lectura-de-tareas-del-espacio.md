# ADR 037 — La lectura de tareas del espacio se generaliza, se pagina y se comparte

**Fecha:** 2026-09-21 · **Estado:** aceptada

**Contexto.** El espacio personal necesita responder «qué me toca a mí, en todos los proyectos» con el motor de filtros y con paginación de verdad. Esa lectura ya existía tres veces a medias. [`top-tasks.ts`](../../apps/api/src/dashboard/top-tasks.ts) devuelve las N primeras filas sin total y sin paginar, porque vive dentro de una tarjeta de trescientos píxeles. [`aggregate.ts`](../../apps/api/src/dashboard/aggregate.ts) tenía una `scopeConditions` privada **idéntica** a la de la anterior. Y [`get-my-work.ts`](../../apps/api/src/my-work/controllers/get-my-work.ts) resolvía lo difícil —paginación, recuento topado, «hecho» por proyecto, etiquetas y asignados por lotes, con las optimizaciones medidas en la Fase 4.5— pero con ventanas de vencimiento fijas en vez del árbol de filtros, y sin devolver `estimate`.

**Decisión.** Un endpoint nuevo, `GET /api/my-work/tasks/search`, y tres extracciones que lo hacen posible sin una cuarta copia.

- **El ámbito, a [`view/workspace-task-query.ts`](../../apps/api/src/view/workspace-task-query.ts).** `workspaceTaskConditions()` es la docena de líneas que estaban duplicadas: espacio, proyecto vivo, tarea no archivada, proyecto opcional, ámbito personal y filtro compilado. Regla de tres cumplida con el tercer uso, no antes.
- **La decoración de filas, a [`my-work/decorate.ts`](../../apps/api/src/my-work/decorate.ts).** Las columnas del espacio con «hecho» ya resuelto, el predicado que excluye lo terminado y las dos consultas por lotes de etiquetas y asignados. `get-my-work.ts` pasa de 397 a 181 líneas y deja de ser el único sitio donde vive esa regla.
- **La forma de página, a [`my-work/pagination.ts`](../../apps/api/src/my-work/pagination.ts).** El tope de 500 no es un detalle de implementación: la web escribe «500+» cuando `totalIsCapped`, así que el número tiene que ser el mismo en las dos lecturas o la misma etiqueta mentiría en una de ellas.
- **El endpoint vive en `my-work/` y no en `task/`**, donde las treinta rutas son por proyecto, y se protege igual que su hermano: `workspaceAccess.fromQuery()` más `requireApiKeyScope({ task: ["read"] })`. Un *gate* de rol sería más estricto que `GET /task/tasks/:projectId`, que no lleva ninguno, y dejaría a un rol a medida sin `task:read` viendo el tablero y un 403 aquí. Sin ningún *gate* se apagaría de paso la única comprobación del alcance de las claves de API.
- **El orden siempre acaba en `id`.** Con `OFFSET`, Postgres no promete nada sobre el reparto de los empates entre una consulta y la siguiente, así que sin un orden total dos páginas consecutivas pueden repetir una fila o saltársela. Ordenar por prioridad deja miles de empates en un espacio real: aquí el caso raro es el habitual.
- **No se admite ordenar por `number` ni `position`.** Se numeran por proyecto; ordenar por ellos entre proyectos no significa nada. Es la misma razón por la que el registro de espacio los retira ([ADR 038](038-lo-que-una-vista-transversal-no-ofrece.md)).

**Por qué no las alternativas.** Ensanchar `getMyWork` con un parámetro `filter` habría mezclado dos contratos —las ventanas de vencimiento fijas son lo que consume hoy la web— en una función que ya tenía diez opciones. Generalizar `topTasks` con paginación habría metido un recuento completo en una tarjeta que no lo enseña. Y construir el endpoint nuevo copiando el cuerpo de `getMyWork` habría dejado cuatro sitios donde cambiar la definición de «hecho».

**Consecuencias.**

- **`getMyWork` y la búsqueda comparten ámbito, decoración y paginación**, así que no pueden responder cosas distintas a la misma pregunta. Los agregados de paneles y objetivos y la tabla de los widgets comparten el ámbito con las dos.
- **La búsqueda devuelve `estimate` y `updatedAt`, que `getMyWork` no incluye**, y **no devuelve `parentId` ni `depth`**, que son del árbol de un proyecto.
- **Un filtro mal formado, o que nombre un campo que el registro del espacio no ofrece, es un 400 con el nombre del campo dentro.** `filterToSql` no compila hasta tener el registro, así que el campo desconocido se descubre al ejecutar y no al analizar la URL: de ahí que la ruta atrape `FilterError` además de los errores de `parseFilterParam`.
- El endpoint **no tiene consumidor web todavía**: lo tendrán las vistas personales. Es la misma situación en que la [ADR 031](031-panel-personal-unificado.md) dejó a `?due=today`.
