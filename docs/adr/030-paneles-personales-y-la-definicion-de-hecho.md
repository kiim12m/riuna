# ADR 030 — Paneles personales, y «hecha» con una sola definición

**Fecha:** 2026-09-08 · **Estado:** aceptada

**Contexto.** La Fase 7 monta los widgets «sobre el motor de vistas de la Fase 4
más una capa de agregación», pero ese motor no cruza proyectos: el compilador sí
es agnóstico del ámbito y el **registro de campos no**. La
[ADR 024](024-mi-trabajo-y-bandeja.md) lo dejó escrito y aplazado —«hasta que eso
tenga respuesta»— y un panel personal es cruzado por definición. Además «hecha»
tenía **tres** definiciones que no coincidían: `status IN ('done','archived')` en
las estadísticas de proyecto, los slugs `is_final` por proyecto en los agregados
del árbol y en «Mi trabajo», y `completed_at` en los ciclos. Una superficie que
informa no puede contradecir a la pantalla de al lado.

**Decisión.**

1. **El ámbito de un widget elige su registro.** `dashboard_widget.project_id` es
   nulo o no, igual que en `view` y en `field_definition`. Con proyecto se
   compila contra el registro de siempre; sin él, contra un
   `buildWorkspaceFieldRegistry` que retira los seis nombres cuyo significado
   cambia por proyecto —`status`, `column`, `number`, `position`, `parent`,
   `depth`— y **también** toda clave de campo personalizado del espacio que algún
   proyecto redefina con otra forma de comparación. `epic`, `label` y `assignees`
   se quedan: casan por id o por nombre.
2. **«Hecha» es `task.completed_at IS NOT NULL`, en todas partes.** No es una
   tercera regla: el disparador de la [ADR 025](025-ciclos-y-completed-at.md)
   calcula «final» con exactamente la misma regla que las dos funciones de
   TypeScript reconstruyen. Es la segunda, materializada por la base de datos, y
   la única que cuesta O(1) bytes de sentencia y le da una fecha a una tendencia.
   Entra como campo `done` en `BUILT_IN_FIELDS`, así que las vistas guardadas se
   la llevan también.
3. **Un endpoint por lote, y recálculo por intervalo.**
4. **Propiedad en vez de permiso nuevo.**

**Consecuencias.**

- **El eclipse silencioso era el peligro, no el 400.** Un `presupuesto` del
  espacio compilado como número contra un JSONB de texto no da error: `jsonb_typeof`
  no casa, el `CASE` da NULL y esas tareas **desaparecen del recuento**. Retirar
  el campo es el modo de fallo correcto para algo que informa.
- **Archivar una tarea hecha le borra la fecha.** El disparador anula
  `completed_at` en cuanto el estado deja de ser final, y `archived` no lo es. El
  recuento del trimestre pasado cambia al archivar. Es coherente con «una tarea
  archivada no entra en ningún agregado», pero **es historia que muta**.
- **La barra de progreso de los proyectos se mueve, casi siempre hacia abajo.**
  `get-projects.ts` contaba como completada cualquier tarea archivada, así que
  limpiar el backlog la subía. Se corrige en su propio commit.
- **Cambiar `is_final` ahora resella el proyecto.** Era el riesgo declarado de la
  ADR 025 e invisible mientras nadie releyera la fecha; con un panel leyéndola es
  una gráfica que miente. `update-column` lanza el `UPDATE task SET status =
  status` que la propia ADR 025 prescribe, como SQL suelto para no tocar
  `updated_at` de todas las tareas.
- **El lote lo fuerza el pool, no la comodidad.** `getDatabasePool()` fija
  `max: 10`: cinco widgets en paralelo serían cinco conexiones por pestaña. Por
  eso el presupuesto se declara **por panel y no por widget**, y por eso se
  calculan en serie. Un widget que falla lleva su error y no tumba el panel.
- **Intervalo, y ningún canal nuevo.** No hay canal de espacio de trabajo, y un
  panel no tiene destinatarios que estrechar: cualquier evento ensuciaría todos
  los widgets, así que una actualización masiva sería una tormenta de barridos
  completos. El contenido llega por intervalo, con el precedente de «Mi trabajo»
  —30 s de frescura, 60 s de intervalo—, que con `refetchIntervalInBackground` en
  falso no cuesta nada en pestaña oculta.

  Lo que **sí** se empuja es la pertenencia, y sin inventar nada: la
  [ADR 031](031-panel-personal-unificado.md) engancha el panel al
  `MY_WORK_INVALIDATED` que el canal de usuario ya emitía, que es el aviso de
  «esta tarea ha pasado a ser tuya, o ha dejado de serlo» y trae sus
  destinatarios ya resueltos.
- **Sin recurso `dashboard` en `@riuna/permissions`.** Toda fila de
  `workspace_role` ya guardada carece de él y `satisfies()` devolvería falso: cada
  espacio con roles personalizados se quedaría con un 403 el día del despliegue.
  Los datos sí llevan `requireApiKeyScope({ task: ["read"] })`, por el mismo
  razonamiento que «Mi trabajo».
- **Medido, no supuesto** (2026-09-08, banco con 100.000 tareas y el espacio
  medido con 50.000): cada forma cae entre 22 y 54 ms, y los widgets del panel de
  partida suman **212 ms** contra un presupuesto de 300. Confirma el lote en
  serie y descarta la palanca de colapsar widgets en un solo barrido, que queda
  escrita por si el volumen la pide algún día.
- **Índice declarado y no construido.** El único candidato honrado es
  `task (completed_at) WHERE completed_at IS NOT NULL`, y solo se paga con una
  ventana estrecha sobre años de historia. Con el 25-40 % de filas cerradas y un
  banco cuya historia entera cabe en la ventana consultada, el planificador lo
  rechazaría —como rechazó `task (team_id, due_date)` y `(project_id, position)`—.
  Se construye el día que haya historia real que lo justifique.
- **La segunda copia de `buildFilter`.** Un widget guarda su filtro en forma
  editable y lo compila el servidor, donde la implementación del web no llega.
  Las dos se comparan **ejecutándolas** en `tests/api/view/build-filter.test.ts`;
  si apareciera una tercera, toca extraerlo a `packages/libs`.
- **Sin herramienta MCP y sin paneles compartidos**, por los mismos motivos que
  ciclos y «Mi trabajo»: un agente ya combina las lecturas que hay, y compartir
  es una columna más el día que haga falta, no otra tabla.

**Índice construido (2026-10-03, migración 0079).** La condición de arriba —una
ventana estrecha sobre años de historia— se simuló repartiendo las tareas
cerradas del banco en tres años: «hechas esta semana» pasó de 20 ms a 0,5 ms y
el planificador usa `task_completedAt_idx`, parcial sobre las cerradas. Con la
historia entera dentro de la ventana, que era el banco original, seguiría
rechazándolo.

