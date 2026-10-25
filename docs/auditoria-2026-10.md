# Auditoría de Riuna — plan de arreglos (2026-10-16)

## Contexto

Auditoría de todo el código hecha entre el 2026-10-15 y el 16, antes de empezar el
Bloque B: puntos débiles, errores, optimizaciones y limpieza. Solo busca y documenta;
los arreglos se hacen en sesiones posteriores, tanda a tanda, siguiendo este
documento. Complementa a [`plan.md`](plan.md), que sigue siendo el plan vivo.

**Alcance.** La API (~84.000 líneas), la web (~116.000), los paquetes, la
infraestructura y el CI, sobre `main` en 6abdb56. Las líneas citadas son de ese
commit.

**Método.**
- Tres exploraciones (seguridad, datos y web), más revisión propia.
- Consultas en solo lectura: el catálogo de PostgreSQL de `riuna_e2e_test`, el
  `dist` de la web, Biome en modo `ci` y el informe de i18n.

**Leyenda.** **✔** = comprobado en el código o en la base durante la auditoría. **~** = sospecha:
medir o reproducir antes de arreglar. El resto viene de los exploradores, con la
evidencia citada.

**No se repite** lo que ya está en `docs/plan.md`:
- vistas sin paginar (deuda de la 4.5);
- GIN sin rangos;
- informe de índices con uso real (Fase 9, punto 5.2);
- Sentry pospuesto;
- copia externa.

## Decisiones tomadas (2026-10-16)

| | Decisión | Efecto en el plan |
|---|---|---|
| D1 | Altas **solo por invitación o cuenta local** | 3.1 |
| D2 | Integraciones en uso: **chats** (Discord/Slack/Telegram) y **webhook genérico**. **GitHub y Gitea se retiran** | 2.1. Desaparecen sus arreglos (Gitea numera mal, GitHub sin transacción, GitHub App entre inquilinos, núcleo común) |
| D3 | Se borran **facturación (Creem)**, **planka-import** y los **despliegues que no usa el PC**. **El catalán se queda** | 2.2-2.4 |
| D4 | MCP **solo por HTTP**: se retira el paquete stdio | 2.5 |
| D5 | Adjuntos en **disco local** (backend nuevo en la API) | 9.2 |
| D6 | Algunos miles de tareas por proyecto, casi todas archivadas o en backlog: **el tablero deja de cargar archivadas y backlog**; no se pagina; se virtualiza solo el backlog si al medir hace falta | 5.1 |
| D7 | Purgar **solo lo caducado** | 9.1 |

## Cómo ejecutarlo

- **Una tanda = una rama desde `main` y una PR**, con un commit por punto
  (Conventional Commits, asunto en minúscula).
- **Cada fallo lleva una prueba que falla antes del arreglo**: integración si toca
  base de datos, autorización o eventos; unitaria si es un hook; e2e si es un gesto.
- **Releer el código antes de cada punto**: las líneas citadas son de 6abdb56, y
  después entraron en `main` las PR #74-#77 (wiki, exportar, Hoy y Planificador).
- **Al cerrar un punto**, tacharlo aquí (`~~…~~ ✔ PR #n`) como se hace en
  `plan.md`.
- **Orden: 1 → 2 → 3 → 4 → 5 → 6.** Las tandas 7-9 se pueden intercalar.
  - La 2 va pronto porque, al retirar GitHub y Gitea, desaparecen varios arreglos.
  - **El 5.2 depende del 1.1.**
- **Cada retirada y cada cambio estructural lleva su ADR**, que hoy van por la 093.

---

## Tanda 1 — Datos que se pierden o se corrompen (alta)

1.1 ✔ **Arrastrar en tablero, lista o backlog manda un PUT completo por cada tarea de
la columna**, con la foto que tenía el navegador (título, descripción, prioridad,
fechas, asignado).
- **Problema**: pisa lo que otra persona haya editado en las tareas vecinas. Cada
  PUT invalida 8 claves y manda un TASK_UPDATED a los demás.
- **Dónde**: `components/kanban-board/index.tsx:158-183`, `list-view/index.tsx:408-440`
  y `:470`, `backlog-list-view/index.tsx:250-289`, `backlog.tsx:286`,
  `fetchers/task/update-task.ts`.
- **Arreglo**: endpoint nuevo `PUT /task/reorder/:id {status, afterId, beforeId}`
  que reordena en una transacción y publica un solo evento. El cliente lo llama una
  vez y usa `setQueryData`. «Mover todo» y «archivar columna» pasan a `/task/bulk`.
  - Recibe la vecina y no la lista que ve el navegador (`orderedIds`, como se
    pensó al principio). Con un filtro puesto esa lista es solo parte de la
    columna, y renumerarla pisaría el sitio de las tareas ocultas.
  - Solo cambia de estado la tarea soltada. Si la vecina ya no está en la
    columna, prueba con la otra, y si tampoco, la pone al final.
  - `get-tasks` desempata por id, igual que el endpoint.
  - «Mover todo» lleva a la primera columna, como dice su aviso, y no a `to-do`.
  - **Sigue mandando el PUT completo**, sobre una sola tarea: el Gantt
    (`gantt-task-bar.tsx`), con la tarea del listado. Hay que pasarlo a una ruta
    parcial antes del 5.2.

1.2 ✔ **El borrado en lote no repara el árbol** (`bulk-update-tasks.ts:239`).
- **Problema**: deja hijas con `parent_id` NULL (la FK hace SET NULL) pero con
  `path` y `depth` viejos, y los CHECK no lo impiden. Tampoco limpia S3, y el evento
  `task.deleted` va sin `assigneeIds` ni `teamId`.
- **Arreglo**: extraer de `delete-task.ts:33-90` un
  `deleteTasksPromotingChildren(tx, ids)`, con `lockProjectTree`, para los dos
  caminos.
- **Datos existentes**: diagnóstico en el PC (`parent_id IS NULL AND depth > 0`) y,
  si aparece algo, una migración de reparación.
  - Hecho sin esperar al diagnóstico: la migración `0096_repair_task_tree`
    recalcula `path` y `depth` desde `parent_id` y solo escribe las filas que
    no coinciden. En una base sana no cambia nada.
  - El lote borra una a una, releyendo cada tarea, porque si su madre va en el
    mismo lote su `path` ya ha cambiado. Toma el cerrojo de cada proyecto
    siempre en el mismo orden. Además publica `task-relation.deleted`, como el
    borrado de una sola.

1.3 ✔ **Desasignar en lote publica `oldAssignee`** (`bulk-update-tasks.ts:224-232`),
pero `my-work/recipients.ts:86`, `activity/index.ts:250` y `get-task-baseline.ts:94`
leen `previousAssigneeId`. La actividad pierde a quién se quitó.

1.4 ✔ **El apagado corta trabajo en curso**: `index.ts:985-994` hace `server.close()`
y `process.exit(0)` sin esperar, y `events/index.ts:136` tiene su propio SIGTERM
que quita los oyentes.
- **Arreglo**: esperar a `server.close` (con tope de unos 10 s), luego
  `settleEvents()`, `shutdownScheduler()` y `pool.end()`, y quitar el SIGTERM de
  `events`.
  - Hecho en `shutdown.ts`. Antes de `server.close` se cierran los WebSocket
    con 1001; si no, el cierre esperaría a que colgara cada navegador.
  - El planificador espera al trabajo que esté corriendo (`isBusy` de croner).
  - `compose.local.yml` da 15 s (`stop_grace_period`) para que Docker no corte
    el apagado justo a los 10 s.

1.5 ✔ **Sin `process.on("unhandledRejection")` ni `"uncaughtException"`**: en Node 24
un rechazo sin capturar tumba la API.
- **Arreglo**: registrarlos con `log.error`. Un rechazo se anota y se sigue; una
  excepción sale con 1.

1.6 ✔ **El cerrojo de las migraciones va por el pool**
(`database/run-migrations.ts:61-68`). `SET lock_timeout`, `pg_advisory_lock` y el
unlock pueden caer en conexiones distintas.
- **Arreglo**: un `pool.connect()` dedicado, `drizzle(client)` para `migrate`, y el
  unlock en ese mismo cliente.

1.7 ✔ **Columnas.**
- `delete-column.ts:15-27` cuenta las tareas solo por `column_id`, así que las que
  tienen `column_id` NULL y `status = slug` desaparecen del tablero. Hay que contar
  también por `(project_id, status)`.
- `reorder-columns.ts:10-24` va sin transacción: validar el lote antes, como
  `reorder-projects.ts`.

1.8 ✔ **Renombrar una etiqueta da 500** (`label/controllers/update-label.ts:28-36`).
La cascada choca con `label_task_name_unique` y con `label_workspace_name_unique`.
- **Arreglo**: devolver 409 con un mensaje, o fusionar quitando antes las copias
  duplicadas.

1.9 **Plantillas y recurrencia no son atómicas.**
- `create-project-from-template.ts:89-97` compensa borrando el proyecto cuando las
  `createTask` ya hicieron commit y emitieron eventos.
- `recurrence/generate.ts:139-175` hace tres commits.
- **Arreglo**: que `createTask` acepte un `tx` y publique después del commit.

## Tanda 2 — Retiradas decididas (D2, D3, D4)

Antes de cada retirada:
- consultar en el PC qué datos hay;
- escribir su ADR;
- quitar la documentación, la i18n (`en`, `es` y `ca`), las variables de
  `.env.sample` y lo que pase `check:env`;
- regenerar `openapi.json` y `i18n/schema.json`.

2.1 **Retirar GitHub y Gitea.**
- **API**: `github-integration/`, `gitea-integration/`, `plugins/github/`,
  `plugins/gitea/`, las rutas de webhook y sus `limitByIp` en `index.ts:246-294`, la
  dependencia `octokit` y las herramientas MCP que les toquen.
- **Web**: `github-integration-settings.tsx`, `gitea-integration-settings.tsx`, sus
  fetchers y hooks.
- **`external_link`** solo la alimentan ellas: router `external-link/`, la parte de
  `get-tasks.ts:186-230` y la tabla. Antes, confirmar con grep que nada más escribe
  en ella.
- **Contenido viejo**: las etiquetas `<riuna-issue-link>` y `<kaneo-issue-link>` de
  las descripciones tienen que seguir pintándose como enlace normal. No borrar el
  parser sin una alternativa.
- **Datos en el PC**:
  - Si se llegó a importar de Gitea, hay que reparar los contadores:
    `last_task_number = GREATEST(last_task_number, max(number))`, porque la
    importación de Gitea numeraba con `max + 1`.
  - Decidir si se exportan las filas de `integration` y `external_link` antes de la
    migración que las borra.
- **No se toca** el inicio de sesión con GitHub (`socialProviders.github`): no es
  la integración.

2.2 **Retirar la facturación (Creem).**
- **API** (~900 líneas): `billing/`, los trabajos `seat-reconciliation` y
  `trial-reminders`, `is-cloud` donde ya no sirva, los `syncWorkspaceSeats` de
  `auth.ts:462-469` y la excepción de `/api/billing/webhook` en `index.ts:657`.
- **Web**: `trial-card.tsx`, `admin/workspace/billing.tsx`, `fetchers/billing`, los
  hooks de facturación, `use-pending-checkout`, `captureCheckoutIntent`
  (`main.tsx:22`) y la entrada del menú (`admin/workspace.tsx:96-99`).
- **Datos**: migración que borra `workspace_billing`, `billing_event` y
  `billing_reminder_sent`.
- **Otros**: la dependencia `creem`; la excepción de `billing.tsx` en
  `hardcoded-copy.test.ts`.

2.3 **Retirar `packages/planka-import`**, junto con sus referencias en la
documentación.

2.4 **Retirar los despliegues que no usa el PC.**
- **Ficheros**: `Dockerfile.riuna`, `apps/web/nginx.riuna.conf`,
  `deploy/riuna-entrypoint.sh`, `compose.yml`, `compose.coolify.yml`, `charts/` y
  los flujos `helm-chart.yml` y `helm-validate.yml`.
- **CI**: quitar la entrada `Dockerfile.riuna` de `build-images.yml:32`.
- **Documentación**: `AGENTS.md` dice «Support both bundled same-origin deployments
  and separately hosted API and web deployments» y nombra `charts/riuna` y la
  sección *Releases*. Cambiarlo para que diga que el despliegue es
  `compose.local.yml`. Revisar también `ENVIRONMENT_SETUP.md` y `README.md`.
- **Se mantiene**: Redis sigue como opción. No se ha decidido nada sobre él.

2.5 **Retirar el paquete MCP stdio** `packages/mcp`.
- Con él desaparece la copia duplicada de las 71 herramientas.
- Quitar sus referencias en `README.md`, `SECURITY.md`, `ENVIRONMENT_SETUP.md`,
  `AGENTS.md`, `.devcontainer/devcontainer.json` y `docs/`.
- Revisar si `"riuna-mcp"` debe seguir en los clientes de confianza de
  `auth.ts:167`; solo lo usaba el flujo de dispositivo del paquete.

## Tanda 3 — Seguridad

No hay IDOR en ningún router: se repasaron los módulos uno a uno.

3.1 ✔ **ALTA. Registrarse con el correo de otra persona hereda sus invitaciones.**
- El alta con contraseña no verifica el correo (`auth.ts:240-251`).
- `utils/grant-pending-invitations.ts:27` y `check-registration-allowed.ts`
  conceden por coincidencia de correo, incluso con `DISABLE_REGISTRATION=true`.
- **Arreglo según D1**:
  - `DISABLE_REGISTRATION=true` en el PC, documentado en `docs/actualizar.md`;
  - una invitación solo se acepta con su enlace (id), o por correo si
    `emailVerified`;
  - el primer usuario (arranque del admin) sigue entrando.
- Va unido al 3.4.

3.2 ✔ **MEDIA. SSRF por redirección en los avisos.** `fetchWithTimeout`
(`notification-preferences/delivery.ts:22-35`) sigue redirecciones después de
validar el destino.
- **Arreglo**: `redirect: "manual"`, como en `plugins/generic-webhook/client.ts:46`.
- No copiar el cuerpo de la respuesta remota a errores ni al log.

3.3 ~ **MEDIA. `utils/assert-public-destination.ts`.**
- Ventana de DNS rebinding: hay que fijar la IP resuelta con un `lookup` propio.
- Faltan rangos: 198.18/15, 224/4, 240/4, 64:ff9b::/96 y 2002::/16.
- `notification-preferences/service.ts:332-371` devuelve el motivo exacto, lo que
  funciona como oráculo de DNS.

3.4 **MEDIA. Oráculo de cuentas en `add-workspace-member.ts`**: responde distinto
en `:100` y en `:143` y añade sin consentimiento. Responder siempre igual e invitar.

3.5 ✔ **MEDIA. `POST /notification` no lo usa nadie**
(`notification/index.ts:105-150`). Permite crearse avisos de cualquier tipo,
incluido `instance_alert`, que también sale por correo. Retirar la ruta.

3.6 **MEDIA. MCP OAuth.**
- Los tokens son sesiones completas de 30 días (`mcp/oauth.ts:123-133`).
- `/api/mcp/register` no tiene límite ni tope de clientes (`mcp/index.ts:75`).
- **Arreglo**: `limitByIp` en register, authorize y token; un tope de clientes; una
  caducidad menor.

3.7 **MEDIA. Las claves de API valen como sesión en `/auth/*`**
(`auth.ts:529`, `index.ts:638`): una clave filtrada puede crear otras claves.
Además, `utils/verify-api-key.ts:75-79` no aplica `rateLimitEnabled` ni `remaining`.

3.8 **BAJA.**
- `project:share` no se comprueba nunca (`project/index.ts:314-329`).
- WebSocket: el acceso solo se valida al conectar, sin `apiKeyId` ni comprobación
  de `Origin` (`index.ts:812-881`). Validar `Origin` y cerrar el socket al quitar a
  alguien del espacio.
- Secretos en claro en `integration.config` (los chats y el webhook genérico),
  mientras que avisos y automatizaciones ya cifran. Reutilizar ese cifrado.
- Límites flojos:
  - entrada anónima y OTP a 100 cada 10 s (`auth.ts:564-577`);
  - `/api/mcp/*` sin `limitByIp`.
- El PUT prefirmado no firma Content-Length (`storage/s3.ts:284-321`); cambia con
  el 9.2.
- Sesiones MCP legadas en un `Map` sin caducidad (`mcp/index.ts:45`).
- Sin `bodyLimit` global: unos 2 MB en `/api`, salvo subidas e importaciones.
- Los objetivos aceptan un proyecto de otro espacio (`write-goal.ts:108,133`).

**Comprobado y correcto:**
- MCP llama a la API con el token del usuario.
- Discord, Slack y Telegram solo aceptan dominios fijos.
- `sql.raw` solo recibe constantes.
- El manejador de errores es genérico y CORS no refleja orígenes en producción.
- La wiki guarda con `FOR UPDATE` y comprobando la versión.
- El primer admin entra con cerrojo.
- No hay `dangerouslySetInnerHTML`; mermaid va en `strict` y con DOMPurify.

## Tanda 4 — Tiempo real y datos frescos

4.1 ✔ **Los WebSocket se rinden a los 5 intentos (~31 s) y no se resincronizan**
(`hooks/use-user-websocket.ts`, `use-project-websocket.ts`).
- **Arreglo**: reconexión indefinida con backoff y jitter (tope de 30 s); reintentar
  en `online` y en `visibilitychange`; invalidar el ámbito al reabrir.
- Un hook común en lugar de la lógica duplicada.

4.2 ✔ **`refetchOnMount: false` global** (`query-client/index.ts:69`): lo invalidado
estando cerrado se reabre viejo, y ya hay 8 parches por hook.
- **Arreglo**: `true`, con `staleTime` global de 30-60 s, y retirar los parches.

4.3 ✔ **El tablero sondea la lista completa cada 30 s**
(`hooks/queries/task/use-get-tasks.ts:28`). Quitarlo, o activarlo solo con el
socket caído, después del 4.1.

4.4 ✔ **`use-project-websocket.ts:73` invalida la lista entera con cada evento**,
incluidos VIEW_UPDATED y COMMENT_UPDATED, y además `["cycle-report"]` global
(`:116`).
- **Arreglo**: filtrar por tipo y agrupar los avisos, como ya hace el canal de
  usuario.

4.5 ✔ **Mutaciones sin evento**: crear, editar, archivar y borrar proyecto; el CRUD
de columnas; `update-label`.
- **Arreglo**: publicarlos. Ojo con el canal de proyecto: `broadcastMessageSchema`
  es estricto con Redis.

4.6 ✔ **Las reimportaciones no publican lo actualizado** (`import-tasks.ts:163`,
`import-servitec.ts:202`). Usar `publishEventsPaced`.

4.7 ✔ **`bulk-update-tasks` publica sin pausas** y tiene un N+1 en addLabel
(`:276-298`).

4.8 **Claves de consulta.**
- Se invalidan claves que nadie usa: `["workspaces"]` ×4, `["workspace-invites"]`,
  `["comments", id]`.
- 371 claves en línea: crear fábricas por dominio, empezando por task, project y
  workspace.

4.9 **Copia del servidor en zustand** (`store/project.ts`, `board.tsx:161`,
`backlog.tsx:189`): dos fuentes de verdad. Se resuelve en gran parte con el 1.1.

4.10 **Efectos que reinician formularios en cada refetch**:
`notification-preferences-settings.tsx:218-234` y `:508`, `project-health.tsx:86`,
`work-schedule-section.tsx:51`, `close-day.tsx:80`, `weekly-review.tsx:107`.
Inicializar por id.

## Tanda 5 — Rendimiento

5.1 ✔ **El tablero carga archivadas y backlog en cada petición** (D6).
`get-tasks.ts:310-316` reparte en la misma respuesta `archivedTasks`
(`status = "archived"`) y `plannedTasks` (`"planned"`).
- **Arreglo**: el tablero pide solo los estados de sus columnas; backlog y archivo
  piden lo suyo, y el archivo paginado.
- Medir el backlog con unos miles de tareas y virtualizar solo esa lista si hace
  falta. Se queda fuera la virtualización del tablero, la lista y la tabla
  (`column-dropzone.tsx:51`, `list-view:568,629`, `table-view:178`).

5.2 ✔ **La lista devuelve `description` de cada tarea** (`get-tasks.ts:133`) y
ningún componente de lista la lee. Quitarla. **Requiere el 1.1**: el PUT de hoy
mandaría la descripción vacía. Al arrastrar ya no se usa, pero el Gantt sí (ver
el 1.1).

5.3 ✔ **`inArray` con un parámetro por tarea** (`get-tasks.ts:183`) choca con el
límite de 65.535. Usar un join o `= ANY(${sql.param(ids)}::text[])`.

5.4 ✔ **Subproyectos**: se carga cada hijo completo y en paralelo
(`get-tasks.ts:374-381`). Hacerlo en una sola consulta.

5.5 ~ **Decoraciones de todo el proyecto aunque se pagine**
(`get-tasks.ts:243-262`), y `tree-aggregates.ts:195-230` barre el proyecto. Medir
con `EXPLAIN`.

5.6 ✔ **`update-column.ts:64` reescribe `completed_at` en todo el proyecto.**
Acotar con `status = slug` e `IS DISTINCT FROM`.

5.7 ✔ **Un UPDATE por nodo** en `move-task.ts:278` y `shift-task-branch.ts:85-101`.
Usar `unnest`, como en `reschedule.ts:118`.

5.8 ✔ **Búsqueda.**
- `global-search.ts:166` no escapa `%` ni `_` (`escapeLikePattern` está en el mismo
  fichero).
- `ILIKE '%…%'` sin `pg_trgm` sobre descripción, actividad y wiki.
- Sembrar actividad y wiki en el banco, medir y decidir `pg_trgm` (la ADR 092 lo
  prevé).

5.9 ✔ **Índices.** Va junto al 5.2 de la Fase 9: confirmar con
`pg_stat_user_indexes` del PC antes de tocar nada.
- Borrar los 19 redundantes (lista al final).
- Indexar las FK que importan:
  - `task.recurrence_id`;
  - `personal_plan_entry.task_id` y `workspace_id`;
  - `dashboard_widget.goal_id` y `project_id`;
  - `goal_target.project_id`.
- Índices compuestos: `notification (user_id, created_at)` y, si se confirma,
  ~ `activity (task_id, created_at)`.

5.10 **Listas sin tope.**
- Sin límite: «sin planificar» del Planificador (`get-plan.ts:186`), lo urgente de
  Hoy (`today/queries.ts:53`), la actividad de una tarea, el árbol de la wiki y la
  línea base.
- `taskIds` sin `maxLength` en `task/index.ts:344`.
- `loggedSecondsByTask` suma en JS (`planner/queries.ts:115-132`).
- `get-goals.ts:92` hace las agregaciones en paralelo.

5.11 **Ampliar `scripts/bench-views.ts`**: línea base, cartera, Gantt con tareas
resumen, wiki, PDF y búsqueda con actividad.

5.12 ✔ **`apps/web/nginx.conf` no cachea nada.**
- `/assets/` como `immutable` a un año, e `index.html` con `no-cache`: así no se
  piden chunks que ya no existen tras desplegar.
- `X-XSS-Protection: 0`.
- Valorar una CSP en modo report-only.

5.13 ✔ **TipTap y shiki se cargan en todas las páginas**: `_layout` →
CommandPalette → CreateTaskModal → TaskDescriptionEditor → CommentEditor.
- `TaskDetailsSheet` se importa de forma estática en 15 rutas.
- La tarea espera a shiki para pintarse (`task/$taskId_.tsx:66`).
- La página pública monta el editor solo para leer.
- **Arreglo**: `lazy()` para el modal y los editores; `shiki/core` con las
  gramáticas a demanda; no bloquear el render.
- Hoy la carga inicial son 92 ficheros y 426 KB gzip, medidos sobre el dist del
  29-sep: volver a medir.

5.14 ~ **`_authenticated.tsx:10` llama a `getSession()`** en cada precarga al pasar
el ratón.

## Tanda 6 — Corrección menor

6.1 ✔ **El aviso de «vencida» salta a las 00:00 del día en que vence**
(`scheduler/due-date-reminders.ts:30-35`), porque los vencimientos son solo día. Y
una caída de más de 10 minutos lo pierde.
- **Arreglo**: ventana por día, como `utils/due-window.ts`, y reclamar con la tabla
  de enviados.

6.2 **El parte de horas pierde los cronómetros que cruzan la medianoche**
(`get-time-sheet.ts:93`).

6.3 ~ **Forzar `TimeZone=UTC` en el pool** (`database/index.ts:270`) en vez de solo
avisar.

6.4 **Posiciones leídas fuera del cerrojo**: `create-task.ts:87-99`,
`create-epic.ts:31`, `create-view.ts:52`, `create-field-definition.ts:123`,
`create-column.ts:60`.

6.5 ~ **El stand-up puede salir dos veces** si caduca el arrendamiento de 15 minutos
(`automation/standup.ts:87-155`).

6.6 ✔ **`localStorage` sin try/catch**: `routes/public-project.$projectId.tsx:34,44`
(rompe la página a un anónimo con el almacenamiento bloqueado) y
`use-board-filters.ts:88`.

6.7 **Textos fuera de i18n.**
- ~48 toasts muestran `error.message` en crudo, porque los fetchers lanzan
  `response.text()`.
- `hardcoded-copy.test.ts` no mira ternarios ni ficheros `.ts`.

6.8 **`confirm()` y `prompt()` nativos en 6 sitios**: toolbars de lote, avisos, el
enlace de los editores y el backlog. Pasarlos al diálogo propio.

6.9 **El filtro «espacio + proyecto no archivado + tarea no archivada» se repite en
11 ficheros.** Un helper, con `view/workspace-task-query.ts` como canónico.

## Tanda 7 — Limpieza

7.1 **API.**
- Dependencias sin uso: `@oslojs/crypto`, `@oslojs/encoding` y `@octokit/webhooks`.
- `drizzle-kit` a devDependencies.
- El bloque `overrides` de `apps/api/package.json` no hace nada en pnpm.

7.2 **Web.**
- Dependencias sin uso:
  - 17 `@radix-ui/react-*`, más `radix-ui` y `@radix-ui/react-slot` (`Slot` se
    sustituye por `useRender` de base-ui);
  - `highlight.js`, `lowlight` y `@tiptap/extension-code-block-lowlight`;
  - `react-markdown`, `turndown` (y gfm), `tippy.js`, `nanostores`, `cmdk`,
    `react-use-websocket`;
  - las dos devtools.
- Herramientas de build y `hono` a devDependencies.

7.3 **Código web muerto (~1.900 líneas).** Repasar cada uno con grep antes de
borrar.
- `tanstack/router.tsx`, `components/settings-layout.tsx`.
- `ui/{combobox, pagination, group, input-group, field, slider, menubar, meter,
  fieldset, checkbox-group, error-fallback}`.
- `lib/format-duration.ts`, `lib/to-kebab-case.ts`.
- Hooks sin uso: `use-sign-in`, `use-sign-up`, `use-change-password`,
  `use-send-password-reset`, `use-update-time-entry`, `use-get-invitation`.
- Fetchers sin uso: `create-activity`, `get-workspace-users`,
  `delete-workspace-user`, `create`/`delete`/`update-workspace`.
- `routes/test-error.tsx`, que llega a producción.

7.4 **Duplicados web.**
- `store/bulk-selection.ts` y `store/backlog-bulk-selection.ts` son idénticos.
- `bulk-toolbar` y `backlog-bulk-toolbar` comparten el 86 %.
- `comment-editor` y `rich-markdown-editor` comparten el ~59 % y ya divergen:
  sacar un núcleo común.
- `parseTaskDate` está tres veces.

7.5 **API.**
- La tabla `comment` no tiene uso (0 filas, sin referencias): migración que la
  borra.
- ~1.100 líneas de migraciones heredadas en código corren en cada arranque
  (`run-migrations.ts`). Comprobar en el PC que ya no hacen nada y retirarlas.
- `index.ts`:
  - una tabla de módulos en lugar de cuatro listas;
  - ping de WS duplicado;
  - `/openapi` sin caché.
- Dividir `task/index.ts`, `mcp/tools.ts` y `auth.ts`.
- Los 42 controladores de más de 150 líneas se parten cuando se toquen.

7.6 **Tipar `PermissionMap`** (`require-workspace-permission.ts:8`) contra
`@riuna/permissions`.

7.7 **Infraestructura.**
- `pnpm@10.7.0` en `apps/api/Dockerfile` y `apps/web/Dockerfile` → 10.32.1.
- Quitar el `sed` de `@kaneo` en `apps/api/Dockerfile`.
- `instrument.ts:2` carga `@sentry/profiling-node` aunque no haya DSN: pasarlo a
  `import()` dinámico.
- `/api/health` no comprueba la base.
- `publicBaseUrl` de `storage/s3.ts:148` no lo usa nadie.

7.8 **Repositorio.**
- Override de `noUndeclaredEnvVars` en `tests/` y `scripts/` (son los 88 avisos de
  Biome).
- `.github/FUNDING.yml` apunta al autor de Kaneo.
- `plans/` y `skills/` en la raíz son restos.
- TODO obsoleto en `members-table.tsx:306`.
- `AGENTS.md` dice Node 20.19; `engines` exige ≥24.
- 143 claves i18n posiblemente sin uso: cruzarlas con las 155 dinámicas antes de
  borrar (con el catalán, que se queda).
- Bases `*_test` sobrantes del devcontainer (solo local).

## Tanda 8 — Velocidad de desarrollo

8.1 ✔ **`packages/libs/src/hono.ts:59` usa `hc<AppType>` sobre el fuente de la
API**, así que el `tsc` de la web compila también la API: 4 GB, y sin `GOMEMLIMIT`
lo mata el sistema.
- **Arreglo**: tipos precompilados (`.d.ts` de la API) o clientes por router.

8.2 ✔ **La integración va en serie y trunca 69 tablas por prueba** (~30 min).
- **Arreglo**: una base por trabajador, clonada de una plantilla migrada, y truncar
  solo las tablas con filas.

8.3 **E2E con `workers: 1`** (~27 min). Valorar dos trabajadores con espacios
aislados.

## Tanda 9 — Operación

9.1 **Purga de lo caducado (D7)**: sesiones, verificaciones, códigos de dispositivo
y `mcp_oauth_state` vencidos.
- Un trabajo diario en `scheduler/index.ts`, con `withJobLease` y por lotes.

9.2 ✔ **Adjuntos en disco local (D5).** Hoy el PC no tiene S3: `storage/s3.ts:133`
lanza un `Error` plano y la subida da 500.
- **Diseño**: una interfaz de almacenamiento con dos implementaciones, S3 (la de
  hoy) y disco.
  - En disco, la «URL firmada» apunta a la propia API (un token de un solo uso, que
    valida tamaño y tipo).
  - El fichero va a un volumen de `compose.local.yml`.
  - `getPrivateObject` lo lee de ahí.
  - El flujo de la web (pedir URL → PUT → finalizar) no cambia.
- **Configuración**: si no hay ni S3 ni disco, 503 con mensaje y una bandera en
  `/config` para que la web oculte la subida.
- **Copias**: `scripts/backup/backup.sh` añade un `tar` del volumen; también
  `offsite.sh`, `restore.sh`, `simulacro.sh` y `docs/copias-de-seguridad.md`, que
  hoy dice «Hoy no aplica».
- **Pruebas**: integración de subida y lectura; e2e de pegar una imagen en una tarea
  y en la wiki.
- Su ADR.

---

## Índices redundantes (para el 5.9)

Cada uno es prefijo de otro índice de su tabla (medido en `riuna_e2e_test`; los de
facturación caen con el 2.2):
- billing_reminder_sent_userId_idx
- cycle_projectId_idx
- epic_projectId_idx
- external_link_integrationId_idx
- external_ref_workspaceId_idx
- integration_projectId_idx
- taskAssignee_taskId_idx
- task_epic_taskId_idx
- task_projectId_idx
- task_reminder_sent_taskId_idx
- user_avatar_userId_idx
- user_notification_workspace_project_ruleId_idx
- user_notification_workspace_rule_userId_idx
- user_notification_workspace_rule_workspaceId_idx
- view_workspaceId_idx
- workflow_rule_projectId_idx
- workspace_billing_workspaceId_idx
- activity_task_id_idx
- label_task_id_idx

## Verificación

- **Por punto**: una prueba que falla antes del arreglo. Los comandos están en la
  memoria «pruebas locales»:
  - integración con `DATABASE_URL=…/riuna_test`;
  - tsc de la web con `GOMEMLIMIT=2000MiB … -p tsconfig.app.json --singleThreaded`;
  - `pnpm --filter @riuna/api openapi:export` si cambia una ruta;
  - `pnpm i18n:schema` y `pnpm i18n:check` si cambian claves;
  - `biome ci .`.
- **Rendimiento**: `bench-views.ts` sobre una base `_bench` con 50.000 tareas, y
  `EXPLAIN` antes y después. No se borra ningún índice sin el informe del PC.
- **En el navegador**:
  - 1.1: arrastrar con dos sesiones y comprobar que no se pisan ediciones.
  - 4.1: parar la API 60 s y ver que la web se reconecta y se pone al día.
  - 9.2: pegar una imagen en una tarea y en la wiki.
- **Infraestructura**: el devcontainer no tiene Docker. Imágenes, nginx y copias se
  prueban con `restore-drill.yml` en CI o en el PC con `deploy/actualizar.sh`.
- **Migraciones de reparación y borrados de tablas** (1.2, 2.1, 2.2, 7.5): primero la
  consulta de diagnóstico sobre una copia de producción, como en el ensayo del
  3-oct.
