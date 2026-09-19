# ADR 024 — «Mi trabajo» y la bandeja

**Fecha:** 2026-09-04 · **Estado:** aceptada

**Contexto.** Todas las consultas de tareas del web son
`client.task.tasks[":projectId"]`: hasta ahora Riuna no tenía **ninguna** lectura
que cruzase proyectos. Para saber qué tienes pendiente había que entrar proyecto
por proyecto y filtrar por responsable en cada uno. La Fase 1 añadió asignados
múltiples (`task_assignee`) y asignación a departamentos (`task.team_id`) sin una
pantalla que los reuniera.

**Decisión.** Un módulo propio `apps/api/src/my-work/` con una única lectura por
espacio de trabajo, `GET /api/my-work/tasks`, y una página con dos secciones
—«Asignadas a mí» y «De mis equipos»— más la bandeja como **pestaña**, no como
ruta aparte. El precedente es `search`, que también lee entre proyectos y también
es su propio módulo; meterlo en `task/`, cuyas treinta rutas son por proyecto,
sería el fork con dos estilos que `AGENTS.md` prohíbe.

**Consecuencias.**

- **Dos secciones, no una lista fundida.** Una tarea puede salir en las dos: lo
  tuyo y lo que tu departamento aún no ha repartido son preguntas distintas, y
  fundirlas borra la única que es accionable por otra persona.
- **La bandeja no estrena modelo.** Es la misma consulta `["notifications"]` que
  alimenta la campana, así que marcar leído actualiza las dos a la vez. No hay
  archivado ni pospuesto. `getNotifications` está topada en **50 filas sin
  paginar**: invisible en un desplegable, visible a página completa, y por eso la
  página lo dice en vez de fingir que eso es todo lo que ha pasado. **Deuda
  declarada.**
- **La membresía se empuja; el contenido se estira.** El canal de usuario emite
  `MY_WORK_INVALIDATED` solo para los siete eventos que cambian *si* la fila te
  pertenece. `task.updated`, `priority_changed`, `due_date_changed` y los de
  etiquetas quedan **fuera a propósito**: disparan en cada arrastre y pondrían
  una resolución de destinatarios en el camino de mutación más caliente del
  producto para una página que la mayoría no tiene abierta. Los recoge un
  `refetchInterval` de 60 s.
- Tres eventos no llevaban el id del lado que pierde la tarea, así que
  desasignar era invisible. Se añaden `previousAssigneeId`, `oldTeamId` y
  `assigneeIds`/`teamId`, todos aditivos.
- **Redis no se toca.** `userBroadcastSchema` es `v.looseObject`: el canal de
  usuario conserva las claves no declaradas, al revés que el de proyecto. El
  aviso escrito en `broadcast-adapter.ts` es del otro canal.
- **Aquí no entra el motor de filtros de la Fase 4.** El compilador es agnóstico
  del ámbito, pero el registro de campos no: una definición de proyecto
  **eclipsa** a la del espacio con la misma clave y puede ser de otro tipo en
  cada proyecto, así que `custom.presupuesto` filtraría a cero en silencio en
  unos proyectos y no en otros; y `status` es un *slug* por proyecto. Tres
  controles fijos —vencimiento, proyecto y «mostrar completadas»— hasta que eso
  tenga respuesta.
- **Sin agregados del árbol:** son por proyecto y la Fase 4.5 los midió en 242 ms
  fijos, así que una página de varios proyectos pagaría una llamada por proyecto.
  Se pierde el contador `3/7` de subtareas y las fechas heredadas de la rama; el
  detalle de la tarea las sigue enseñando a un clic.
- **«Hecho» se resuelve una sola vez.** `getFinalStatuses` es privada de su
  módulo y toma un único proyecto, así que la regla se reconstruye aquí para
  todo el espacio en una consulta; de esa misma lista `finals` salen **tanto** el
  predicado SQL que excluye **como** la bandera `isDone` que decora. Escribirla
  dos veces era pedir que divergieran.
- **`OFFSET 0` en la subconsulta de asignados es una valla de optimización, no un
  descuido.** Sin ella Postgres arma un semi-join y recorre las tareas del
  espacio entero sondeando `task_assignee` una por una, porque estima mal
  cuántas sobreviven. Con ella arranca por `taskAssignee_userId_idx` y el
  trabajo pasa a ser proporcional a **tus** tareas, no a las del espacio —que es
  lo que una página llamada «Mi trabajo» tiene que hacer—.
- **Sin herramienta MCP.** Un agente ya combina `list_projects` + `list_tasks`;
  una `my_work` costaría un esquema en `packages/mcp` y otro en la API para una
  comodidad que los agentes rara vez necesitan.
- **Sin migración.** Medido con 50.000 tareas y 5.062 asignadas a una persona,
  todos los predicados los sirven índices que ya existían. El índice
  `task (team_id, due_date)` que se había propuesto **no se añade**: el tramo de
  equipo sale a 30 ms y el planificador prefiere un `BitmapAnd` a un recorrido
  ordenado, así que no lo usaría. Es la misma lección que la Fase 4.5, que
  refutó midiendo un índice que parecía obvio.
- **Aplazado a sabiendas:** `unique(team_id, user_id)` en `team_member`. El hueco
  es real, pero cerrarlo exige limpiar duplicados en instalaciones con datos, y
  resolver los equipos con `selectDistinct` lo hace innecesario para la
  corrección.
