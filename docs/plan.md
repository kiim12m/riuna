# Riuna — Plan de desarrollo

> Documento vivo. Se actualiza al cerrar cada fase; el estado de la tabla de
> abajo manda sobre cualquier otra cosa escrita aquí.
>
> Complementarios: [auditoría de partida](auditoria-fase-0.md) ·
> [decisiones (ADR)](adr/) · [copias de seguridad](copias-de-seguridad.md)

## Estado

| Fase | Semanas | Estado |
|---|---|---|
| 0 — Fork, marca y auditoría | 2 | **Cerrada** — dos decisiones aplazadas (ver abajo) |
| 1 — Uso real y asignación por equipos | 2 | **Cerrada** — una deuda abierta (ver abajo) |
| 2 — Árbol de tareas y épicas | 4 | **Cerrada** — deuda abierta (ver abajo) |
| 3 — Campos personalizados | 4 | **Cerrada** — deuda abierta (ver abajo) |
| 4 — Motor de vistas y vista Tabla | 4 | **Cerrada** — deuda abierta (ver abajo) |
| 4.5 — Saneamiento | 5 | **Cerrada** — deuda abierta declarada (ver abajo) |
| 5 — Importación y exportación | 2 | **Cerrada** — deuda abierta (ver abajo) |
| **Subtotal: Riuna diferencial** | **23** | |
| 6 — Ejecución y productividad personal | 3 | Pendiente |
| 7 — Dashboards, informes y objetivos | 3 | Pendiente |
| 8 — Automatizaciones e importadores externos | 3 | Pendiente |
| 9 — Operación | 2 | Pendiente |
| **Total Bloque A** | **34** | |

**Estimación honesta:** 29 semanas nominales a ~8 h/semana son **8-11 meses**
reales para cerrar el Bloque A. La ventaja del fork no está en la fecha final,
sino en cuándo llega el valor: Riuna fue usable en la **semana 2** y la
plataforma diferencial —árbol, campos personalizados, vistas e importación—
llega en la **semana 18**. Escribiéndolo desde cero, en la semana 18 habría un
gestor de tareas básico y nada propio.

### Deuda abierta de las fases cerradas

**Fase 0** — nada de esto es visible para quien usa Riuna:
- ~~Renombrado interno~~ ✔ Hecho: clases y atributos CSS, variables de entorno
  (`RIUNA_*`), nombres de paquete (`@riuna/*`), artefactos de despliegue
  (`Dockerfile.riuna`, `charts/riuna`, imágenes `riuna`/`web`/`api`) y el
  discriminante `createdFrom`/`source` de las integraciones GitHub/Gitea
  (acepta `"kaneo"` y `"riuna"` en lectura, escribe `"riuna"`). Las etiquetas
  persistidas del editor (`<kaneo-mention>`, `<kaneo-issue-link>`, etc.) siguen
  parseándose por compatibilidad con contenido antiguo, aunque el editor ya
  solo escribe `<riuna-*>`.
- ~~Logos y favicon siguen siendo los de Kaneo.~~ Cerrado: sistema de marca
  aplicado, ver [`marca.md`](marca.md) y [ADR 005](adr/005-sistema-de-marca.md).
- ~~`package.json` en la versión `2.22.0` heredada de Kaneo.~~ Cerrado: se
  reinicia en `0.1.0`; la trazabilidad con Kaneo vive en `NOTICE` y en la
  [ADR 001](adr/001-fork-duro-de-kaneo.md), no en el número de versión.
- ~~Sentry apuntando a `kaneo-api` / `kaneo-web`.~~ Cerrado: la configuración
  como código nombra ya la organización `riuna` y los proyectos `riuna-api` /
  `riuna-web`, **preparada pero inactiva** — `SENTRY_DSN` está vacío y ni la
  API ni el web inicializan Sentry sin DSN. Activarlo es crear la organización,
  importar `sentry/*.json` y rellenar el DSN.
- ~~Enlaces de comunidad apuntando al Kaneo real.~~ Cerrado sin inventar nada:
  los enlaces de repositorio, issues y aviso privado de seguridad van al
  repositorio propio; el correo del mantenedor de Kaneo se ha retirado de
  `SECURITY.md` y el Discord de Kaneo de `CONTRIBUTING.md`. Riuna **no tiene
  todavía** buzón de seguridad, Discord ni web de documentación: los
  documentos lo dicen en vez de fingir que existen, y los enlaces a
  `kaneo.app/docs` se han sustituido por `.env.sample` y `docs/`.
- Código de facturación heredado: apagado por configuración, no eliminado.
- Catalán: 238 de 1.760 claves traducidas de verdad (13,5%); el resto es relleno
  en español. Lo gordo está en `settings`, `tasks` y `auth`.
- ~~`tests/api/mcp-internal-api-url.test.ts` vuelve a fallar.~~ Cerrado, y esta
  vez con la causa demostrada en vez de deducida. No era un doble de `fetch`
  que se perdiera: el primer caso importa la ruta MCP entera —el SDK, Hono, la
  autenticación y el resto del grafo— **dentro de su propio plazo de 5 s**. En
  reposo cuesta ~1,5 s; con turbo corriendo los ocho paquetes a la vez pasa de
  5 s y vitest lo da por caducado. Y **un caso caducado no se cancela: sigue
  corriendo**, así que su `fetch` tardío aterriza en el doble del caso
  siguiente, que falla por una llamada de más que no es suya. De ahí que el
  contador subiera en vez de bajar, y de ahí que a solas pasara. La intuición
  apuntada aquí —«algo de un caso anterior sigue vivo»— era correcta; lo que
  faltaba era por qué seguía vivo.

  Se reproduce de forma determinista bajando el plazo: con
  `--testTimeout=300` caducan dos casos y el tercero ve **tres** llamadas.
  El arreglo es un `beforeAll` que carga el grafo fuera del plazo de los casos,
  con el suyo propio holgado. El primer caso baja de 1.474 ms a 81 ms, y los
  tres pasan incluso con ese plazo de 300 ms, dieciséis veces más ajustado que
  el real, que es la guarda de verdad contra que vuelva a dormirse.

**Fase 1**:
- ~~Agrupación por equipo en las vistas.~~ Hecho: «agrupar por» cambia las
  secciones de la vista Lista y reparte el backlog en bandas de equipo. La
  decisión que faltaba —qué hace el tablero— es que **no agrupa**: sus columnas
  ya son la agrupación, y las calles horizontales son una fase pequeña, no un
  remate de esta. Razonado en la [ADR 009](adr/009-agrupacion-por-equipo.md).
- **Calendario y Gantt no filtran ni agrupan por nada** — ni por equipo ni por
  lo demás. Filtrar y agrupar llega hoy a tablero, lista y backlog. Dejarlos
  para la Fase 4, que es donde las cuatro vistas heredadas se conectan al mismo
  motor en vez de cablearse una a una, es la decisión tomada, no un olvido.
- ~~Cuentas locales para poder probar con varias personas.~~ Hecho: usuario y
  contraseña sin correo, creadas por el admin de instancia desde la página de
  miembros. Nació de aquí —probar el filtrado por equipo exige más de una
  persona en el espacio— y quedó como función de producto, ver
  [ADR 008](adr/008-cuentas-locales.md).
- ~~Tests de integración de los controladores nuevos.~~ Hecho: `task-team`,
  `task-assignees` y `local-account` en `tests/api-integration`, 26 casos.
  Las cuentas locales ya tenían pruebas unitarias con la base simulada; lo que
  faltaba —y es lo que estas añaden— era la base de verdad: el índice único que
  respalda el 409 del nombre de usuario, la fila de pertenencia al espacio y una
  sesión auténtica, porque `auth.api.createUser` no acepta una simulada y por
  eso estas pruebas se registran de verdad contra la API. Equipos y asignados
  múltiples no tenían nada.

  **Encontraron dos cosas al primer intento**, que es exactamente para lo que
  estaban:

  - `task_assignee` **no estaba en el registro de esquema** de
    `database/index.ts`, aunque `relations.ts` declarase `assignees:
    many(taskAssigneeTable)`. Los controladores importan la tabla directamente
    y por eso nada fallaba en producción, pero `db.query.taskAssigneeTable` no
    existía y la relación `task → assignees` no se podía recorrer. Arreglado
    registrando tabla y relaciones.
  - **Asignar exige `task:assign`, que solo tienen `admin` y `owner`.** Un
    miembro puede crear y editar tareas, pero no repartirlas: ni a una persona
    ni a un departamento. Viene de los roles heredados, no es de esta fase, y
    hoy queda documentado en las pruebas. Si el reparto por departamento tiene
    que estar al alcance de cualquier miembro, es una decisión de producto que
    se toma cambiando `packages/permissions`.
- ~~Persistencia de las preferencias de lectura.~~ Arreglado al repasar la
  agrupación en el navegador, que es donde se vio. Tanto `use-task-grouping`
  (nuevo) como `use-board-sort` (heredado de Kaneo, tocado solo por el
  renombrado) escribían en `localStorage` desde un efecto que dependía del
  valor. Ese efecto se dispara en el primer render con el valor inicial y pisa
  lo guardado antes de que el de lectura llegue a aplicarse; en `StrictMode`,
  que es como corre la aplicación, la segunda pasada de efectos lee ya el valor
  pisado y lo vuelve permanente. Elegías «Equipo» o «Prioridad», recargabas, y
  volvía al valor por defecto. Los dos leen ahora en la inicialización perezosa
  y escriben al cambiar, no desde un efecto.

  Lo aleccionador es por qué no saltó antes: `use-board-sort` **ya tenía
  pruebas**, y pasaban. Comprobaban el valor en memoria, que acaba siendo el
  correcto, en vez de comprobar que lo guardado sobrevive; y montaban sin
  `StrictMode`, sin el cual el fallo no se reproduce. Las guardas nuevas de los
  dos hooks fallan contra el código anterior, comprobado revirtiéndolo.
- Las tarjetas de tablero y lista muestran solo al responsable principal; la
  lista completa de asignados solo se ve en el detalle.
- ~~Falta la ADR de la asignación a equipos y los múltiples asignados.~~
  Escrita: [ADR 010](adr/010-asignacion-a-equipos-y-multiples-asignados.md).
  Conservar `assignee_id` como responsable principal y repetirlo dentro de
  `task_assignee` es una decisión estructural, y sin dejarla escrita la
  redundancia parecería un descuido dentro de un año.

**Fase 2**:
- **La importación y la exportación de tareas todavía no llevan jerarquía.**
  Toda tarea importada entra como raíz y el fichero exportado no dice de quién
  colgaba. Es de la Fase 5, donde el formato se generaliza a CSV y Excel, y así
  está anotado en el propio controlador.
- **Calendario y Gantt siguen sin filtrar ni agrupar** —la deuda de la Fase 1,
  que sigue apuntando a la Fase 4—. El Gantt sí sabe ya de jerarquía: dibuja el
  tramo de la rama cuando desborda al padre y rellena la barra con su progreso.
- **El orden entre hermanas comparte columna con el del tablero** (`position`).
  Arrastrar en el tablero reordena hermanas y al revés. Es intencionado, para
  no gastar una columna antes de que la vista Tabla de la Fase 4 diga si
  necesita un orden propio; queda escrito en la
  [ADR 011](adr/011-arbol-de-tareas-y-epicas.md) para que no parezca un olvido.
- **La profundidad heredada puede superar el límite del proyecto.** La
  migración no recorta lo que ya existía: el límite guarda los movimientos
  nuevos, no los datos viejos.
- **`Tab` y `Shift+Tab` solo actúan con una fila enfocada en el modo
  jerarquía.** Se entra al modo con `j`/`k`. Registrar el tabulador a todas
  horas dejaría la vista sin navegación por teclado, que es peor que pedir un
  gesto previo.
- **Sin medición de rendimiento todavía.** Los agregados se calculan al leer,
  acotados a las tareas que tienen hijas y apoyados en el prefijo
  materializado, pero el presupuesto —50.000 tareas, `EXPLAIN`, < 300 ms p95—
  se revisa al cerrar la Fase 4, que es cuando existe el motor que lo va a
  estresar.
- **Lo que las pruebas encontraron**, que es para lo que estaban:
  - **Los agregados leían las fechas una hora corridas.** La consulta de
    agregados es SQL crudo y node-postgres interpreta `timestamp` sin zona en
    hora local, mientras que drizzle lo interpreta en UTC. La rama empezaba
    antes que su propia hija. Se pide el valor en texto y se fija el criterio
    de drizzle.
  - **La subconsulta de recuento de las épicas apuntaba a sí misma.** Drizzle
    interpola una columna en la lista de selección sin cualificar, y dentro de
    una subconsulta `"id"` ya no es la fila de fuera. Cualificado a mano.
  - **`substring(texto from $n)` no compilaba.** Sin `::int`, Postgres no puede
    decidir entre la versión que corta por posición y la que corta por patrón.
    Reparentar y borrar devolvían un 500.
  - **Las dos `CHECK` del árbol hicieron fallar de golpe los quince ficheros de
    pruebas de integración heredados** que insertaban tareas a mano. Era la
    señal buscada: el mismo olvido en un controlador nuevo fallará igual de
    ruidosamente.
- **Lo que la pasada por el navegador encontró:** la ficha de épicas del
  lateral de propiedades solo estaba en una de las tres disposiciones que ese
  componente pinta —la compacta—, así que en la página de detalle no aparecía;
  el ajuste de jerarquía dependía de resolver antes el espacio de trabajo, que
  esa pantalla no tiene en la ruta, y se quedaba en blanco; y el disparador del
  selector de épicas iba envuelto en un `span`, que Base UI rechaza por perder
  la semántica de botón. Las tres arregladas.

**Fase 3**:
- **El tipo `relación` no está conectado a nada.** Existe en el vocabulario y
  la validación lo mantiene fuera del JSONB —su valor son filas de
  `task_relation`, que sí tiene integridad referencial—, pero nadie lo enlaza.
  El criterio de aceptación pedía «Cliente (relación)» y esa mitad no está.
- **Definir campos es cosa de `admin` y `owner`.** El rol `member` heredado
  tiene `project: ["create", "read"]` y no `update`, así que un miembro puede
  rellenar valores (`task:update`) pero no crear el campo. No es decisión de
  esta fase sino el vocabulario heredado, y es el mismo hallazgo que la Fase 1
  hizo con `task:assign`. Queda documentado en las pruebas y en la
  [ADR 013](adr/013-campos-personalizados.md).
- **No hay editor de definiciones.** Se crean desde el «+» de la vista Tabla;
  renombrar, archivar, borrar y reordenar existen en la API y no en la
  interfaz. Tampoco hay forma de crear un campo de alcance espacio de trabajo
  sin llamar a la API.
- **Cambiar un campo no deja rastro en la actividad**, mientras que cambiar el
  título sí. Se notará la primera vez que alguien pregunte quién tocó el
  presupuesto.
- **MCP no sabe de campos personalizados**: `create_task`, `update_task` y
  `list_tasks` los ignoran.
- **Los agregados del árbol no suben los campos numéricos.** Sumar un
  «Presupuesto» de toda la rama es previsible y no está.
- **Lo que las pruebas y el navegador encontraron:**
  - `state.expanded` de TanStack Table v9 **no siembra** el átomo que lee
    `getIsExpanded`. El árbol de la vista Tabla no se desplegaba nunca —el
    padre mostraba su contador de hijas y ninguna hija—, y typecheck, lint y
    172 pruebas pasaban con el fallo dentro. Se arregla con `initialState`.
  - `multi_select` caía al editor de texto y mandaba una cadena donde la API
    espera una lista, así que no se podía editar. Ahora es un menú de casillas.
  - El tipo `usuario` mostraba el identificador en crudo y había que teclearlo
    a mano. Ahora se elige de los miembros del espacio.

**Fase 4**. Hecho: el motor de filtros traduciendo a SQL, la vista Tabla con
edición en línea, la barra de filtros, los cuatro modos de jerarquía, las
vistas guardadas y compartidas, y el filtrado del Calendario y el Gantt
([ADR 014](adr/014-motor-de-filtros.md),
[ADR 015](adr/015-vistas-guardadas.md)).

**El criterio de aceptación no se cumple entero**, y se cierra igual a
sabiendas. De lo que pedía —«filtras `Presupuesto > 1000 AND estado != Hecho`,
agrupas por épica, guardas la vista, la compartes, y el mismo filtro funciona
en tablero, calendario y gantt»— falta agrupar por épica y que el filtro llegue
al tablero.

- **Tablero, Lista y Backlog siguen filtrando en el cliente.** No es que no
  filtren: filtran, con sus menús de prioridad, responsable, equipo, fecha y
  etiqueta, en memoria. Migrarlas **sustituye código que funciona** en las tres
  vistas de uso diario, y por eso se aplaza en vez de hacerse a última hora de
  una fase. Calendario y Gantt se hicieron primero justamente porque no
  filtraban: no había nada que romper.

  Cuando se haga, dos notas que ya están investigadas. El filtro de etiquetas
  actual **ya filtra por nombre**, implementado como un abanico de ids —
  `getLabelsByWorkspaceId` devuelve también las filas por tarea, y el menú
  selecciona todas las que comparten nombre y color—, así que moverlo al motor
  no cambia los resultados; solo deja de distinguir el color. Y los filtros de
  fecha relativos («esta semana») se preservan si el navegador traduce el rango
  a fechas absolutas antes de mandarlo, que es donde ya se calculan hoy.

- **No hay agrupación por épica** ni forma de elegir qué columnas se ven. Por
  eso una vista guardada solo recuerda el filtro y el modo de jerarquía.
- **Faltan los agregados del árbol como columnas** ordenables.
- **La paginación sigue siendo por desplazamiento**, no por cursor.
- **GIN no acelera los rangos**, que es el ejemplo estrella del plan. Y la
  consulta de «con subtareas» es un bucle anidado sobre `path`: es la primera
  candidata a mirar con `EXPLAIN`.
- **El presupuesto de rendimiento sigue sin medirse**: 50.000 tareas y
  < 300 ms p95. Se arrastra a la Fase 9, que es la otra que lo pedía.
- **Tres gestos sin probar en vivo**: elegir el tipo de un campo, editar un
  `multi_select` y cargar una vista del menú. Los tres son desplegables de Base
  UI, que no abren en un navegador headless porque no compone frames y sus
  transiciones no terminan. Lo que hay a cada lado del clic sí está verificado.
- **Lo que la verificación encontró**, que es para lo que estaba:
  - `state.expanded` de TanStack Table v9 **no siembra** el átomo que lee
    `getIsExpanded`: el árbol de la tabla no se desplegaba nunca, con typecheck,
    lint y 172 pruebas en verde. Se arregla con `initialState`.
  - TanStack Router **parsea la búsqueda con `JSON.parse`**, así que una cadena
    JSON llega ya convertida en array y comprobar `typeof === "string"` la
    descartaba en silencio: la URL se limpiaba sola y el filtro no se aplicaba.
  - `search: {}` al cerrar el detalle **borraba el filtro**: pinchar una fila te
    dejaba sin el filtro que la había encontrado.
  - Un 400 se reintentaba dos veces, así que un filtro inválido se veía como
    «no hay tareas» —cero resultados— en vez de como un error. Ninguna prueba
    lo habría visto: todas miran el resultado, no cuánto tarda en aparecer.


---

## Contexto

**Riuna** es una plataforma de productividad all-in-one **self-hosted**:
gestión de tareas y proyectos primero, CRM y ERP ligero después.

**Estrategia: fork duro de Kaneo** (MIT, v2.22.0) convertido en **programa
independiente**, sin sincronización con upstream. No se escribe desde cero: se
parte de una aplicación que ya funciona y el esfuerzo se concentra en lo que
Kaneo no tiene.

**Requisitos:**
- **Prioridad:** núcleo de tareas/proyectos y productividad primero; CRM/ERP después.
- **Escala:** decenas de personas, varios departamentos. **Sin permisos finos: todo el mundo ve todas las tareas.** Los departamentos sirven para *asignar tareas a un grupo de usuarios*, no para aislar información.
- **Jerarquía de tareas:** requisito destacado. Árbol padre→hijo a varios niveles **con agregados y cascada**, más **épicas** transversales dentro del proyecto.
- **Datos:** se empieza limpio, pero importar y exportar **CSV/Excel** es funcionalidad de producto, e importadores desde Trello/Jira/Asana/Notion entran en el plan.
- **Móvil:** consulta puntual (lectura y captura rápida).
- **Licencia:** se mantiene la vía permisiva por si algún día se quiere vender Riuna o instalarlo en clientes.
- **Ejecución:** una persona, ~8 h/semana, con Claude Code.

**Obligación legal, que es toda la que hay:** MIT permite modificar,
relicenciar los cambios, cerrar el código y vender Riuna. Lo único obligatorio
es **conservar el aviso de copyright y el texto de la licencia de Kaneo**, en
`LICENSE` y `NOTICE`.

**Referencia adicional:** **Dolibarr** (GPL-3+) para el modelo funcional de
CRM/ERP del Bloque B — *conceptual únicamente, no se copia código ni SQL*,
porque su licencia contaminaría el proyecto.

---

## Consecuencia del fork: qué reglas cambian

Al aceptar una base existente se adoptan sus decisiones. Varias
simplificaciones planteadas para un proyecto desde cero **dejan de aplicar**, y
forzarlas sería trabajo puro sin ganancia:

| Decisión previa | Qué pasa ahora |
|---|---|
| Árbol de contenedores `container` | **Descartada.** Se acepta `workspace → project → column → task`. Su argumento fuerte eran los permisos heredados, que no hacen falta |
| Tipado con Hono RPC | **Innecesaria.** Kaneo ya trae un cliente Hono tipado en `packages/libs`, consumido desde `fetchers/` + TanStack Query |
| Sin Redis | **Descartada.** Su despliegue ya lo contempla; no se pelea con la infraestructura que funciona |
| `workspace_id` en todas las tablas | Solo en las tablas **nuevas** que cree Riuna |
| Español sin capa de i18n | **Descartada.** Kaneo ya trae i18next: español por defecto y traducir lo que falte |

**La regla nº 1 pasa a ser: seguir las convenciones de Kaneo, no imponer
otras.** Un fork con dos estilos conviviendo envejece peor que uno con un
estilo imperfecto pero consistente. Está recogido en
[`AGENTS.md`](../AGENTS.md).

**Lo que sí se mantiene**, porque es aditivo y sigue siendo correcto:
- Campos de tipo relación **fuera del JSONB** (Kaneo ya tiene `taskRelation`).
- Tabla `external_ref` para que **toda importación sea idempotente**.
- Borrado suave en las tablas nuevas (`deleted_at`), alineado con su `archivedAt`.
- **Presupuesto de complejidad** en `CLAUDE.md`.
- **Presupuesto de rendimiento:** toda vista nueva pagina y responde en < 300 ms p95 con 50.000 tareas, revisado con `EXPLAIN`.

---

## Inventario: qué se hereda ya hecho

Trabajo que Riuna **no** tiene que hacer:

**Backend** (Hono + Better Auth + Drizzle + PostgreSQL + Redis): workspaces,
`team` + `teamMember`, invitaciones y roles; proyectos, columnas y tareas con
numeración por proyecto, prioridad, fechas y orden; relaciones `subtask` /
`blocks` / `related`; etiquetas, comentarios, actividad y **registro de
tiempo**; adjuntos; notificaciones por email/ntfy/Gotify/webhook con
preferencias por usuario y workspace; búsqueda; integraciones GitHub, Gitea,
Discord, Slack, Telegram y webhooks genéricos; servidor MCP, claves de API,
OAuth y device flow; WebSockets en tiempo real; importación y exportación de
tareas; migraciones y arranque orquestado.

**Frontend** (React 19 + Vite + TanStack Router/Query + Tailwind + Radix):
vistas **Tablero**, **Kanban**, **Lista**, **Backlog**, **Calendario** y
**Gantt** —todas escritas a mano, sin librerías de terceros—, selección
múltiple, paleta de comandos ⌘K, búsqueda, editor TipTap, ajustes, onboarding,
invitaciones, i18n y tema claro/oscuro.

**Operación:** Docker Compose, imagen única o separada, Helm y Coolify.

**Huecos reales — esto es lo que construye Riuna:**

| Hueco | Estado |
|---|---|
| Asignación a **equipos** y **múltiples asignados** | **Hecho** (fase 1) |
| Gestión de equipos (crear, renombrar, miembros) | **Hecho** (fase 1) |
| **Subtareas reales en árbol**, con agregados y cascada | **Hecho** (fase 2) |
| **Épicas**: grupos transversales dentro del proyecto | **Hecho** (fase 2) |
| Campos personalizados | **Hecho** (fase 3) |
| Motor de vistas: filtros guardados, agrupación, columnas, **vista Tabla editable** | **Hecho** (fase 4), salvo agrupación y columnas configurables |
| Importación CSV/Excel genérica con mapeo | Hay import/export de tareas; hay que generalizarlo |
| Dashboards, widgets, informes y objetivos/OKR | No existe |
| Automatizaciones de usuario | Solo `workflowRule` para eventos de integración |
| Ciclos/sprints, recurrentes, plantillas, "Mi trabajo" | Confirmado inexistente en la auditoría |
| CRM y ERP | No existe (Bloque B) |

---

# BLOQUE A — Productividad

### Fase 0 — Fork, marca y auditoría · **cerrada**
Clonar Kaneo con historia propia conservando `LICENSE` y añadiendo `NOTICE`.
Levantar el entorno, aplicar la marca Riuna, apagar la facturación y escribir
la auditoría de huecos que afina el resto del plan con hechos.
**Hecho cuando:** Riuna corre con su marca, en español, sin rastro de
facturación, y estás dentro creando tareas reales. ✔

### Fase 1 — Uso real y asignación por equipos · **cerrada**
**Dogfooding desde aquí: el desarrollo de Riuna se gestiona dentro de Riuna.** ✔
Asignación a un **equipo** y **múltiples asignados** (`task_assignee` aditiva,
sin romper el `userId` existente) ✔, con filtrado y agrupación por equipo en
tablero, lista y backlog ✔ —el tablero filtra pero no agrupa, ver
[ADR 009](adr/009-agrupacion-por-equipo.md)—.
**Copias automáticas con restauración probada** ✔.
**Hecho cuando:** asignas una tarea a un departamento entero, la ves filtrada
por equipo, y restauras un backup sin perder nada. ✔

### Fase 2 — Árbol de tareas y épicas · **cerrada**
*Fue antes del motor de vistas a propósito: si el motor nace sin saber de
jerarquía, hay que retrofitear el renderizado en árbol, los agregados como
columnas y los filtros de subárbol en las cuatro vistas.*

**Árbol real** ✔: `parent_id` manda y `path`/`depth` son su forma
materializada, con dos `CHECK` que vigilan la coherencia en la propia base de
datos. Validación anti-ciclo al reparentar y profundidad máxima por proyecto.
La relación `subtask` **se retira**: una migración de un solo sentido la
convierte en punteros de padre y baja a `related` lo que no puede convertir.
Razonado en la [ADR 011](adr/011-arbol-de-tareas-y-epicas.md).
**Agregados del subárbol** ✔: progreso, fechas heredadas, estimación y tiempo
sumados, calculados al leer sobre el prefijo materializado —no con una
recursiva por tarea— y acotados a las tareas que tienen hijas. Una tarea
archivada no entra en ningún agregado.
**Cascada configurable por proyecto** ✔, apagada por defecto: cerrar y
archivar se propagan hacia abajo. Mover un subárbol de proyecto se lo lleva
entero y reclama números nuevos allí.
**Épicas** ✔: `epic` por proyecto y `task_epic` muchos-a-muchos, con filtro en
tablero, lista y backlog.
**Frontend** ✔: la jerarquía es un modo de «agrupar por» en la vista Lista
—árbol plegable, sangría, contador de subtareas—, con `Tab` / `Shift+Tab` para
sangrar y promover, arrastre para colgar una tarea de otra, y barras de resumen
en el Gantt. La estimación se edita en el detalle, en horas.
**Hecho cuando:** descompones una tarea en tres niveles, el padre muestra
progreso y fechas reales de su rama, cerrarlo baja en cascada, y filtras un
tablero por épica. ✔

### Fase 3 — Campos personalizados · **cerrada**
`field_definition` (texto, número, moneda, select, multi-select, fecha,
checkbox, usuario, URL, relación→`taskRelation`) por proyecto o por workspace,
y `custom_fields jsonb` con índice GIN en `task`. Validación contra la
definición, en un módulo `fields/` con la convención de Kaneo.
Frontend: editor de campos en ajustes de proyecto, y edición en el detalle y en
las tarjetas.
**Hecho cuando:** defines "Presupuesto (moneda)" y "Cliente (relación)" en un
proyecto y los rellenas desde el detalle de la tarea.

### Fase 4 — Motor de vistas y vista Tabla · **cerrada**
Tabla `view` con `type` + `config jsonb` (árbol de filtros, orden, agrupación,
columnas), un registro de descriptores que mapea cada campo lógico a su columna
real o a su ruta JSONB, y un traductor único a SQL de Drizzle con paginación
por cursor.
**Vista Tabla** editable en línea con TanStack Table — lo único que conviene
tomar de fuera (headless y MIT), y que además trae **sub-filas nativas**, justo
lo que el árbol de la Fase 2 necesita.
Consciente de la jerarquía desde el diseño: agregados como columnas ordenables,
filtros "solo raíces / aplanar árbol / incluir subtareas" y agrupación por
épica.
**Y lo más rentable de la fase:** conectar las vistas que **ya existen**
—Tablero, Lista, Calendario, Gantt— al motor de filtros y agrupación, en lugar
de escribirlas.
**Hecho cuando:** filtras `Presupuesto > 1000 AND estado != Hecho`, agrupas por
épica, guardas la vista, la compartes, y el mismo filtro funciona en tablero,
calendario y gantt.

### Fase 4.5 — Saneamiento · **cerrada**

*No estaba en el plan. Sale de mirar las cuatro fases cerradas en conjunto, que
es algo que nadie había hecho: cada una documentó su deuda desde dentro.*

**38 problemas, 13 graves**, casi ninguno recogido hasta ahora. No son fallos de
diseño de las fases: son **huecos entre superficies** —lo que este documento
llama «seguir un cambio hasta el final»— y **carreras que solo aparecen con más
de una persona a la vez**, que es justo lo que el dogfooding de la Fase 1
habilitó.

**Lo que pierde datos** ✔:
- Cuatro caminos escribían `assignee_id` sin tocar `task_assignee`. El conjunto
  divergía, los filtros por asignados no veían esas tareas, y MCP podía borrar
  una asignación que la interfaz restauraba sola después.
- **Dos reparentados concurrentes creaban un ciclo `A→B→A`** con las dos `CHECK`
  satisfechas, y las dos ramas desaparecían de la vista. Reproducido: ambas
  peticiones devolvían 200. Cerrado con un cerrojo por proyecto en los cuatro
  escritores del árbol, que ahora leen dentro de su transacción
  ([ADR 016](adr/016-cerrojo-de-arbol-por-proyecto.md)).
- `moveTask` —la única operación que cruza la frontera de proyecto, y no tenía
  **ninguna** prueba— se llevaba épicas ajenas, aplanaba el estado de toda la
  rama (lo terminado se reabría, lo archivado se desarchivaba), ignoraba el
  límite de profundidad del destino y arrastraba campos del proyecto de origen.
- La cascada de cierre desarchivaba descendientes.
- Los campos personalizados se leían, fundían y reescribían sin transacción:
  tabular entre dos celdas de la vista Tabla podía perder el valor anterior.

**Filtros que devolvían la respuesta equivocada** ✔: las fechas de campo
personalizado se comparaban como texto contra un instante serializado —`eq` no
casaba nunca, `neq` casaba siempre—; archivar un campo devolvía 400 en el
listado **entero** para cualquier vista guardada que lo filtrase; un filtro de
pertenencia sin valor generaba `IN ()` y un **500**; `isEmpty` sobre una columna
de texto no encontraba nada; y una casilla no se podía filtrar desde la
interfaz.

**Seguridad** ✔: el endpoint de proyecto público **sin autenticar** devolvía
`custom_fields` —donde la ADR 013 pone «Presupuesto» y «Cliente»—, épicas,
equipo, estimación y la forma del árbol, porque reutilizaba `getTasks` y las
Fases 2 y 3 le añadieron campos sin revisar quién más lo llamaba. Una clave de
API de solo lectura podía crear y compartir vistas. Y el dominio sintético de
las cuentas locales no estaba reservado en el registro.

**Eventos que no escuchaba nadie** ✔: `task.assignees_changed` —el camino que usa
la interfaz principal— tenía **cero suscriptores**: añadir a alguien a una tarea
no le llegaba por ningún canal. Asignar a un equipo tampoco avisaba a sus
miembros, que es literalmente el requisito que motivó la Fase 1. Y tres cambios
de estado no dejaban rastro en la actividad; la reasignación era además una
**regresión** respecto a Kaneo.

**Rendimiento, medido por primera vez** ✔. Con el banco de 50.000 tareas y
árboles de 5 niveles que el plan pide desde la Fase 2:

| Consulta | Antes | Después |
|---|---|---|
| Agregados del árbol (cada carga de vista) | **6.769 ms** | **36 ms** |
| Filtro «con subtareas» | **28.313 ms** | **41 ms** |
| Importar 5.000 filas | **33,0 s** | **7,1 s** |

Y de punta a punta, con **50.000 tareas en un solo proyecto**, que es el
escenario que fija el presupuesto:

| Petición | Antes de esta fase | Después |
|---|---|---|
| Listado paginado (100 filas) | — | **121 ms** ✔ |
| Listado paginado con filtro | — | **160 ms** ✔ |
| Listado con filtro, sin paginar | — | 177 ms ✔ |
| Listado con filtro + subtareas | — | 308 ms |
| **Listado completo sin filtro** | — | **1.750 ms** ✘ |

**El servidor cumple el presupuesto cuando se le pide una página.** Lo que no
cumple es devolver el proyecto entero, que es justo lo que el cliente le pide
siempre. Esa es ahora la única frase que resume lo que falta.

Medir dio además un tercer hallazgo que no estaba en la auditoría: paginar a
100 filas solo bajaba de 1.532 ms a 286 ms, porque **242 ms eran fijos** —los
agregados se calculaban para el proyecto entero aunque la respuesta llevara
cien filas—. Acotados a las tareas devueltas, esa petición pasó de 286 a
121 ms. Sin el banco de pruebas, paginar habría parecido no servir de nada.

Los dos primeros eran el mismo error: unir por prefijo de `path` con un patrón
que depende de la fila externa, que ningún índice puede servir. Los ancestros de
una tarea son los segmentos de su propio camino, así que la unión se hace por
igualdad de ids. Los agregados pasaron de 38,2 millones de comparaciones
descartadas a ninguna, y el filtro dejó de reejecutar un subplan 9.519 veces.

**Un hallazgo se refutó al medirlo**: el índice `(project_id, position)` que la
auditoría proponía para el tablero. El planificador no lo usa —prefiere el
barrido por `project_id` y una ordenación en memoria— y el tiempo es idéntico
(11,9 ms frente a 11,7 ms). No se añade. Es exactamente para esto que el banco
de pruebas hacía falta.

**Despliegue** ✔: las migraciones 0045-0050 corren en una sola transacción que
deja `task` bajo `ACCESS EXCLUSIVE`, y el chart no tenía `startupProbe`: en una
instalación con datos, Kubernetes mataba el pod a mitad de migración y entraba
en CrashLoopBackOff. Añadidos `startupProbe`, cerrojo consultivo alrededor de
`migrate()` y `lock_timeout`. Documentadas las 17 variables de entorno que la
API leía y no estaban en ningún sitio, con una guarda en CI que impide que se
repita.

**Catalán** ✔: retirado de `supportedLocales`. Tenía las 1.879 claves pero solo
250 valores (13,3%) traducidos de verdad; el resto era español copiado, y la
paridad de claves lo disimulaba. Un navegador en catalán cae al español, que es
lo que ya veía, pero sin la promesa falsa.

**Prerrequisitos de la Fase 5** ✔: creada la tabla `external_ref`, que
`AGENTS.md` daba por hecha y no existía —`import-tasks` no tenía idempotencia de
ninguna clase—, y añadido el índice único que le faltaba a `external_link` desde
la 0009, con la limpieza previa de duplicados que exige una instalación con
datos.

**Deuda abierta de la Fase 4.5**, declarada a sabiendas:

- **Las vistas no paginan, y se cierra la fase igual.** El cliente no manda
  `page` ni `limit`, así que cada carga trae el proyecto entero. La decisión se
  tomó con la curva medida delante:

  | Tareas en un proyecto | Listado sin filtro | |
  |---|---|---|
  | 500 | 41 ms | ✔ |
  | 2.000 | 89 ms | ✔ |
  | 5.000 | 215 ms | ✔ |
  | 10.000 | 469 ms | ✘ |
  | 50.000 | 1.547 ms | ✘ |

  **El presupuesto se cruza en torno a las 6.500 tareas en un mismo proyecto.**
  Por debajo de eso no hay problema, y llegar ahí a este ritmo lleva años.
  Paginar de verdad toca las cinco vistas y cambia listas infinitas por
  paginadas: es una decisión de producto, no un arreglo, y no se toma a las
  seis semanas de una fase de saneamiento.

  Lo que sí se ha hecho es que el límite **avise solo** en vez de descubrirse
  como lentitud: `ProjectSizeWarning` sale por encima de 5.000 tareas en el
  tablero, la lista y la vista Tabla. El caso a vigilar es la propia Fase 5,
  cuyo criterio de aceptación —importar 5.000 filas— deja un proyecto justo en
  el borde. La Fase 9 lo retoma si hace falta.

- **`dueDate eq <día>` sobre columnas `timestamp` sigue comparando un
  instante.** El caso grave —los campos personalizados— está arreglado. Este
  exige decidir en qué zona horaria vive «un día», que es otra decisión de
  producto.

- **Los índices de rango sobre `custom_fields`.** El envoltorio `CASE` que
  protege del tipo equivocado impide que un índice de expresión llegue a usarse
  ([ADR 013](adr/013-campos-personalizados.md)). Medido: `Presupuesto > 1000` es
  un barrido de 12 ms sobre 10.000 tareas, así que no corre prisa.

- **Las pruebas de componente del web** no arrancan en el contenedor de
  desarrollo: los workers de jsdom caducan al iniciarse. Todo lo que sí arranca
  pasa, y CI las ejecuta enteras.
- **`dueDate eq <día>` sigue comparando un instante.** Arreglado el caso de los
  campos personalizados, que era el grave; el de las columnas `timestamp` exige
  decidir en qué zona horaria vive un «día», y eso es una decisión de producto.
- **Los índices de rango sobre `custom_fields`.** El envoltorio `CASE` que
  protege del tipo equivocado impide que un índice de expresión llegue a usarse.
  Medido: `Presupuesto > 1000` es un barrido, pero de 12 ms sobre 10.000 tareas,
  así que no es urgente.
- **Las pruebas de componente del web** no arrancan en el contenedor de
  desarrollo (los workers de jsdom caducan). Corren en CI.

**Fase 5**:
- **El asistente de importación no se ha pasado por el navegador.** La API está
  probada de punta a punta —19 casos de integración, más el banco de 5.000
  filas—, pero los cuatro pasos del asistente web (elegir fichero, mapear
  columnas, confirmar tipos, ver el informe) solo tienen el typecheck. Es la
  misma deuda que la Fase 4 declaró con los desplegables de Base UI, que no
  abren en un navegador headless.
- **Reordenar hermanas solo actúa sobre grupos completos.** Si el fichero no
  trae todas las hijas de un padre, ese grupo conserva su orden y el informe lo
  cuenta (`siblingGroupsKept`). Reordenar un grupo a medias mezclaría el orden
  viejo con el nuevo. Reordenar entre ficheros parciales —una vista filtrada que
  reordena unas pocas— seguiría necesitando otro mecanismo, y no lo tiene.
- **Reordenar hermanas mueve también su posición en el tablero**, porque `path`
  y el tablero comparten la columna `position` desde la Fase 2 ([ADR 011]
  (adr/011-arbol-de-tareas-y-epicas.md)). Es coherente con el modelo actual, no
  un efecto secundario nuevo, pero se nota.
- **La hoja de SERVITEC sigue sin importarse.** Se exporta y ahora comparte la
  conversión de fechas con el motor, pero no hay camino de vuelta desde ese
  `.xlsx` concreto: su cabecera doble («Fecha»/«FECHA») y su fila-leyenda no son
  el formato de intercambio. Entra en la Fase 8 con los importadores externos si
  hace falta.

### Fase 5 — Importación y exportación (≈2 semanas) · **cerrada**
Generalizar los controladores existentes a **CSV y Excel** con mapeo de
columnas, creación automática de campos personalizados e idempotencia vía
`external_ref`. La jerarquía y las épicas se preservan en ambos sentidos.
Exportación de cualquier vista con sus filtros aplicados.
**Hecho cuando:** importas un Excel de 5.000 filas con jerarquía, creando
campos solo, lo reimportas sin duplicar nada, y exportas una vista filtrada. ✔

**El formato no se generalizó: se definió**, y esa fue la mitad del trabajo. La
decisión y sus costes están en la
[ADR 017](adr/017-formato-de-intercambio.md). Lo que la hoja heredada perdía en
silencio —las etiquetas que el export emitía y el validador del import
descartaba— y lo que no sabía expresar —jerarquía, épicas, campos
personalizados, estimación, equipo, asignados múltiples— ya viaja.

**La jerarquía va como numeración de esquema** (`1`, `1.1`, `1.1.2`), elegida
sobre una columna «padre» y sobre columnas por nivel. Es frágil por diseño
—insertar obliga a renumerar— y por eso lleva cinco reglas explícitas que
impiden que un número mal escrito reparente en silencio. La que más importa es
la que hace segura la reimportación de una **vista filtrada**: si el padre que
el esquema nombra no viene en el fichero, la tarea conserva el que ya tiene.

**Lo hecho y probado:**
- Motor de intercambio en `apps/api/src/task/exchange/`: vocabulario de
  columnas, lector de `.csv`/`.xlsx`, escritor, numeración de esquema,
  inferencia de tipos, mapeo de filas y escritura por lotes.
- Importador reescrito: idempotente por `ID` y por `Referencia` contra
  `external_ref` —que estrena escritores—, con jerarquía, épicas, etiquetas,
  campos personalizados, equipo, asignados múltiples y estimación. Una
  transacción, cerrojo de proyecto, inserciones de 500 y actualizaciones por
  lotes con `unnest`.
- Ensayo en seco (`dryRun`) que recorre el camino real y deshace al final.
- Subida por multipart con `bodyLimit`, que es **superficie nueva**: hasta ahora
  la única subida iba por URL prefirmada de S3.
- Exportación a `.csv`/`.xlsx` de cualquier vista, pasándole la misma búsqueda
  que vive en la URL, que es el punto 3 de la [ADR 015](adr/015-vistas-guardadas.md).
- Asistente web de cuatro pasos con mapeo de columnas y tipo confirmado.
- **No hizo falta migración ni dependencia nueva ni permiso nuevo.**

**Medido** contra la línea base de la 4.5 (5.000 filas, árbol de tres niveles,
importador viejo: 7,1 s):

| 5.000 filas | Antes (4.5) | Ahora |
|---|---|---|
| Importar (alta) | 7,1 s | **6,6 s** |
| Reimportar (update) | — (nunca medido) | **6,1 s** |

El importador nuevo hace bastante más por fila —jerarquía, épicas, etiquetas,
campos personalizados, equipo, asignados múltiples, idempotencia vía
`external_ref`, y ahora el reordenado de hermanas— y aun así entra por debajo del
viejo, porque el viejo hacía ~4 viajes por fila y este va en una transacción con
inserciones de 500 y `UPDATE … FROM unnest`. La reimportación reordena las 5.000
filas y sigue por debajo de la línea base.

**Lo que la verificación encontró** (dos cosas, ninguna de diseño):
- Una fila **sin la columna `Título`** se rechazaba con «The row has no title»
  aunque **casara con una tarea existente**. Rompía actualizar por fichero
  parcial —reimportar una vista filtrada, o un fichero que solo mapea
  `Etiquetas`—. La exigencia de título pasa a ser solo para filas nuevas, que es
  lo que ya decía la [ADR 017](adr/017-formato-de-intercambio.md) punto 3: una
  columna ausente no puede vaciar lo que ya hay. Lo cazó la prueba de que un
  fichero de solo etiquetas no borra asignados ni épicas.
- Una prueba de `task-assignees` seguía llamando a la API de import vieja
  (JSON `{tasks:[…]}`), que la fase sustituyó por multipart; devolvía 400.
  Reescrita a la nueva, misma aserción.

**SERVITEC absorbido.** La conversión de fechas que su hoja descubrió vive en
`exchange/sheet-dates.ts` y la comparten el motor y la plantilla; el controlador
de SERVITEC la importa directa del motor, sin la reexportación puente que había.
Sus pruebas de formato de fecha pasan a `tests/api/task/exchange/sheet-dates.test.ts`
—que estrena cobertura de `parseSheetDate`—; en `servitec-workbook.test.ts` queda
lo que es de la plantilla: el mapeo de estado y la forma del `.xlsx`. La hoja no
cambia: sigue siendo su propio módulo, que es lo que dice la
[ADR 017](adr/017-formato-de-intercambio.md) punto 8.

**Hermanas reordenadas al importar.** Con `Esquema` mapeado, el orden de las
filas decide también el orden entre hermanas, no solo de quién cuelgan. Se aplica
solo a los grupos que el fichero trae **enteros** —toda hija que Riuna ya tiene
aparece en el fichero—: reordenar medio grupo entrelazaría el orden viejo con el
nuevo, así que un grupo incompleto se deja quieto y el informe lo cuenta
(`siblingGroupsKept`). Es la misma prudencia que la regla 3 del esquema. `position`
es la columna que comparten árbol y tablero (ADR 011), así que esto reordena
también esa columna del tablero; no hay una segunda que gastar.

**Adelantado en su día:** el cuadro de tareas de SERVITEC ya se exportaba en
`.xlsx` desde los ajustes del espacio de trabajo antes de la fase
([ADR 012](adr/012-exportacion-a-excel.md)).

*Semana 18: Riuna ya es la plataforma diferencial. Lo que sigue es mejora
incremental sobre algo vivo y en uso.*

### Interludio — Mejora visual e interactiva (antes de la Fase 6)

Pasada de UX previa a la Fase 6 para dar aspecto diferencial. Se decidió sobre
maquetas HTML ([`design-previews/`](design-previews/)) y quedó escrita en las
[ADR 018–022](adr/): escala tipográfica, densidad configurable, escala de
elevación, sistema de movimiento y rail de la barra lateral.

**Hecho y verificado** (build + typecheck + Biome + pasada manual en navegador):
resalte en tiempo real (cierra el principio 5 de marca), entrada de tarjeta y
*stagger*, skeletons unificados a *shimmer* con respeto a `prefers-reduced-motion`,
rail de iconos en la barra lateral, tarjetas del tablero enfocables por teclado,
casilla real en el filtro del tablero, y densidad compacta conmutable desde
ajustes (consumida por el tablero).

**Deuda declarada:** la adopción de los tokens de elevación (`shadow-e1..e4`) y
de la escala tipográfica es **incremental** —lo dicen las ADR 018 y 020, «no hay
un corte único»—; hoy los tokens existen y solo el tablero consume densidad. El
**compositor de tarea en línea** al pie de columna queda para una pasada propia:
es función nueva, no pulido.

### Fase 6 — Ejecución y productividad personal (≈3 semanas)
**Mi trabajo** (tareas propias de todos los proyectos), bandeja unificada,
**ciclos/sprints** con velocidad y burndown apoyados en el registro de tiempo
existente, tareas recurrentes y plantillas de proyecto y de tarea (incluidas
**plantillas de árbol**, que despliegan su jerarquía completa).
**Hecho cuando:** cierras un sprint y ves velocidad real y horas por persona.

### Fase 7 — Dashboards, informes y objetivos (≈3 semanas)
`dashboard`, `dashboard_widget`, `goal`, `goal_target`. Widgets (recuento por
filtro, tarta/barras, tendencia, tiempo registrado, avance por épica, tabla
embebida) sobre el **motor de vistas de la Fase 4** más una capa de agregación.
Objetivos con progreso automático. Exportación de informes a Excel.
**Hecho cuando:** montas un panel de 5 widgets que se recalculan solos y un OKR
trimestral que avanza al cerrar tareas.

### Fase 8 — Automatizaciones e importadores externos (≈3 semanas)
Motor disparador → condición → acción (`automation`, `automation_run`) sobre
los eventos que Kaneo ya emite, ampliando su `workflowRule` en lugar de
sustituirlo. Acciones: cambiar campo, asignar, crear tarea, notificar, webhook.
**Importadores desde Trello, Jira, Asana y Notion**, conservando la jerarquía y
los identificadores en `external_ref`, con adjuntos y comentarios.
**Hecho cuando:** importas un tablero real de Trello con sus adjuntos y una
regla mueve la tarea, avisa y dispara un webhook sin intervención.

### Fase 9 — Operación (≈2 semanas)
Logs estructurados, métricas, límites de tasa, repaso de índices con datos
reales, responsive de las pantallas de consulta móvil, Playwright de humo,
**copias fuera de la máquina** y guía de actualización propia de Riuna.
**Hecho cuando:** restauras un backup en limpio y la suite de humo pasa contra
esa instancia.

---

# BLOQUE B — CRM y ERP ligero (posterior)

Marco para que las decisiones de hoy no lo bloqueen. Modelo funcional guiado
por Dolibarr, implementación propia sobre los motores de las Fases 2, 3 y 4.

### Fase 10 — CRM base
`company` (tercero: cliente / proveedor / prospecto en la misma entidad, como
el `llx_societe` de Dolibarr — evita duplicar la ficha cuando un cliente
también te vende), `contact` y `deal`, con el **pipeline montado como un
proyecto con sus columnas**: tablero, calendario, filtros, comentarios,
actividad, adjuntos, notificaciones, importación y automatizaciones ya
funcionan sobre él.
Vinculación deal ↔ proyecto ↔ tareas reutilizando el patrón de `taskRelation`.

### Fase 11 — Ciclo comercial
Flujo documental de Dolibarr: **presupuesto → pedido → albarán → factura →
cobro**, con líneas, impuestos, moneda, numeración correlativa (exigencia legal
en facturas), estados con categoría e inmutabilidad tras validar, PDF y
conversión de un documento al siguiente arrastrando líneas.

### Fase 12 — ERP ligero
Catálogo de productos/servicios con tarifas, almacenes y stock con
movimientos, y lado de compras.

**Dónde parar:** contabilidad completa, nóminas y fabricación son proyectos en
sí mismos. La decisión por defecto es **no construirlos**: exportar a un
software contable o integrarse con él.

---

## Fuera de alcance

Docs/wiki colaborativa con Yjs (primer candidato del backlog), pizarras, chat
interno, formularios públicos, app móvil nativa, funciones de IA, facturación
de suscripciones.

---

## Verificación

Se aprovecha la infraestructura de pruebas heredada (Vitest unitario e
integración, Playwright, comprobador de i18n).

```bash
pnpm typecheck && pnpm lint && pnpm test
```

**Presupuesto de tests** (acotado a propósito para 8 h/semana):
- **Unitarios:** traductor de filtros → SQL, validación de campos
  personalizados, idempotencia de importación vía `external_ref`, agregaciones
  de los widgets, e **invariantes del árbol**: `path` siempre coherente con
  `parent_id`, imposible crear un ciclo al reparentar, agregados correctos con
  ramas desiguales y con tareas archivadas.
- **Integración** (Postgres del compose, BD por test): cada controlador nuevo
  contra base de datos real.
- **Humo (Playwright):** login → crear proyecto → crear tarea con campo
  personalizado → añadirle dos subtareas → mover en tablero → filtrar y guardar
  vista → exportar.
- **Cero tests unitarios de UI.**
- **Rendimiento:** seed de 50.000 tareas **con árboles de hasta 5 niveles**;
  toda vista < 300 ms p95, revisado con `EXPLAIN` al cerrar las Fases 4 y 9.
- **No romper lo heredado:** ejecutar la suite existente antes y después de
  cada fase; lo que se rompa se arregla o se documenta.

**Antes de cada despliegue:** generar la migración con drizzle-kit y **revisar
el SQL a mano**, y restauración de backup probada tras cualquier migración
destructiva.

---

## Siguiente paso

La **Fase 6**: ejecución y productividad personal —«Mi trabajo», bandeja
unificada, ciclos/sprints con velocidad y burndown sobre el registro de tiempo
existente, tareas recurrentes y plantillas de proyecto y de árbol.

Dos cosas que la Fase 5 dejó pendientes y que no bloquean la 6:

- **El asistente de importación no se ha pasado por el navegador.** La API está
  probada de punta a punta; el asistente web solo tiene el typecheck.
- **Sigue sin decidirse cuándo migrar Tablero, Lista y Backlog al motor de
  filtros.** Arrastra desde la Fase 4.
