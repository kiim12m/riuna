# ADR 025 — Ciclos, y `completed_at` mantenido por la base de datos

**Fecha:** 2026-09-04 · **Estado:** aceptada

**Contexto.** El criterio de aceptación de la Fase 6 es «cierras un sprint y ves
velocidad real y horas por persona». Para eso hace falta saber **cuándo** se
completó cada tarea, y Riuna no lo guardaba: lo único que quedaba era una fila
en `activity` de tipo `status_changed`, una tabla de auditoría con el dato dentro
de un JSONB.

**Decisión.** Una tabla `cycle` colgada del **proyecto** —calcada de `epic`—, una
columna `task.cycle_id`, y una columna `task.completed_at` **que mantiene un
disparador de PostgreSQL**, no la aplicación.

**Consecuencias.**

- **El disparador es la decisión estructural.** Hay cinco escritores de `status`
  en el dominio de tareas (`update-task`, `update-task-status`, `move-task`,
  `cascade-status`, `bulk-update-tasks`) y otros tantos entre importación,
  webhooks de GitHub/Gitea y MCP. La Fase 4.5 encontró **cuatro** caminos que
  escribían `assignee_id` sin tocar `task_assignee`; aquí hay nueve, y la
  siguiente integración añadirá el décimo sin leer esta ADR. El disparador
  actúa solo cuando `status` o `project_id` cambian de verdad, así que arrastrar
  dentro de la misma columna o editar un título no pagan la consulta. Es la misma
  lógica que las dos `CHECK` del árbol de la Fase 2: la base guarda la
  coherencia.
- **El coste es que no se ve leyendo el TypeScript.** Quien lea
  `update-task-status.ts` no verá `completed_at` por ningún lado. Por eso la
  columna lo dice en su comentario de esquema y por eso hay una prueba de
  integración que lo comprueba **a través de la API**, no con SQL suelto.
- **`completed_at` no es la fuente de verdad de «está hecha».** Eso lo dice la
  columna final del proyecto. Esta columna responde solo *cuándo*. El disparador
  respeta una fecha que venga escrita —manda sobre el *si*, no sobre el
  *cuándo*—, que es lo que permitirá a la importación restaurar una fecha real en
  vez de estampar la de hoy.
- **Un solo ciclo activo por proyecto, y lo vigila un índice parcial único.** Dos
  peticiones simultáneas de «activar» pasarían las dos una comprobación previa en
  el controlador, igual que los dos reparentados concurrentes de la Fase 4.5
  creaban un ciclo con las dos `CHECK` satisfechas. La violación de unicidad se
  traduce a un 409 legible.
- **Cerrar no es un cambio de estado más**, y por eso no se alcanza con el
  `PATCH`: tiene que decidir antes qué pasa con lo que quedó sin terminar
  —backlog o siguiente ciclo—, y va en una transacción con el cierre. **Pregunta
  en vez de arrastrar solo:** mover trabajo de alguien sin que nadie lo confirme
  es como se pierden tareas de vista. Lo terminado se queda dentro: es
  exactamente lo que la velocidad mide.
- **No se puede reabrir un ciclo cerrado.** La velocidad ya se dio por congelada
  y volver atrás cambiaría la historia.
- **`cycle` no lleva `archived_at`** —`closed` ya es el estado terminal y un
  ciclo cerrado tiene que quedarse, porque es lo que sostiene la velocidad
  histórica— ni `position`, porque las fechas ya lo ordenan.
- **Tareas y horas, conmutable, nunca dos ejes.** Un gráfico de doble eje deja
  que quien lo dibuja elija la historia moviendo una escala respecto de la otra.
  Y la unidad no es fija porque un burndown de horas es una línea plana en cero
  cuando el equipo no estima, lo que parece un fallo en vez de una ausencia de
  datos.
- **El burndown se dibuja sobre el alcance actual del ciclo.** Riuna no guarda
  cuándo entró cada tarea en el sprint, así que una añadida a mitad aparece como
  si hubiera estado desde el principio. La alternativa —instantáneas diarias— es
  un segundo mecanismo para lo mismo, y la regla de tres pide uno. **Deuda
  declarada.**
- **Riesgo conocido:** cambiar `is_final` de una columna que ya tiene tareas deja
  sus `completed_at` como estaban hasta que cada tarea vuelva a cambiar de
  estado. Se repara con un `UPDATE task SET status = status` sobre el proyecto,
  que hace saltar el disparador en todas.
- **Sin herramienta MCP**, por el mismo motivo que «Mi trabajo»: un agente
  gestionando sprints es plausible pero infrecuente, y costaría un esquema en
  `packages/mcp` y otro en la API.

---

**Corrección de la Fase 7 (2026-09-08).** La reparación que esta ADR prescribía
para el riesgo de arriba —«se repara con `UPDATE task SET status = status` sobre
el proyecto»— **no funciona**, y no funcionaba desde que se escribió: el propio
disparador corta por lo sano cuando `status` no cambia, que es lo que evita que
un arrastre dentro de la misma columna pague una consulta. `SET status = status`
no cambia `status`, así que el recálculo no llegaba a ejecutarse nunca.

Lo destapó una prueba de integración al conectar el resellado a la edición de
columnas, no la lectura del código: el razonamiento parecía correcto en los dos
sitios por separado.

La regla de «esta columna es final» se extrae a la función
`task_status_is_final(project_id, status)` (migración 0056), que ahora usan
**los dos**: el disparador por fila y el resellado por proyecto. Sigue habiendo
una sola copia en la base, y el atajo del disparador se conserva intacto.

**Y queda clavado un comportamiento que sorprende:** desmarcar la *única* columna
final de un proyecto no deja sus tareas sin fecha, porque el respaldo heredado
dice que un proyecto sin columnas finales sigue entendiendo el slug `done`. No
hay forma de distinguir «nunca se configuró» de «se desconfiguró a propósito».
