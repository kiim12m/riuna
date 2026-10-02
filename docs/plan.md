# Riuna — Plan de desarrollo

> Documento vivo. Se actualiza al cerrar cada fase; el estado de la tabla de
> abajo manda sobre cualquier otra cosa escrita aquí.
>
> Complementarios: [qué hace Riuna hoy](funcionalidades.md) ·
> [auditoría de partida](auditoria-fase-0.md) ·
> [decisiones (ADR)](adr/) · [copias de seguridad](copias-de-seguridad.md) ·
> [actualizar la instancia](actualizar.md) ·
> [plan de despliegue](plan-despliegue.md)

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
| 6 — Ejecución y productividad personal | 3 | **Cerrada** — deuda abierta (ver abajo) |
| 7 — Dashboards, informes y objetivos | 3 | **Cerrada** — deuda abierta (ver abajo) |
| 7.5 — Revisión estética | 1 | **Cerrada** — deuda abierta declarada (ver abajo) |
| Interludio — Productividad personal y equipo | 18 | **En curso** — Bloques 0 y 1, y 2.1-2.3 hechos; sigue el 2.4 · [plan por bloques](#interludio--productividad-personal-y-equipo-antes-de-la-fase-8--pendiente) |
| 8 — Automatizaciones e importadores externos | 3 | Pendiente |
| 9 — Operación | 2 | Pendiente |
| **Total Bloque A** | **35** + 18 del interludio | |

**Estimación honesta:** 35 semanas nominales —las 29 del plan original más las
6 de las Fases 4.5 y 7.5, que no estaban— a ~8 h/semana son **10-13 meses**
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

**Deuda abierta de la Fase 5**, declarada a sabiendas:

- **El asistente de importación no se ha pasado por el navegador.** La API está
  probada de punta a punta —19 casos de integración, más el banco de 5.000
  filas—, pero los cuatro pasos del asistente web (elegir fichero, mapear
  columnas, confirmar tipos, ver el informe) solo tienen el typecheck. Se
  declaró como la deuda que la Fase 4 tenía con los desplegables de Base UI, y
  ese motivo ya no vale: el humo de la Fase 6 demuestra que en Playwright abren.
  Lo que falta es escribir el caso.
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

*Semana 18: Riuna ya es la plataforma diferencial. Lo que sigue es mejora
incremental sobre algo vivo y en uso.*

### Interludio — Mejora visual e interactiva (antes de la Fase 6)

Pasada de UX previa a la Fase 6 para dar aspecto diferencial. Se decidió sobre
maquetas HTML ([`design-previews/`](design-previews/)) y quedó escrita en las
[ADR 018–023](adr/): escala tipográfica, densidad configurable, escala de
elevación, sistema de movimiento, rail de la barra lateral y —para el Gantt, la
única vista que la primera pasada no tocó— zoom y bandas de cabecera.

**Hecho y verificado** (build + typecheck + Biome + pasada manual en navegador):
resalte en tiempo real (cierra el principio 5 de marca), entrada de tarjeta y
*stagger*, skeletons unificados a *shimmer* con respeto a `prefers-reduced-motion`,
rail de iconos en la barra lateral, tarjetas del tablero enfocables por teclado,
casilla real en el filtro del tablero, y densidad compacta conmutable desde
ajustes (consumida por el tablero).

**Gantt** (segunda entrega del interludio, [ADR 023](adr/023-zoom-y-bandas-del-gantt.md)):
zoom Día/Semana/Mes/Trimestre con `‹ Hoy ›`, cabecera de dos bandas adaptativa,
columna del día actual sombreada, barras finas de teal suave sin texto ancladas
al centro del día de inicio y de fin, con dos grosores (tarea de primer nivel y
subtarea), filas en orden de árbol con sangría,
riel de una línea con color de prioridad, estados vacíos con el primitivo
`Empty`, y una capa **solo lectura** de líneas de dependencia `blocks` (nueva
lectura `GET /task-relation/project/:projectId`). Crear/editar dependencias
sigue siendo Fase 6.

**Deuda declarada:** la adopción de los tokens de elevación (`shadow-e1..e4`) y
de la escala tipográfica es **incremental** —lo dicen las ADR 018 y 020, «no hay
un corte único»—; hoy los tokens existen y solo el tablero y el Gantt consumen
densidad. El **compositor de tarea en línea** al pie de columna queda para una
pasada propia: es función nueva, no pulido. En el Gantt, encajar el arrastre a la
unidad del zoom (semana/mes) y virtualizar filas quedan pendientes si el
perfilado lo pide.

### Fase 6 — Ejecución y productividad personal (≈3 semanas) · **cerrada**
**Mi trabajo** (tareas propias de todos los proyectos), bandeja unificada,
**ciclos/sprints** con velocidad y burndown apoyados en el registro de tiempo
existente, tareas recurrentes y plantillas de proyecto y de tarea (incluidas
**plantillas de árbol**, que despliegan su jerarquía completa).
**Hecho cuando:** cierras un sprint y ves velocidad real y horas por persona.

**Se trocea en cuatro**, porque cinco entregables en una pasada no caben:
1. **«Mi trabajo» con bandeja** ✔ — hecho, ver abajo.
2. **Ciclos/sprints con velocidad, burndown y horas por persona** ✔ — hecho,
   *el criterio de aceptación de la fase*.
3. **Tareas recurrentes** ✔ — hecho.
4. **Plantillas de proyecto, de tarea y de árbol** ✔ — hecho.

**Rebanada 2 — ciclos/sprints** ✔
([ADR 025](adr/025-ciclos-y-completed-at.md)). Tabla `cycle` colgada del
proyecto, calcada de `epic`; `task.cycle_id`; y `task.completed_at`, que es lo
que faltaba para poder medir nada: hasta ahora la única huella de cuándo se
terminó una tarea era una fila de `activity` con el dato dentro de un JSONB.

**La decisión estructural es que `completed_at` lo mantiene un disparador de
PostgreSQL, no la aplicación.** Hay cinco escritores de `status` en el dominio de
tareas y otros tantos entre importación, webhooks y MCP: nueve sitios que
tendrían que acordarse, y la siguiente integración añadiría el décimo sin leer la
ADR. La Fase 4.5 encontró exactamente ese fallo cuatro veces con `assignee_id`.
Es la misma lógica que las dos `CHECK` del árbol de la Fase 2.

Hecho además: un solo ciclo activo por proyecto vigilado por un índice parcial
único (no por una comprobación en el controlador, que dos peticiones simultáneas
se saltan); cierre transaccional que **pregunta** qué hacer con lo que quedó sin
terminar en vez de arrastrarlo solo; informe con velocidad, burndown y horas por
persona; y gráficas con **Recharts**, la primera dependencia de visualización del
repo.

**Tareas y horas es conmutable, y eso *es* la decisión de no usar doble eje.** Un
gráfico de dos escalas deja que quien lo dibuja elija la historia; y la unidad no
puede ser fija porque un burndown de horas es una línea plana en cero cuando el
equipo no estima, lo que parece un fallo en vez de una ausencia de datos.

**Lo que la verificación encontró:**
- **El disparador se probó contra la base antes de escribir un solo controlador**,
  en ocho casos: alta directa en columna final, alta normal, terminar, reabrir,
  editar el título sin tocar la marca, el respaldo heredado de `done` en un
  proyecto sin columna final, que **archivar no es terminar**, y el rechazo del
  segundo sprint activo. Era lógica nueva en un sitio nuevo del que el repo no
  tenía ningún precedente.
- **Faltaba la mitad de la función.** La API para meter una tarea en un ciclo
  existía y **no la llamaba nadie**: no había forma de hacerlo desde la
  interfaz. Se añadió el selector en las **tres** disposiciones del lateral de
  propiedades, que es el mismo fallo que la Fase 2 tuvo con la ficha de épicas
  —solo estaba en una y no salía en la página de detalle—.
- **`cycleId` no viajaba en las lecturas de tarea**, así que el selector nunca
  habría sabido qué ciclo tenía. Añadido a `getTask` y `getTasks`; comprobado
  además que el endpoint público no lo filtra, porque `toPublicTask` es una lista
  blanca explícita desde la Fase 4.5.
- Drizzle envuelve los errores de Postgres y deja el código en `cause`, así que
  la traducción del 23505 a un 409 no saltaba. Lo cazó la prueba.

**Rebanada 3 — tareas recurrentes** ✔
([ADR 026](adr/026-tareas-recurrentes.md)). Tabla `task_recurrence` con plantilla
y cadencia en `jsonb`, `task.recurrence_id`, y un trabajo cada cinco minutos.
**Estrena trabajo programado que crea datos de producto:** hasta ahora el
planificador solo servía a recordatorios, facturación y reconciliación de
asientos.

La cadencia es un **modelo explícito** —frecuencia, intervalo, días— y no una
cadena RRULE: el estándar lo cubre todo pero exige una dependencia para
interpretar casos que aquí no pide nadie. Sí entra `date-fns` en la API, que ya
estaba en el monorepo, y por un motivo concreto: `setDate(31)` sobre febrero **no
falla, se desborda a marzo**, así que una tarea del día 31 aparecería el día 3.

**Lo que la verificación encontró y lo que previno:**
- La cadencia se escribió como función **pura y se probó antes de conectarla a
  nada**: 14 casos, incluidos el recorte de fin de mes, el año bisiesto, el salto
  de intervalos y que la siguiente ocurrencia sea **estrictamente posterior**
  —si no lo fuera, el planificador generaría la misma tarea en cada vuelta sin
  avanzar nunca—.
- El generador **reclama la fecha antes de crear la tarea**, con una condición
  sobre el valor leído. Probado: correr dos veces seguidas no duplica, y una
  semana de parada produce **una** tarea, no siete.
- El `CHECK` de la frecuencia tenía un agujero en la primera versión: con
  `DEFAULT '{}'`, `'{}'::jsonb->>'frequency'` es NULL y **una `CHECK` pasa con
  NULL**. Se quitaron los valores por defecto y se añadió el `IS NOT NULL`.

**Rebanada 4 — plantillas** ✔
([ADR 027](adr/027-plantillas.md)). Tabla `template` colgada del **espacio de
trabajo** —una plantilla que solo sirviera donde se creó no sería una
plantilla—, con el árbol entero en `jsonb`. Se captura desde un proyecto o desde
un subárbol, y se despliega en cualquier proyecto del espacio, opcionalmente
colgando de una tarea existente.

**Cada tarea se crea con `createTask`**, no con inserciones directas: es lo único
que toma el cerrojo del proyecto, resuelve `path`/`depth`, reclama el número y
sincroniza el responsable. Y **la profundidad se comprueba antes de crear nada**,
porque si no una plantilla más honda que el `maxTaskDepth` del proyecto fallaría
a mitad y dejaría medio desplegado algo que nadie pidió a medias.

Las épicas y las etiquetas viajan **por nombre** y se crean en destino si faltan.
Lo que no viaja son responsables, equipos, fechas y tiempo registrado: una
plantilla dice *qué* hay que hacer, no quién lo hizo.

**Lo que la verificación encontró:** el primer intento devolvía 500 al aplicar.
No era el controlador: era **el fixture de la prueba**, que insertaba tareas
directamente sin mover `project.last_task_number`, así que `claimTaskNumber`
repartía el número 1 otra vez y chocaba con `task_project_number_unique`. Es un
recordatorio de que un fixture tiene que dejar la base como la dejaría la
aplicación, no solo con las filas que la prueba mira.

**Deuda declarada de la rebanada 4:** una plantilla de proyecto guarda columnas y
épicas, pero aplicarla solo despliega el árbol dentro de un proyecto **que ya
existe**. Crear el proyecto entero desde la plantilla toca `create-project`, que
hoy siembra siempre las cuatro columnas por defecto.

**Deuda declarada de la rebanada 3:** la plantilla lleva título, descripción,
prioridad, estimación, responsable y equipo, pero **no** etiquetas, épicas,
campos personalizados ni subtareas. Ese modelo se generaliza en la rebanada 4
con las plantillas de árbol; construirlo dos veces sería el error.

**Deuda declarada de la rebanada 2:**
- **El burndown se dibuja sobre el alcance actual del ciclo.** No se guarda
  cuándo entró cada tarea, así que una añadida a mitad aparece como si hubiera
  estado desde el principio. La alternativa son instantáneas diarias: un segundo
  mecanismo para lo mismo.
- **Cambiar `is_final` de una columna con tareas dentro** deja sus
  `completed_at` como estaban hasta el siguiente cambio de estado. Se repara con
  `UPDATE task SET status = status` sobre el proyecto.
- ~~Tampoco se ha pasado por el navegador.~~ **Cerrada**: el humo recorre el sprint entero, de estado vacío a cerrado.

**Rebanada 1 — «Mi trabajo» con bandeja** ✔
([ADR 024](adr/024-mi-trabajo-y-bandeja.md)). Primera a propósito: no estrena
modelo de dominio —vive sobre `task_assignee` y `task.team_id` de la Fase 1 y
sobre la tabla `notification` heredada— y cierra el hueco más visible del día a
día. Hasta ahora **ninguna** consulta de tareas cruzaba proyectos: todas eran
`client.task.tasks[":projectId"]`.

Hecho: módulo `apps/api/src/my-work/` con una lectura por espacio de trabajo
paginada desde el día uno, dos secciones separadas —«Asignadas a mí» y «De mis
equipos»—, la bandeja como pestaña sobre las notificaciones que ya existían, e
invalidación en tiempo real por el canal de usuario. **Sin migración:** todos los
predicados los sirven índices que ya estaban.

**Medido** con el banco de 50.000 tareas, 5.062 de ellas asignadas a la misma
persona y 6.190 a su departamento. Son tiempos del controlador entero, no de la
consulta suelta:

| Petición | Primera versión | Ahora |
|---|---|---|
| Asignadas a mí, página 1 | 270 ms | **62 ms** ✔ |
| Asignadas a mí, página 20 | — | **75 ms** ✔ |
| Asignadas a mí, con completadas | 237 ms | **60 ms** ✔ |
| De mis equipos, página 1 | 28 ms | **29 ms** ✔ |

Medir cambió dos decisiones. La primera versión pasaba el presupuesto pero con
el margen justo, y por dos motivos que el `EXPLAIN` enseñó y el razonamiento no:

- **El anti-join correlado contra `column` se reejecutaba una vez por tarea** —
  50.000 vueltas y 100.000 buffers para descartar cuatro filas cada vez— porque
  el planificador estimaba que sobrevivían 50 filas y sobrevivían 37.589.
  Resuelto en memoria como una lista de pares `(proyecto, estado)`, es un filtro
  normal dentro del propio barrido. Y de paso **la regla de «hecho» pasa a estar
  escrita una sola vez** en lugar de dos, porque el predicado y la bandera
  `isDone` salen ya de la misma lista.
- **`OFFSET 0` en la subconsulta de asignados** impide que Postgres la suba a un
  semi-join y le obliga a arrancar por `taskAssignee_userId_idx`: 197 ms → 47 ms
  en la consulta principal. El trabajo pasa a ser proporcional a *tus* tareas y
  no a las del espacio entero, que es lo que esta página necesita para envejecer
  bien.

**El índice `task (team_id, due_date)` que se había propuesto no se añade.** El
tramo de equipo sale a 29 ms y el planificador prefiere un `BitmapAnd`, así que
no lo usaría: es la misma lección que la Fase 4.5, que también refutó un índice
midiéndolo.

Decisiones tomadas para las rebanadas siguientes, anotadas para no cerrarles la
puerta: el ciclo será **por proyecto** (calcado de `epic`, más `task.cycle_id`),
el burndown saldrá de una columna **`task.completed_at`** nueva, y las gráficas
usarán **Recharts** —que no entra aquí: esta rebanada no tiene ninguna—.

**Lo que la verificación encontró:**
- **Desasignar dejaba la tarea en la página de quien la perdía.** Tres eventos
  —`task.unassigned`, `task.team_unassigned` y `task.deleted`— no llevaban el id
  del lado que *deja* de tenerla, así que no había a quién avisar. Es la línea de
  «estados inversos» de `AGENTS.md`, y estaba señalado como el fallo más probable
  antes de escribir una línea. Arreglado con tres campos aditivos.
- **`team_member` no tiene `unique(team_id, user_id)`**, así que un JOIN habría
  devuelto la tarea una vez por fila de pertenencia duplicada. Se resuelven los
  ids de equipo aparte con `selectDistinct`; la prueba que inserta dos filas
  iguales es lo único que hace visible el arreglo.
- **El banco de volumen no sembraba asignados ni equipos.** Nació en la Fase 4.5,
  cuando no había ninguna vista que cruzase proyectos, así que las dos consultas
  de esta rebanada habrían medido cero filas. Ahora reparte entre diez personas y
  tres departamentos y refleja `task_assignee`, que es lo que la página lee.

**Las dos pantallas se funden** ([ADR 031](adr/031-panel-personal-unificado.md),
que modifica la 024). «Mi trabajo» y «Panel» eran dos respuestas a la misma
pregunta en dos entradas contiguas de la barra lateral: una lista que no se podía
cambiar y una rejilla que había que montar. Ahora hay una sola pantalla, `home`,
con una distribución de partida que se siembra la primera vez —tres tarjetas de
cifra, la lista de lo asignado, la bandeja y una tendencia— y que a partir de ahí
es del usuario. El ámbito personal deja de ser una pantalla y pasa a ser
`config.scope` de cualquier widget, sobre los mismos predicados medidos. `/my-work`
y `/panel` redirigen, y `MY_WORK_INVALIDATED` invalida también el panel para no
perder la actualización en vivo que la página vieja sí tenía.

De la imagen de referencia se toma la arquitectura de información y **no** la
estética: el magenta no está en la paleta y `marca.md` §04 está cerrado. Tres de
sus cinco tarjetas —objetivos, notas, finanzas— no tienen módulo detrás; los
objetivos son la rebanada 3 de esta misma fase.

**Rebanada 3 — objetivos/OKR** ✔
([ADR 032](adr/032-objetivos-medidos-al-leer.md)). `goal` con periodo y
`goal_target` con diana. La economía de la rebanada es que **un resultado clave
es la consulta de un widget más un número**: misma forma de `config`, mismo
`aggregate()`, y el progreso **no se guarda en ninguna parte** — se mide al leer.
Eso es lo que hace que «avanza al cerrar tareas» no necesite ni disparador nuevo
ni recalculo programado: cerrar una tarea mueve `completed_at` y la siguiente
lectura cuenta distinto. Con esto la fase llega a su criterio de aceptación.

Deuda de esta rebanada: **un OKR solo lo ve quien lo crea** —compartir llega con
el `is_shared` de la rebanada 2, a la vez para paneles y objetivos—, no hay
widget de objetivo en el panel (exige tocar el `CHECK` de tipos y la 0057 ya está
aplicada), y `sumLogged` queda fuera de las métricas por medir sobre el registro
de tiempo y no sobre el cierre.

**Rebanada 4 — informe del panel en Excel** ✔
([ADR 034](adr/034-informe-del-panel-en-excel.md)). Una hoja por widget, y el
libro sale de **`getDashboardData`, la misma lectura que pinta la pantalla**: es
lo que impide que la hoja y el panel digan números distintos. Solo xlsx, porque
un CSV es una tabla y un panel son varias. `buildExchangeWorkbook` se generaliza
a varias hojas en vez de copiarse.

Montar la ruta destapó un fallo de la rebanada 2: `/:id/data` seguía pidiendo
propiedad, así que **un panel compartido se pintaba con todos los widgets en
403**. La lectura tiene ahora su propio gate.

**Rebanada 2 — compartir, cubo «otros» y widget de objetivo** ✔
([ADR 033](adr/033-compartir-paneles-y-objetivos.md)). `is_shared` en `dashboard`
y en `goal`, calcado de `view`; los repartos suman la cola en un cubo «otros» en
vez de cortar en silencio; y `dashboard_widget.goal_id` deja mirar un objetivo
desde el panel.

Dos cosas que la rebanada **no** trae, y no por olvido: la tabla embebida sigue
sin paginar —la ADR 030 argumentó que paginar dentro de una tarjeta es una
ficción y darle la vuelta pide una razón que no ha aparecido— y `widget.view_id`
tampoco, porque su valor declarado —que `view.config` y `widget.config` sean la
misma forma— ya estaba conseguido, y lo que quedaba choca con que las vistas son
por proyecto mientras los widgets cruzan proyectos.

**Deuda declarada de la rebanada 1:**
- ~~La página no se ha pasado por el navegador.~~ **Cerrada**: cubierta por el
  humo de Playwright, incluido el gesto que peor cubría la automatización de API
  —asignar y **desasignar** desde una segunda sesión y ver la fila aparecer y
  desaparecer sola—.
- **`getNotifications` sigue topada en 50 filas sin paginar ni filtrar por no
  leídas.** Invisible en un desplegable, visible a página completa: la bandeja lo
  avisa en vez de fingir que eso es todo.
- **El motor de filtros de la Fase 4 no llega aquí.** El registro de campos
  eclipsa definiciones entre proyecto y espacio y admite tipos distintos por
  proyecto, así que un `custom.*` filtraría a cero en silencio en unos proyectos
  y no en otros. Tres controles fijos hasta que eso tenga respuesta.
- **Sin agregados del árbol:** son por proyecto y cuestan 242 ms fijos medidos.
  Se pierde el contador de subtareas y las fechas heredadas de la rama.

### Fase 7 — Dashboards, informes y objetivos (≈3 semanas) · **cerrada**
`dashboard`, `dashboard_widget`, `goal`, `goal_target`. Widgets (recuento por
filtro, tarta/barras, tendencia, tiempo registrado, avance por épica, tabla
embebida) sobre el **motor de vistas de la Fase 4** más una capa de agregación.
Objetivos con progreso automático. Exportación de informes a Excel.
**Hecho cuando:** montas un panel de 5 widgets que se recalculan solos y un OKR
trimestral que avanza al cerrar tareas.

**Se trocea en cuatro**, como la Fase 6:
1. **Panel personal configurable** ✔ — ver abajo.
2. **Compartir, cubo «otros» y widget de objetivo** ✔ — la tabla paginada y
   `widget.view_id` se descartaron con razones, ver abajo.
3. **Objetivos/OKR** ✔ — *el criterio de aceptación de la fase*.
4. Exportación de informes a Excel, sobre `export-task-sheet.ts`. ✔

**Rebanada 1 — panel personal configurable**
([ADR 030](adr/030-paneles-personales-y-la-definicion-de-hecho.md)). Tablas
`dashboard` y `dashboard_widget`, rejilla de tres columnas reordenable con el
dnd-kit que ya estaba, los seis tipos de widget y una capa de agregación con un
solo endpoint por lote.

**Las dos decisiones estructurales llegaron antes que cualquier widget.** La
primera responde a lo que la ADR 024 dejó aplazado: **el ámbito de un widget
elige su registro de campos**, con `project_id` nulo o no, igual que `view` y
`field_definition`. El agujero que había que cerrar no era el 400 sino el
silencio: un campo del espacio eclipsado por uno de proyecto **con otro tipo** no
falla, hace que esas tareas desaparezcan del recuento.

La segunda es que **«hecha» pasa a ser `completed_at IS NOT NULL` en todas
partes**. Había tres definiciones que no coincidían, y la de las estadísticas de
proyecto tenía un fallo de verdad: contaba como completada cualquier tarea
archivada, así que **archivar el backlog subía la barra de progreso**. Corregirlo
mueve los porcentajes de todos los proyectos, casi siempre hacia abajo.

De paso se cerró el riesgo declarado de la ADR 025 —cambiar `is_final` dejaba
`completed_at` obsoleto— y se extrajeron tres piezas que ya estaban duplicadas:
`StatTile`, los ejes y tooltips de Recharts (esta era la tercera copia) y las
fronteras del día del servidor, que «Mi trabajo» y los paneles no pueden calcular
por separado sin que «hoy» acabe significando cosas distintas.

**Un fallo anterior que destapó la prueba de paridad de `buildFilter`:** el
validador de `view.config` no declara `type`, así que Valibot lo descartaba al
guardar, y **volver a aplicar una vista guardada producía un filtro que el motor
rechazaba con un 400 del listado entero** — justo la pantalla en blanco que ese
validador decía querer evitar. Se repara haciendo que las dos implementaciones
**pongan** el `type` en vez de propagarlo, lo que sana también las vistas ya
guardadas sin migración.

**Deuda declarada de la rebanada 1:**

**Medido** (2026-09-08, banco `riuna_bench` con `SEED_VERSION = 2`, dos pasadas
por consulta, la segunda apuntada). La tabla `task` tenía **100.000 filas** —las
50.000 de la v1 más las 50.000 de la v2— y el espacio medido, 50.000: más duro
que lo que el presupuesto pide.

| Consulta | ms |
|---|---|
| Recuento, espacio entero | 36,7 |
| Recuento, solo mías | 38,6 |
| Reparto por proyecto | 22,3 |
| Reparto por responsable | 25,1 |
| Ventana de vencimiento, solo mías | 39,6 |
| Tendencia semanal, solo mías | 43,1 |
| Progreso hechas/total, solo mías | 52,0 |
| Tiempo registrado por persona | 36,7 |
| Avance por épica | 54,1 |
| Tabla embebida (top 20), solo mías | 38,9 |

**Los widgets del panel por omisión suman 212 ms**, dentro del presupuesto de
300 ms. Es exactamente la banda que el plan predijo —«si sale a 30-50 ms, cinco
widgets en serie van a 150-250 ms y se sigue»—, así que **el endpoint por lote con
cálculo en serie se confirma** y no hace falta la palanca de colapsar widgets en
un barrido con varios `count(*) FILTER`. Ningún plan usa un índice: todos son
`Hash Join` más `Aggregate` o `Sort`, que es lo que se esperaba de una consulta
sin predicado selectivo.
- **Las cifras anteriores a `SEED_VERSION = 2` no son comparables** para nada que
  dependa de fechas: la v1 sembraba todo el vencimiento en el futuro. Los
  recuentos de `task` no cambian, así que las mediciones del árbol y del `path`
  siguen valiendo.
- ~~**Las pruebas de integración están escritas y sin ejecutar.**~~ **Ejecutadas**
  el 2026-09-08 contra PostgreSQL. Encontraron tres fallos que la lectura del
  código no vio: el `GROUP BY` que Drizzle volvía a enlazar, la reparación
  inservible que prescribía la ADR 025, y el administrador con poder sobre un
  panel personal.
- ~~**La pasada por navegador cubre la rebanada 1 y no las demás.**~~ **Cerrada**
  el 2026-09-08. El humo de Playwright, que **nunca había llegado a arrancar**
  —`vite.config.ts` fija el puerto a fuego y la variable `PORT` que le pasaba la
  configuración no hacía nada—, corre ahora entero: 10 casos, incluido uno nuevo
  de objetivos que verifica el criterio de aceptación de la fase contra un
  navegador de verdad. Encontró un fallo que ninguna prueba de API podía ver: el
  selector de objetivo del editor de widgets estaba anidado **dentro del
  desplegable de proyecto**, así que no se podía elegir ninguno.

  Lo que sigue sin mirarse: el **cubo «otros»**, que solo aparece con más de
  cincuenta grupos.
- **Un widget de espacio todavía no ofrece los campos personalizados del
  espacio**, que la API sí acepta: falta el fetcher que los lea sin pasar por un
  proyecto. Se dijo que iba en la rebanada 2 y **no entró**; sigue abierto.
- **El resellado de `completed_at` destapó que la ADR 025 prescribía una
  reparación inservible** —`SET status = status`, que el propio disparador se
  salta por su atajo de "si `status` no cambia, no recalcules"—. Lo encontró una
  prueba de integración, no la lectura del código. La regla se extrae a
  `task_status_is_final` (migración 0056) y la usan disparador y resellado.
- **La primera superficie que consume la escala tipográfica destapó que
  `--text-secondary` era inservible.** En Tailwind v4 `text-` lo comparten tamaño
  y color, y `--secondary` ya existía: la utilidad compilaba a un gris pálido en
  vez de a 12 px, y medio panel salía lavado. Renombrado a `--text-meta`; la
  [ADR 018](adr/018-escala-tipografica.md) lo recoge. No daba error, daba otro
  estilo — que es el modo de fallo a vigilar al pasar el resto del web a la
  escala.
- **Se pierden los filtros de página de «Mi trabajo»** —vencimiento, proyecto,
  completadas— que valían para toda la pantalla. Cada widget lleva ahora el suyo,
  que es más flexible y menos inmediato.
- **`GET /api/my-work/tasks` se queda sin consumidor web.** Sigue publicada,
  documentada y probada; retirarla es una decisión sobre la superficie pública
  que no se toma de paso.
- **El índice `task (completed_at)` está declarado y no construido**, con la
  condición que lo justificaría escrita en la ADR 030.
- **Una tarea que vence hoy a las 00:00 se clasifica como vencida**, y por las
  mismas una que vence mañana a las 00:00 cuenta como de hoy. Lo destapó la
  prueba de equivalencia de ventanas de la ADR 043 al poner fixtures justo en
  las fronteras: `task.due_date` es un `timestamp` sin zona y viaja por el
  convenio UTC de drizzle, así que en un servidor con desfase las horas
  cercanas a medianoche cruzan de día al guardarse. **No es del panel**: afecta
  igual a «Hoy», al Planificador y a «Mis tareas», porque todas comparten
  `dueWindowExpression`. Es la deuda de zona horaria que `day-boundaries.ts`
  declara desde la Fase 4.5 —«qué zona horaria define un día sigue sin
  decidirse»—, ahora con un síntoma concreto y reproducible en vez de una nota.
  Arreglarla es elegir convenio para toda la instalación, no parchear una
  consulta.
- ~~**La palanca de colapsar widgets en un solo barrido queda escrita y sin
  construir.**~~ **Construida y medida** el 2026-09-28
  ([ADR 043](adr/043-rejilla-de-doce-columnas-del-panel.md)): la distribución de
  partida nueva son once widgets, ocho de ellos recuentos sobre la misma tabla y
  el mismo ámbito. Sin el colapso, solo esas cifras se salían del presupuesto
  (280-343 ms p95 frente a los 148-264 del panel entero con él).
- ~~**`span` no tiene ningún control en la interfaz**: los únicos anchos que
  existen son los sembrados.~~ **Cerrada** el 2026-09-28: tirador de esquina más
  selectores de ancho y alto en el diálogo del widget.

### Fase 7.5 — Revisión estética (≈1 semana) · **cerrada**

Repaso de acabado de las 24 pantallas con dos sistemas externos —
[impeccable](https://github.com/pbakaus/impeccable) y
[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)— contra
[`marca.md`](marca.md), que sigue siendo la autoridad. El inventario completo
está en [la revisión](revision-estetica-2026-09.md); aquí queda lo que cambia el
plan.

Las dos skills se instalaron **a nivel de usuario y no en el repo**: traen 22 MB
de fuentes, CSV y binarios que no tienen por qué versionarse con Riuna, y sus
*hooks* globales se dispararían en todos los proyectos.

**El método importa más que el recuento.** Tres barridos: el detector estático
sobre `apps/web/src` —2 avisos, ambos falsos positivos—, el de runtime **ruta por
ruta** sobre la aplicación en marcha, y medición directa del DOM. Escanear varias
URL en un lote infravalora muchísimo: 1 hallazgo por ruta frente a 58 en
solitario, porque el detector no espera al render. Y la mitad del trabajo fue
**descartar**: el «1,1:1» de las cabeceras del calendario da 7,47:1 al muestrear
píxeles —el mínimo era el borde antialiasado de los glifos—, y el «cyan neon
sobre fondo oscuro» que marca 162 veces es River Teal, una marca deliberada que
un detector entrenado contra plantillas de SaaS no distingue de un tic
generativo.

**Cierra el único hueco que quedaba del sistema de color.** `marca.md` §04
definía marca, escala derivada, tema oscuro, semánticos y las nueve etiquetas —y
de gráficas no decía nada—. Lo que había en `index.css` no derivaba de la marca
(violeta, rosa) y el tercer tono era exactamente el color de aviso. Ahora son
ocho tonos en orden fijo con River Teal el primero, escalonados aparte para el
tema oscuro y verificados en los dos: banda de luminosidad, croma, separación
bajo protanopia y deuteranopia, y contraste sobre superficie. **No ciclan**: la
cola cae en un neutro de «otros». La decisión vive en §04 con su gobernanza.

**Cierra también la deuda incremental del Interludio.** Las ADR 018 y 020 dejaron
escrito que la adopción de la escala tipográfica sería incremental, «sin un corte
único». Este es el corte para la interfaz: **119 tamaños arbitrarios** —incluidos
8 px y 9 px, y 61 `text-[10px]`— devueltos a los siete papeles de §05, repartidos
por familia y no con un `sed`. Cero `text-[Npx]` en el código. Quedan fuera y
**contadas** 48 clases de tamaño de Tailwind en pantallas que la revisión no
recorrió.

**Dos modos de fallo silencioso que conviene no repetir**, porque ninguno da
error y los dos se ven «casi bien»:

1. **Tailwind poda `@theme inline`.** Una variable que ninguna fuente nombre
   literalmente no llega a `:root`. `chartColor` construía
   `var(--color-chart-${n})` en tiempo de ejecución, así que solo sobrevivía la
   1 y cuatro de cada cinco barras se pintaban en negro. El DOM estaba bien
   —anchura correcta, `style` en su sitio—: fallaba **solo el color computado**,
   que es lo que ninguna prueba sobre clases puede ver. La prueba que lo fija
   afirma sobre `getComputedStyle`.
2. **tailwind-merge clasificaba la escala como color.** Los siete papeles son
   nombres propios (`label`, `meta`, `section`…), no una escala que reconozca,
   así que caían en el mismo grupo que `text-muted-foreground` y **el tamaño
   desaparecía** en cada chip de estado y en cada título de tarea cerrada. Es la
   misma trampa del prefijo `text-` que documenta la [ADR 018](adr/018-escala-tipografica.md),
   por el otro lado: allí un tamaño compilaba a color, aquí un tamaño se
   descartaba *como si* fuera color. Había además **dos `cn()`** —uno usado por
   109 ficheros y otro por 2—, y el arreglo aterrizó primero en el que no era.

**Lo demás que entró:** la tabla dejando de enseñar slugs crudos de estado, las
columnas por defecto con los nombres que ya fijaba §06 —sin romper la
importación de hojas en inglés, que casa por slug colapsando separadores—, el
calendario y la zona peligrosa traducidos al castellano y al catalán, tres claves
que no existían en **ningún** idioma, y la medida de lectura de la descripción de
tarea, que no tenía tope alguno y crecía con la ventana.

**Deuda declarada:**

- **48 clases de tamaño de Tailwind fuera de los siete papeles** —`text-lg` (23),
  `text-2xl` (24), `text-4xl` (1)— en acceso, alta, invitaciones y proyecto
  público. Medidas y acotadas, no barridas a ciegas: son pantallas que esta
  revisión no recorrió.
- **La escala del editor TipTap va aparte**: 28 `font-size` en CSS con valores
  propios. Es prosa, no interfaz densa, y se deja como excepción **declarada**.
- **`i18n:check` no detecta claves usadas que no existen** en ningún idioma:
  comprueba paridad, no existencia. Las tres de ciclos estaban igual de ausentes
  en los tres, así que pasaban por «en sync». La puerta de CI tiene ese hueco.
- **Las leyendas que cada página de ajustes escribe en línea** siguen sin acotar;
  las primitivas compartidas sí. Son leyendas de escaneo, no prosa de lectura.
- **La búsqueda pinta `result.status` crudo**, como hacía la tabla. Resolverlo
  cruza proyectos y necesita una consulta que hoy no se hace.
- **Las preferencias viven solo en `localStorage`** y se pierden al cambiar de
  navegador, aunque la pantalla cuelgue de «Ajustes › Cuenta». De ahí sale también
  que el calendario empiece en domingo. Es una decisión de producto con el rótulo
  desalineado, no un fallo.

### Interludio — Espacio personal y administración (antes de la Fase 8) · **cerrado**

*Mismo patrón que el interludio de UX antes de la Fase 6: se decide sobre una
maqueta ([`barra-lateral.html`](design-previews/barra-lateral.html)) antes de
tocar `apps/web`, y la decisión queda en ADR antes que el código.*

La barra lateral tenía un solo grupo mezclando «qué me toca a mí» con «cómo
está montado este espacio», y administrar significaba salir a una pantalla a
página completa sin barra lateral
([ADR 036](adr/036-barra-lateral-en-tres-espacios.md)). Se separa en tres
grupos —espacio personal, administración (por capacidades, no por rol) y
proyectos— y el grupo personal, que nace corto, se llena en bloques:

1. **Acceso concedido por el admin, sin aprobación de quien entra** ✔
   ([ADR 035](adr/035-acceso-concedido-sin-aprobacion.md)). Desaparece el
   buzón de invitaciones pendientes; la invitación pasa de máquina de estados
   a testigo de registro.
2. **Barra lateral en tres espacios y administración de vuelta al layout
   principal** ✔ ([ADR 036](adr/036-barra-lateral-en-tres-espacios.md)).
   `/dashboard/settings` se queda solo con «Mi cuenta»; los ajustes de espacio
   y de proyecto se mudan a `.../admin/workspace/…` y
   `.../admin/project-settings/…`, con redirecciones desde las URL viejas. El
   grupo personal arranca con lo que ya existía —«Mi panel» y «Objetivos»— y
   nada más.
3. **Lectura de tareas del espacio generalizada, paginada y compartida** ✔
   ([ADR 037](adr/037-la-lectura-de-tareas-del-espacio.md)):
   `my-work/decorate.ts`, `my-work/pagination.ts`,
   `view/workspace-task-query.ts`, endpoint nuevo
   `GET /api/my-work/tasks/search`. Extrae a un solo sitio lo que estaba
   duplicado a medias entre `top-tasks.ts`, `aggregate.ts` y
   `get-my-work.ts`. El endpoint **todavía no tiene consumidor web** — llega
   con los bloques 5 y 8.
4. **Qué no puede ofrecer una vista transversal** ✔ decidido
   ([ADR 038](adr/038-lo-que-una-vista-transversal-no-ofrece.md)): `status`,
   `column`, `number`, `position`, `parent` y `depth` quedan fuera del
   registro de campos del espacio, porque comparan contra un proyecto y
   mentirían entre proyectos. Pedirlos es un 400 con el nombre del campo, no
   una lista vacía.
5. **Hoy** ✔ — pantalla de entrada, sustituye a la tabla de proyectos como
   raíz del espacio (`/dashboard` pasa a llevar a `/today`). Composición pura
   sobre `GET /my-work/tasks/search` (bloque 3): sin endpoint ni ADR propios.
   Lista lo asignado en todos los proyectos, agrupado por ventana de
   vencimiento (Vencidas/Hoy/Esta semana/Más adelante/Sin fecha, las mismas
   que ya usa el panel), con el detalle abriéndose en el mismo panel lateral
   que tablero y calendario en vez de navegar a otra página. «Mi panel»
   —el antiguo «Mi trabajo» fundido con Panel, ADR 031— no se toca: sigue
   siendo la pantalla de widgets configurables, entrada propia en el grupo
   personal.
6. **Planificador** ✔ ([ADR 040](adr/040-planificador.md)) — ventana rodante
   de 15 días. Tabla nueva `personal_plan_entry` (única por usuario y tarea);
   arrastrar una tarea de un día a otro, o desde «sin planificar» —lo
   asignado y sin terminar que no tiene fila en la tabla, calculado y no
   guardado—, escribe ahí y **nunca** `task.due_date`. Los fantasmas de
   recurrentes se proyectan encadenando `firstOnOrAfter`/`nextOccurrence`
   (`recurrence/cadence.ts`, sin tocar el módulo), filtrados por
   `template.assigneeId`; no se guardan, no se arrastran y no cuentan en la
   carga del día. La carga es `SUM(estimate) / 8 h` fija por persona —sin
   ajuste todavía, declarado—. Arrastre con `dnd-kit` (columnas discretas),
   no la matemática de puntero del Gantt; tarjeta propia, no la de
   `kanban-board`, que lee el proyecto activo de una tienda global.
   Verificado en navegador real: arrastrar una tarjeta y comprobar contra la
   API que el vencimiento no se movió.
7. **Cronograma** ✔ ([ADR 041](adr/041-cronograma.md)) — línea de tiempo por
   horas sobre lo que ya decidió el Planificador. Diseño cerrado tras leer el
   motor real de esto, `map-schedule-data` de
   [super-productivity](https://github.com/super-productivity/super-productivity)
   (MIT, ~1.900 líneas de TypeScript puro sin una sola importación de
   Angular; `NOTICE` lleva su entrada). No se portó entero: Riuna ya tiene
   `personal_plan_entry` (ADR 040) haciendo el trabajo de su
   `plannerDayMap`, así que solo se portó, reducido, el álgebra de solapes y
   partición (`mergeBlocksRecursively` + el barrido de
   `insert-blocked-blocks-view-entries-for-schedule.ts`, con dos variantes
   en vez de doce, sin acarreo entre días ni bandas a N solapes — la razón
   de cada corte está en la ADR). Columna nueva `start_minute` (nullable) en
   `personal_plan_entry` para anclar una entrada a una hora fija; tabla
   nueva `schedule_block` para lo que no es tarea (fijo/bloqueo), con
   `cadence` opcional reutilizando `recurrence/cadence.ts` tal cual; el
   cronómetro en marcha se lee de `time_entry` en vivo, sin guardar nada.
   Arrastre con matemática de puntero continua (`gantt-task-bar.tsx`), no
   `dnd-kit` — aquí sí encaja, a diferencia del Planificador, porque el eje
   es continuo. Motor puro con 6 pruebas unitarias
   (`apps/api/src/schedule/layout.ts`); 9 pruebas de integración cubriendo
   el reparto, el anclaje, los bloques repetidos y el aislamiento entre
   espacios. Verificado en navegador real contra la instancia de
   `dev:parallel`: crear, partir alrededor de un bloque fijo, fusionar dos
   bloques que se solapan, arrastrar para anclar una hora, y crear un bloque
   nuevo con el diálogo — de paso salió una etiqueta de `Select` sin resolver
   (el mismo patrón de `close-cycle-dialog.tsx`, ahora aplicado aquí). La
   prueba de extremo a extremo (`tests/e2e/schedule.spec.ts`) está escrita
   pero **no se ha podido ejecutar en este entorno**: la configuración de
   Playwright espera la PostgreSQL de `compose.local.yml` en el puerto 5433,
   y este devcontainer no tiene Docker.
   **Actualización 2026-09-23:** la ventana fija de 7 días sin navegación se
   sustituyó por un calendario de verdad — vistas Día/Semana/Mes
   (`schedule-range.ts`) con el rango en la URL, rejilla de 24 h siempre
   visible (se retira el estado vacío), y una casilla discontinua portada de
   `create-task-placeholder.component.ts` de super-productivity que crea o
   planifica una tarea al pulsar sobre un hueco. `GET /schedule` gana `from`
   y sube a 42 días de ventana máxima; `PUT /planner/:taskId` gana
   `startMinute` opcional para planear y anclar en una sola llamada. De paso
   se corrigió que la consulta de `personal_plan_entry` no filtraba por
   `workspaceId` (sí lo hacían los bloques). Verificado con typecheck, la
   batería unitaria de la API y la web, y `pnpm i18n:check`; el navegador
   real y las pruebas de integración (sin Docker en este entorno) quedan
   pendientes, igual que la prueba e2e ya declarada arriba.
8. **Mis tareas** ✔ ([ADR 039](adr/039-mis-tareas-vistas-personales.md)) —
   Lista, Tablero, Gantt y Tabla personales sobre el motor de los bloques 3 y
   4, con ADR propia porque cambia la semántica del tablero. Carriles por
   ventana de vencimiento y no por estado (`status`/`column` no existen en el
   registro del espacio, ADR 038); sin arrastre en ninguna de las dos —el
   destino con sentido es el plan personal del Planificador, que no existe
   aún—; Lista plana, sin árbol; Gantt de solo lectura, sin capa de
   dependencias, «hecha» resuelta por `isDone`. `table-view` se reutiliza tal
   cual —la única de las cuatro que no hacía falta tocar por dentro—; Lista y
   Tablero se construyen ligeros sobre `WidgetTaskRow`, el mismo componente sin
   estado que ya estrenó «Hoy», en vez de forzar `list-view`/`kanban-board` a
   un modo multi-proyecto que no tenían. Vistas guardadas de espacio nuevas
   (`GET/POST /view/workspace`), sobre controladores que ya sabían de
   `projectId` nulo desde la ADR 015 y no tenían ruta que los llamara así.
   Filtro y vista guardada llegan primero a la Tabla —la única que ya traía
   barra de filtros—; Lista y Tablero se quedan con un selector de ámbito
   (asignadas a mí / de mis equipos) hasta que alguien pida más. Sin campos
   personalizados todavía: no hay endpoint que liste los de espacio fuera del
   motor de filtros.
9. **Parte de horas** ✔ ([ADR 042](adr/042-parte-de-horas.md)) — lo
   registrado por quien mira, cruzando proyectos, agrupado por día, tarea o
   proyecto sobre un rango de fechas (7 días por defecto). Módulo plano
   `apps/api/src/time-sheet/`, fuera de `time-entry/` por el mismo motivo
   que `my-work/` frente a `task/`: una lectura transversal no es un método
   más del recurso. Sin tabla nueva — solo un índice compuesto
   `(user_id, start_time)` que sustituye al de `user_id` solo. Una entrada
   en marcha cuenta lo transcurrido hasta ahora en vez de omitirse del
   total. La exportación reutiliza `buildExchangeWorkbookOf`
   (tercer consumidor fuera de `task/`, tras el panel), exportando
   exactamente los grupos que pinta la pantalla. 10 pruebas de integración;
   verificado en navegador real contra `dev:parallel` (agrupar por día y por
   tarea, entrada en marcha contando en vivo, exportar y descargar el
   `.xlsx`).

10. **La rejilla del panel pasa a doce columnas redimensionables** ✔
    ([ADR 043](adr/043-rejilla-de-doce-columnas-del-panel.md)) — `span` de 1 a
    12 y un `row_span` de 1 a 6 sobre una altura de fila fija, con tirador de
    esquina y controles en el diálogo, que son la única vía con teclado y en
    móvil. Sin `react-grid-layout` y sin `grid-auto-flow: dense`: lo que
    faltaba era una celda más fina y un alto declarado, no colocación libre
    con huecos, y rellenar huecos hacia atrás desacoplaría el orden visual del
    `position` que escribe el arrastre. El responsive se deriva de dos enteros
    en línea y tres media queries, sin `matchMedia`.

    La distribución de partida se rehace en tres alturas —ocho cifras, la
    semana en curso, y la lista de pendientes con la bandeja al lado—, lo que
    estrena el tipo de widget `week` y una clave `dueWindow` por widget. Con
    once widgets en serie el presupuesto de 300 ms no daba, así que **se
    construye por fin la palanca que la ADR 030 dejó escrita**: las tarjetas de
    recuento que comparten ámbito se resuelven en un solo barrido con un
    `COUNT(*) FILTER (WHERE …)` por widget (`collapse-counts.ts`).
    `MAX_WIDGETS_PER_DASHBOARD` sube de 12 a 24 por lo mismo.

    De paso se corrige una **pérdida de datos silenciosa**: `WidgetConfig` en
    el web no declaraba `scope`, y como el editor guarda el objeto entero,
    abrir y guardar cualquier widget sembrado le borraba el ámbito personal y
    lo ensanchaba a todo el espacio. Y `dueWindowCondition` sale de `my-work`
    a `utils/due-window.ts` —tercer consumidor—, con una prueba que compila las
    dos formas de la ventana y compara sus fronteras, que nada vigilaba.

    La pasada por navegador encontró dos cosas que ninguna prueba veía: el
    rótulo del día de hoy usaba `text-brand-foreground` —el color del texto
    que va *encima* de un relleno de marca— y salía con contraste ~1:1 en los
    dos temas sin que fallara nada, porque el elemento estaba ahí; y el alto
    fijo por debajo de 40rem no alineaba nada y solo encajonaba la semana en
    una caja con scroll.

    **Medido** (2026-09-28, banco de 50.000 tareas): el panel entero sale a
    **148 ms p95 en caliente y 264 ms en frío**, dentro del presupuesto de 300;
    las siete cifras solas, una a una, ya costaban 280-343 ms. El `EXPLAIN`
    lo explica: cinco recuentos colapsados leen 3.038 búferes y uno solo de
    ellos por separado lee 3.105, así que cinco preguntas cuestan lo que
    costaba una.

11. **Cronómetro** ✔ ([ADR 044](adr/044-cronometro-en-el-pie.md)) — se mueve
    al pie de la barra lateral en vez de una cabecera, que la ADR 022 ya
    maquetó y descartó. La API y los hooks web venían del fork de Kaneo sin
    que ningún componente los usara; ahora un índice parcial único
    (`time_entry_one_running_per_user`) impone un solo cronómetro por
    persona en todo el servidor, arrancar uno cierra el que hubiera en una
    transacción, y se para solo al entrar la tarea en una columna final
    —un suscriptor a `task.status_changed` que relee `completed_at`, el que
    ya mantiene el disparador de la ADR 025, en vez de reimplementar qué
    columna es final—. `PUT`/`DELETE /time-entry/:id` pasan a exigir que la
    entrada sea propia, con la condición de dueño en el propio `WHERE`
    —antes bastaba el permiso de espacio—; `DELETE` no existía. Pulso,
    título y `HH:MM:SS`; en raíl solo el punto. Sin nada en marcha ofrece
    «Reanudar» sobre la última tarea sin terminar, como el play de la
    cabecera de super-productivity con `lastCurrentTaskId`. Pastilla propia
    en móvil, donde la barra es un panel aparte. Aviso —una vez por
    entrada— al superar la estimación; al parar una de más de diez horas,
    pregunta la hora real de fin en vez de estampar «ahora». El parte de
    horas despliega las entradas de cada grupo —siempre propias— para
    editarlas o borrarlas ahí mismo. `TIMER_CHANGED` por el canal de
    usuario, mismo patrón que `PLAN_INVALIDATED`. 16 pruebas de integración
    nuevas más las 11 ya existentes del parte de horas y la duración;
    verificado con typecheck y la batería unitaria de API (703 pruebas) y
    web (271); el navegador real queda pendiente, igual que el resto del
    interludio en este entorno sin Docker.
12. **Jornada personal** ✔ ([ADR 045](adr/045-jornada-personal.md)) — tabla
    nueva `user_work_schedule`, única fuente de horario y capacidad para el
    Planificador y el Cronograma, que hasta ahora tenían cada uno la suya
    —8 h fijas y 08:00–18:00 fijo— y ni siquiera coincidían entre sí. Sin
    fila, los valores de super-productivity: 09:00–17:00, sin comida, lunes
    a viernes. `capacitySeconds` (un número) pasa a `capacityByDay` (uno por
    día de la ventana): 0 si el día no es laborable, si no la jornada menos
    la **unión** de la comida y los bloques cerrados de ese día —nunca
    restados por separado, o un solape contaría un minuto dos veces—. El
    Cronograma deja de leer una constante de instancia y usa el horario de
    quien mira; la comida entra ahí como un bloque `break` sintético que
    nunca se guarda, así que nunca tiene fila que editar. Un día no
    laborable reparte igual en el Cronograma —lo planificado ahí se puso a
    propósito—; la máscara solo apaga la capacidad del Planificador.
    Ajustes en «Mi cuenta › Preferencias», guardados en la API y no en
    `localStorage`. 9 pruebas de integración nuevas más 12 unitarias de
    `dayCapacitySeconds`; typecheck y batería unitaria de API (715) y web
    (271) en verde.
13. **Planificador en tres secciones** ✔ ([ADR 046](adr/046-planificador-en-tres-secciones.md))
    — cada día se reparte como en `planner-day.component.html` de
    super-productivity: sin hora (se reordena, cae en el primer hueco libre
    del Cronograma en este orden), con hora (tareas ancladas y bloques
    fijos, ordenados por minuto, ocultos si no hay nada) y vence este día
    (solo lectura, con «planificada el vie» si ya tiene otro día). Arreglado
    el reordenado, que mandaba siempre el índice antiguo de la tarjeta:
    `PUT /planner/order` reescribe la posición de un día entero en el orden
    recibido. `GET /planner` gana `previous` («De días anteriores», nada se
    mueve solo), `deadlines`, `fixedBlocksByDay`, y `startMinute` más
    `loggedSeconds` en cada entrada; la carga pasa de la estimación bruta a
    lo que queda (`estimate − registrado`, sin fantasmas). Anclar abre un
    popover con la hora, prellenado con el inicio de la jornada personal
    (ADR 045); la estimación se edita en la propia tarjeta
    (`InlineEstimate`, compartido con Hoy) contra el mismo
    `PUT /task/estimate/:id` que ya existía, con `parseDurationInput`
    (`1h 30m`, `90m`, `1:30`, `1,5`) que también adopta `task-tree.tsx`. De
    paso se corrigió que `GET /planner` no filtraba por `workspace_id` —el
    mismo fallo que la ADR 041 ya había corregido en `get-schedule.ts`, sin
    aplicar aquí—, con su prueba de regresión. Quedan declarados fuera: la
    casilla de «hecha», el menú contextual, cargar más días al desplazar y
    el filtro de «Sin planificar» — ninguno estaba en la maqueta original.
    16 pruebas de integración nuevas (`planner-sections.test.ts`) más las
    21 y 27 ya existentes de planner y schedule; typecheck y batería
    unitaria de API (715) y web (279) en verde.

14. **Hoy y contadores** ✔ ([ADR 047](adr/047-hoy-y-contadores.md)) — «Hoy»
    deja de ser una lista de lo asignado agrupada por vencimiento (item 5) y
    pasa a componer sobre el plan personal, como en la maqueta: «De días
    anteriores» (lo planificado antes de hoy y sin terminar, con «Añadir a
    hoy»), «Plan de hoy» (se reordena con `dnd-kit` + `PUT /planner/order`,
    ADR 046), lo urgente sin planificar («vence hoy o vencida», con
    «Planificar hoy») y «Hechas hoy», plegada. Módulo nuevo `today/`,
    `GET /today`, con la misma condición de «urgente» (`today/queries.ts`)
    usada tanto por la lista como por el contador —repetir ese `WHERE` fue
    la fuga entre espacios que las ADR 041 y 046 ya tuvieron que corregir
    dos veces—. Casilla de «hecha» nueva en la fila de Hoy:
    `POST /task/complete/:id` mueve la tarea a la primera columna final o no
    final de su proyecto y reutiliza `updateTaskStatus` por dentro, así que
    la cascada, el evento y la parada del cronómetro (ADR 044) no se
    repiten; la del Planificador sigue pendiente desde la ADR 046, con la
    ruta ya lista para cuando se retome. `GET /my-work/counts` da los dos
    números de la barra lateral —«Hoy» y «Mis tareas», con el mismo tope de
    500 y la misma valla `OFFSET 0` que `get-my-work.ts`—, sin decorar
    filas: un contador de cada carga de página no puede pagar ese coste.
    `PLAN_INVALIDATED` y `TIMER_CHANGED` invalidan también `today` y los
    contadores. Quedan declarados fuera, igual que en el item 13: el campo
    de añadir rápido, el diálogo «Terminar el día», «Añadir todo a hoy» en
    bloque y el menú contextual. 27 pruebas de integración nuevas
    (`today.test.ts`, `my-work-counts.test.ts`, `task-complete.test.ts`);
    typecheck y batería unitaria de API (715) y web (281) en verde.
    **Contra lo declarado en los bloques 5-7, el humo de Playwright sí corre
    en este entorno sin Docker**: `E2E_DATABASE_URL` apuntado a una base
    propia (`riuna_e2e_test`) en el mismo PostgreSQL nativo que ya usan las
    pruebas de integración basta, sin `compose.local.yml`. `today.spec.ts`
    reescrito para la pantalla nueva; de paso salió y se corrigió una
    regresión real y sin relación con este bloque en `schedule.spec.ts`,
    que esperaba el ancla de flujo en torno a las 08:00 que la ADR 045 ya
    había sustituido por las 09:00 por defecto. Las 25 pruebas de
    `tests/e2e/` quedan en verde.

**Hecho cuando:** entras por «Hoy», planificas tu semana arrastrando entre
días sin cambiar el vencimiento que ve el equipo, y administrar el espacio ya
no te saca de la barra lateral.

### Interludio — Productividad personal y equipo (antes de la Fase 8) · **pendiente**

*Nace de una revisión de lo que la parte de productividad **hace de verdad** —leyendo el
código, no esta documentación— comparada con
[Super Productivity](https://github.com/super-productivity/super-productivity) v19.1 y con
metodologías (GTD, time blocking, Pomodoro/Flowtime, eat the frog, migración de Bullet
Journal, evidence-based scheduling). Las decisiones de producto se tomaron preguntando antes
de planificar (2026-09-30/10-01) y son vinculantes para todo el interludio.*

**Dónde está Riuna.** La cadena personal está completa —Planificador → Cronograma → Hoy →
Cronómetro → Parte de horas, con jornada personal— y en planificar por días y por horas ya
está a la par de Super Productivity. Lo que falta es captura rápida, acciones de tarea en
todas partes, rituales, foco, recordatorios por tarea, calendario externo, y lo de equipo,
que Super Productivity, monousuario, no puede tener. Y antes de nada, diez defectos
verificados.

**Decisiones del usuario:**

- **Personal primero**, equipo después.
- **El responsable de departamento** —una marca `is_lead` en el equipo— ve el plan, la carga,
  los cierres y el stand-up de su gente, **solo en lectura**: para cambiar algo reasigna o
  cambia el vencimiento, como hasta ahora. Cada persona ve un aviso de que su responsable ve
  su plan.
- **La valoración del día** (impacto, energía, nota) **es siempre privada**: ni el
  responsable la ve.
- **Cuatro rituales** —planificar el día, terminar el día, revisión semanal y stand-up—, que
  **solo se abren con un botón**: sin avisos, banners ni notificaciones.
- **El stand-up solo lo ven la persona y su responsable**, no los compañeros.
- **Modo foco completo**: Pomodoro, Flowtime y cuenta atrás, con avisos de ritmo.
- **Avisos solo por el navegador**, con una pestaña abierta: sin push ni service worker.
- **La Bandeja es un proyecto por persona, oculto en las listas de los demás pero no
  privado**: sus tareas se leen por búsqueda o enlace como todo en Riuna, y la interfaz lo dice.
- **Calendario en las dos direcciones**: exportar ICS e importar iCal.
- **Ausencias y festivos** entran. La ausencia **no guarda el motivo** —una baja médica es un
  dato sensible—: el responsable solo ve «ausente».
- **Zona horaria**: todo el mundo está en la península, así que la instancia pasa a
  `Europe/Madrid`; la zona por persona sigue como deuda.
- **Sanear primero**.

**Hallazgos verificados en el código, que arregla el Bloque 0:**

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | Pantallas con datos viejos: `refetchOnMount: false` global y sin sondeo en Hoy, Planificador y Cronograma; una consulta invalidada mientras no está en pantalla no se recarga al volver | `apps/web/src/query-client/index.ts:65-66` |
| 2 | Una tarea recién asignada no llega a Hoy ni a «Sin planificar»: `MY_WORK_INVALIDATED` solo invalida `my-work` y los paneles; `TIMER_CHANGED` no invalida el Planificador | `apps/web/src/hooks/use-user-websocket.ts:59-68` |
| 3 | El cronómetro **solo arranca desde Hoy**; no hay registro manual (los hooks existen sin consumidor); el detalle no enseña tiempo ni día planificado | `components/timer/timer-button.tsx` |
| 4 | Planificador: no se ancla una hora en un día sin filas con hora (la zona no se pinta); las ancladas no se arrastran; sin casilla de hecha | `components/planner/planner-day.tsx:103` |
| 5 | Los atajos `s/p/a/l/d` del detalle están definidos y **no registrados**; «t c» no se asigna a quien crea y el botón de cabecera sí; la paleta no lleva a Hoy, Planificador ni Cronograma; posible recursión del «?» | `constants/shortcuts.ts`, `command-palette/index.tsx:69,194` |
| 6 | El recordatorio de vencimiento solo llega al **responsable principal**, y solo se rearma desde un endpoint de los varios que cambian la fecha | `scheduler/due-date-reminders.ts:44,54`, `update-task-due-date.ts:28` |
| 7 | Móvil: el tiempo real, la campana y el cronómetro viven en la barra lateral, desmontada mientras la hoja está cerrada; las acciones de Hoy solo aparecen con el ratón encima | `workspace-switcher.tsx:40`, `sidebar-timer.tsx` |
| 8 | La carga del Cronograma usa otra fórmula que el Planificador; borrar un widget o un objetivo no pide confirmación; Mis tareas corta en 100 sin avisar; el parte de horas calcula el rango en UTC | `schedule/time-grid.tsx:282`, `time-sheet.tsx:46`, `export-time-sheet.ts:46` |
| 9 | MCP: el servidor HTTP tiene 44 herramientas y el paquete stdio 39 —le faltan las del plan y el cronómetro— | `apps/api/src/mcp/tools.ts`, `packages/mcp/src/tools/register.ts` |
| 10 | «Hoy» es el día del servidor —UTC en Docker— y `planned_date` se compara por **igualdad exacta**: cambiar la zona sin normalizar los datos rompe el orden del plan y «Hechas hoy» | `set-plan-order.ts:43`, `set-plan-entry.ts:57`, `get-today.ts:92` |

**Bloques.** Tamaños a ~8 h/semana: **S** unos días · **M** ≈ 1 semana · **L** 2+ semanas.
Cada sub-bloque se entrega solo, en su rama, con su ADR —la numeración sigue en la 048— y su
verificación.

**Bloque 0 — Sanear** (≈ 4 semanas)

- **0.1 Pantallas frescas y runtime de espacio** ✔ · S · [ADR 048](adr/048-frescura-de-las-pantallas-personales.md). `workspace-runtime.tsx`, sin
  nada que pintar, montado en la ruta del espacio —que persiste entre pantallas— recoge lo
  que hoy vive en la barra lateral: la conexión del canal de usuario, el título con el
  cronómetro, el aviso de estimación superada y Ctrl+E. Un mapa puro mensaje → claves de
  consulta (`MY_WORK_INVALIDATED` añade Hoy, Planificador y Cronograma; `TIMER_CHANGED`, el
  Planificador). Las consultas personales recargan al montar y al volver a la pestaña con 15 s
  de frescura; el valor global no cambia, porque los tableros son pesados. Campana compacta en
  la cabecera del móvil. **Hecho (2026-10-01):** tres pruebas de extremo a
  extremo nuevas en `today.spec.ts` —una asignación hecha desde fuera aparece en
  Hoy sin recargar; al volver del Planificador a Hoy se ve lo planificado
  mientras tanto; en móvil la campana de la cabecera cuenta en vivo con la
  barra cerrada— **fallan con el código anterior** (comprobado retirándolo) y
  pasan con este; el humo completo queda en 29 casos en verde, más 7 pruebas
  unitarias del mapa de invalidaciones (288 en el web).
- **0.2 Zona horaria de la instancia** ✔ · S · [ADR 049](adr/049-la-api-vive-en-madrid.md). `TZ=Europe/Madrid` (+ `tzdata`) en
  `Dockerfile.riuna`, los `compose*.yml`, `charts/riuna` y los scripts de prueba. Un
  normalizador de arranque, como los `utils/migrate-*.ts`, lleva `personal_plan_entry.planned_date`
  y `schedule_block.planned_date`/`ends_at` de la medianoche UTC a la de Madrid; es idempotente,
  porque la medianoche de Madrid nunca cae a las 00:00Z. `task.due_date` no lo necesita: se
  compara por rangos. **Se ensaya sobre una copia de producción antes de desplegar.**
  **Hecho (2026-10-01).** Sin `TZ` en el `.env`, que `compose` comparte con
  Postgres. PostgreSQL se queda en UTC, porque sus `now()` escriben en columnas
  sin zona. Pasar las pruebas en Madrid destapó tres cosas que el UTC tapaba,
  arregladas y con su prueba:
  - node-postgres serializaba los `Date` crudos en hora local, y la ventana
    «vence hoy» se corría dos horas (`defaults.parseInputDatesAsUTC`);
  - la tendencia, la semana en curso y el burndown cortaban los días en UTC
    (`serverWallTime`);
  - el diálogo de bloques leía su día cortando el ISO.

  Y se arregla un fallo que ya estaba en producción: un vencimiento elegido en
  el calendario salía «vencido» el mismo día en que vencía.

  Verificación:
  - ensayo sobre una copia de la base de desarrollo: 13 días convertidos, 0 en
    la segunda vuelta, las 14 filas conservan su día;
  - integración 659/659 en Madrid, unitarias 717 (API) y 288 (web);
  - humo 29/29 con API y navegador en Madrid. Al arrancar, la API del humo
    convirtió 186 días viejos de su propia base.

  **Pendiente de quien despliega:** el ensayo sobre una copia de producción
  que describe `actualizar.md`.
- **0.3 Cronómetro en todas partes y tiempo en el detalle** ✔ · M. Un `TaskTimerButton` sobre
  `TimerButton` en el detalle, el Planificador, el Cronograma, Mis tareas y el tablero. El
  detalle gana una sección «Tiempo»: lo registrado (también en tareas sin hijas), sus
  entradas, «Añadir tiempo» a mano y el día planificado (`GET /planner/entry/:taskId`, nueva).
  El parte de horas enseña el título de la tarea en cada entrada y calcula en día local; la
  pastilla del móvil reanuda.
  **Hecho (2026-10-01).** Sin ADR propia: no hay decisión estructural, solo
  piezas que componen lo que ya existía.
  - `TaskTimerButton` lee el cronómetro en marcha por su cuenta y solo monta
    el diálogo de parada larga en la tarea que corre. No se ofrece a quien no
    puede editar tareas, porque `POST /time-entry/start` daría 403.
  - `GET /planner/entry/:taskId` devuelve el día como clave del servidor, no
    como instante, y filtra por espacio.
  - Las entradas de una tarea pasan a la clave `["time-entry", "task", id]`.
    Así `TIMER_CHANGED` las refresca; antes `["time-entries"]` quedaba fuera.
  - El nombre del Excel del parte deja de salir un día corto.
  - Nueva variante CSS `touch:` para lo que en escritorio aparece al pasar el
    ratón.

  Verificación:
  - 3 pruebas de integración nuevas de la ruta, incluida la de otro espacio,
    y 1 del nombre del Excel;
  - 3 de extremo a extremo (`task-time.spec.ts`): arrancar y parar desde el
    detalle, registrar a mano y verlo en el parte con su título, y planificar
    desde el detalle. La del parte **pasaba sin desplegar el grupo**, porque el
    pie de la barra también nombra la tarea («Reanudar · …»); acotada a la
    tabla, falla sin el cambio y pasa con él;
  - humo completo 32/32, más una pasada visual con capturas del detalle, el
    Planificador, el Cronograma, Mis tareas, el tablero, el parte y el móvil.

  Queda anotado:
  - `apps/api/openapi.json` no se regenera desde la Fase 5. Regenerarlo mete
    unas 9.000 líneas ajenas y la URL de la API del `.env`; pide su propio
    cambio, con la URL saneada.
  - El calendario heredado nombra los días en inglés.
- **0.4 Planificador, atajos y paleta** ✔ · M. La zona «con hora» siempre presente, las ancladas
  arrastrables, casilla de hecha (`POST /task/complete/:id`, que ya existe). `s/p/a/l/d`
  registrados; «t c» se asigna a quien crea fuera de un proyecto. La paleta lleva a las
  pantallas personales y al cronómetro, y el «?» deja de despachar un `KeyboardEvent`
  sintético. En táctil, las acciones de Hoy se ven y el Cronograma crea con un toque.
  **Hecho (2026-10-01).** Sin ADR propia: no hay decisión estructural.

  Lo que salió:
  - **El bucle del `?` era real.** «Atajos de teclado» desde la paleta lanzaba
    cuatro `RangeError: Maximum call stack size exceeded`, comprobado en el
    navegador con el código anterior. Ahora la paleta abre la ayuda con un
    store (`store/shortcuts-help.ts`), y el `?` real lo sigue atendiendo el
    propio diálogo.
  - **Los atajos del detalle** gobiernan cinco selectores, que pasan a admitir
    `open`/`onOpenChange` desde fuera (`useControllableOpen`). Solo se abre el
    de la disposición que se ve, porque el lateral monta la móvil y la de
    escritorio a la vez. Con el detalle abierto, `p` tapa las secuencias
    `p c`/`p l`; queda documentado.
  - **`p l`** abre la paleta, que ahora lista los proyectos. Antes navegaba a
    la raíz del espacio, que lleva a Hoy.
  - **Variante CSS `touch:`** en Hoy, el Cronograma y la vista Mes. En el
    Cronograma, un toque calcula el hueco desde el propio toque, porque
    `pointerleave` llega antes que el clic.
  - **Se sospechó** un bucle de renders por `useRegisterShortcuts`, que
    vuelve a registrar cada vez que cambia su objeto de configuración. Medido
    en el navegador: ni avisos de React ni pérdida de fotogramas (57 fps en
    reposo). No se confirma; lo nuevo memoriza su configuración igualmente.

  Verificación:
  - 6 pruebas de extremo a extremo nuevas, que fallan con el código anterior
    y pasan con el nuevo: anclar en un día vacío, casilla de hecha, soltar en
    «Sin planificar» sin peticiones, `p` abre la prioridad, la paleta lleva
    al Planificador, la ayuda desde la paleta sin errores;
  - humo completo 38/38, unitarias del web 288, typecheck.
- **0.5 Recordatorios, coherencia y paridad MCP** ✔ · M · [ADR 050](adr/050-recordatorios-por-asignado-y-una-sola-carga.md). Recordatorio de vencimiento
  para **cada** asignado, deduplicado por persona (el `reminder_type` lleva el usuario, como
  ya hace `project-webhook-reminders.ts`) y rearmado por un disparador `AFTER UPDATE OF
  due_date`: muchos escritores, la misma razón que la ADR 025. Una sola función `dayLoad()`
  para la carga del Planificador y del Cronograma. Confirmar al borrar widget y objetivo; Mis
  tareas con «Cargar más». Las cinco herramientas del plan y el cronómetro, también en el
  paquete stdio, con una prueba de paridad entre los dos registros.
  **Hecho (2026-10-01).** Además de lo previsto:
  - **Lo archivado tampoco avisa.** El trabajo excluía lo terminado por
    `column.is_final`, y una tarea archivada, sin columna, recibía avisos.
    Ahora usa `completed_at` (ADR 030) y descarta lo archivado aparte.
  - **Un prefiltro sargable sobre `due_date`**, porque la antelación está
    acotada a 30 días.
  - **La carga deja de contar lo ya hecho.**
  - **`user_work_schedule` no estaba registrada en el esquema de drizzle**,
    el mismo hueco que `task_assignee` en la Fase 1. Lo destapó la prueba
    de carga.
  - **La confirmación de borrado** es un componente compartido
    (`ConfirmDeleteDialog`), sobre el mismo `AlertDialog` que el resto
    repetía a mano.

  Verificación:
  - 6 pruebas de integración de recordatorios, que fallan todas con el
    trabajo anterior;
  - una que fija la misma carga en el Planificador y el Cronograma, y 4
    unitarias de `dayLoad`;
  - la prueba de paridad MCP, que falla sin las cinco herramientas;
  - una de extremo a extremo con 101 tareas para «Cargar más»;
  - integración 669/670 con la API en Madrid: la que falta es la
    importación grande, que agota el tiempo de conexión cuando la máquina
    está cargada y pasa sola (19/19), como ya pasó en el 0.2;
  - unitarias 726 (API) y 288 (web), humo 39/39, typecheck.

**Bloque 1 — Captura y acciones** (≈ 3 semanas) · *punto de control al cerrarlo*

- **1.1 Bandeja** ✔ · S · [ADR 051](adr/051-la-bandeja-es-un-proyecto-oculto.md). `project.owner_user_id → user ON DELETE SET NULL` con un único
  parcial por espacio y persona. Se oculta en `get-projects.ts` —que cubre la barra lateral,
  los selectores, la administración y `list_projects` de MCP— y en los proyectos de la
  búsqueda; **no** en las lecturas de tareas. Se crea al primer uso, segura ante dos capturas
  simultáneas. Si se borra a la persona, pasa a ser un proyecto normal y nada se pierde.
  **Hecho (2026-10-02).** Además de lo previsto:
  - **También al salir del espacio.** Un disparador `AFTER DELETE` en
    `workspace_member` la devuelve a proyecto normal. Si no, sus tareas
    quedaban en un proyecto que ya no salía en ninguna lista. Salir tiene
    varios caminos —quitar a un miembro, abandonar el espacio, borrar la
    cuenta—, así que la regla vive en la base.
  - **La respuesta de reordenar proyectos** tampoco la incluye: también es
    una lista.
  - **`POST /capture/inbox`** la crea y `GET /capture/inbox` la lee sin
    crearla. La entrada «Bandeja» lleva a `/inbox`, que la crea si hace falta
    y abre sus tareas en «Tareas»: la vista «Backlog» de Kaneo solo enseña lo
    planeado y lo archivado. La paleta también lleva a ella. Solo la ve quien
    puede crear tareas, o quien ya la tiene.
  - **`insertProject()` sale de `createProject`**, para que la Bandeja nazca
    con las mismas columnas y el mismo candado de orden.
  - **El widget «Bandeja» del panel pasa a llamarse «Notificaciones»**, que
    es lo que enseña. Si no, «Bandeja» nombraba dos cosas distintas. La
    migración solo renombra los que conservan el título de partida.

  Verificación:
  - 11 pruebas de integración. Las de ocultar en listas y búsqueda, y la de
    salir del espacio, fallan sin el cambio;
  - 1 de extremo a extremo desde la barra lateral, y las 4 de «Mi panel» con
    el widget renombrado;
  - 1 unitaria de la barra lateral; typecheck; pasada visual en escritorio y
    móvil.
- **1.2 Captura rápida** ✔ · M · [ADR 052](adr/052-captura-rapida.md). Parser puro sin dependencia —el vocabulario es cerrado—:
  estimación `1h 30m 1h30 1,5h` · día del plan `@hoy @mañana @lun @15/10 [10:00]` —plan y hora,
  **nunca** vencimiento— · vencimiento `!mañana !15/10` · `#etiqueta` (solo las que existen) ·
  `+PROY` (por defecto, la Bandeja) · prioridad `*alta *a *urgente` · `\` para escribirlo
  literal. Chips de vista previa, tecla `q`, y `POST /capture` sobre `createTask` y
  `setPlanEntry`. MCP `capture_task` y `get_today`.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **Un día de la semana es el próximo**, nunca hoy: `@lun` en lunes es el de
    la semana que viene, y para hoy está `@hoy`. Una fecha sin año es la
    próxima vez que llega. La hora se escribe detrás del día
    (`@mañana 10:00`), y `@10:00` solo es hoy a esa hora.
  - **`#etiqueta`** casa sin distinguir mayúsculas ni tildes, y los espacios
    del nombre se escriben con guion. Lo que no casa se queda en el título.
  - **La tarea empieza en la primera columna sin terminar** del proyecto, que
    puede no ser `to-do`.
  - **Dónde está:** la tecla `q` desde cualquier pantalla, la paleta, Hoy
    (planifica para hoy por defecto), «Sin planificar» y la cabecera de la
    Bandeja propia.
  - **La paleta no lleva la `q` como atajo** de su elemento: dispara los
    atajos mientras se escribe en ella, y saltaría con cualquier búsqueda.
  - **API:** `POST /capture` lo valida todo antes de crear nada: solo
    etiquetas del espacio, nunca una copia colgada de otra tarea, que
    `assignLabelToTask` movería.

  Verificación:
  - 57 pruebas unitarias del parser;
  - 9 de integración: Bandeja al primer uso, plan sin vencimiento, vencimiento
    sin plan, columna inicial, etiquetas, rechazos sin crear nada, permisos,
    y que sale en `GET /today`;
  - 2 de extremo a extremo: desde Hoy, y con `q` desde otra pantalla hasta el
    Planificador;
  - paridad MCP con 46 herramientas; pasada visual en escritorio y móvil.
- **1.3 Acciones de fila, imprescindibles y plan en bloque** ✔ · M · [ADR 053](adr/053-acciones-de-fila-imprescindibles-y-plan-en-bloque.md).
  `personal_plan_entry.key_rank` (1-3, único parcial por día: la base impone el máximo de
  tres). `POST /planner/bulk` —deuda declarada en la ADR 047—, `PUT /planner/:taskId/key` y
  `GET /planner?from=` para ir más allá de quince días. Un menú de acciones compartido —hecha,
  cronómetro, hoy, mañana, elegir día, quitar del plan, fijar hora, estimar, imprescindible—
  en Hoy, Planificador, Cronograma y Mis tareas.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **El menú sale con el botón «⋯» y con el clic derecho.** Los dos pintan
    las mismas piezas de base-ui, cada uno con su estado de apertura:
    compartirlo abría los dos a la vez, como enseñó la pasada visual.
  - **La hora y la estimación van en un diálogo**: un campo de texto dentro
    de un menú pelea con su navegación por teclado. Elegir día es un
    calendario en un submenú.
  - **Mis tareas y el Cronograma no leen el plan**: el menú lo pregunta al
    abrirse (`GET /planner/entry/:taskId`, que gana `keyRank`).
  - **Las imprescindibles** van en un grupo propio en Hoy, sin arrastre:
    su orden es el puesto. Se desmarcan solas al cambiar de día, por un
    disparador.
  - **«Añadir todo a hoy»** en «De días anteriores» usa `POST /planner/bulk`.
  - **La ventana del Planificador** se mueve de semana en semana con
    `?from=`. «De días anteriores» se sigue contando desde hoy, y `get_plan`
    de MCP también acepta `from`.

  Verificación:
  - 11 pruebas de integración. La de dos marcas simultáneas falla sin el
    candado: solo dos de seis conseguían puesto y el resto daba 500;
  - 6 de extremo a extremo: tres imprescindibles y el aviso de la cuarta, el
    contextual sin el otro menú abierto, los dos diálogos, «Añadir todo a
    hoy», Mis tareas y la ventana más allá de quince días;
  - pasada visual del menú en Hoy y del contextual en el Planificador.
- **1.4 «Esperando a»** ✔ · S. Lo que creé y asigné a otros y sigue abierto, más lo mío
  bloqueado por tareas ajenas. «Lo creé yo» sale de `activity`, porque `task` no tiene
  `created_by`; si el `EXPLAIN` no cabe en 300 ms, ADR aparte para la columna.
  **Hecho (2026-10-02).** Sin ADR: la medición no pidió la columna.
  - **`GET /my-work/waiting`** devuelve dos listas, topadas en 100 cada una:
    - **delegadas:** lo que creé, abierto, con alguien asignado y sin mí;
    - **bloqueadas:** lo mío abierto con una tarea abierta delante que no es
      mía, por una relación `blocks`, y con cuál.
  - **«Lo creé yo»** sale de la actividad `created`.
  - **La tarea que bloquea tiene que ser del mismo espacio**: una relación
    puede cruzarlos, y si no se exige, se filtraría el título de una tarea
    ajena.
  - **Medido en el banco de 50.000 tareas**, al que se añadieron 200.000 filas
    de actividad y 2.000 relaciones: p95 de 57 ms. La consulta de delegadas
    tarda 13 ms y va entera por índices. No hace falta `created_by`.
  - **Pestaña «Esperando a» en Mis tareas**, sin ámbito de equipo.

  Verificación:
  - 4 pruebas de integración. La del espacio de la tarea que bloquea falla
    sin su guarda;
  - 1 de extremo a extremo: lo bloqueado sale con su bloqueo y desaparece al
    terminarlo;
  - pasada visual.

  **Verificación del Bloque 1 completo (2026-10-02):**
  - integración 706 de 706, con una prueba del 0.3 ajustada a la forma nueva
    de `GET /planner/entry`, que ahora lleva `keyRank`;
  - de extremo a extremo 49 de 49. Dos pruebas anteriores necesitaron
    ajuste: la misma forma nueva, y el botón «Hoy» de la ventana del
    Planificador, que ahora se llama «Volver a hoy» para no confundirse con
    el de la barra lateral;
  - unitarias 346 (web), 726 (API) y 33 (MCP);
  - typecheck de todos los paquetes, Biome e i18n.

**Bloque 2 — Rituales** (≈ 3 semanas)

- **2.1 Terminar el día** ✔ · M · [ADR 054](adr/054-terminar-el-dia-y-la-valoracion-privada.md). `review` guarda lo que el responsable puede ver
  (`period` día|semana, bloqueos, resumen) y `review_private`, 1:1, la valoración. **La
  separación es estructural**: el camino del responsable no puede unir la tabla privada, y una
  prueba de arquitectura lo vigila. Pasos: resumen → **decisión obligatoria** sobre cada
  pendiente (mañana, otro día o quitar del plan) → bloqueos → valoración privada → plan de
  mañana. Botón en la cabecera de Hoy.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **Pendiente** es lo mismo que enseña Hoy: lo planificado ese día y lo de
    días anteriores, sin terminar. Sin una decisión por cada una,
    `PUT /review/day/:date` responde 400.
  - **«Mañana» es el siguiente día laborable** de la jornada personal: un
    viernes, el lunes.
  - **Las cifras del cierre** salen de `getToday` en el mediodía de ese día.
    Cerrar otra vez acumula las movidas en vez de borrarlas.
  - **`dayClosed` en `GET /today`** sale de un fichero que no importa la tabla
    privada, y una prueba de arquitectura vigila que nadie más la nombre.
  - **`RitualShell`**, el armazón de pasos, queda para los demás rituales.

  Verificación:
  - 5 pruebas de integración;
  - la de arquitectura, que falla con un fichero de prueba que nombra la tabla
    fuera del módulo;
  - 4 unitarias del siguiente día laborable;
  - 1 de extremo a extremo con el ritual completo;
  - pasada visual.
- **2.2 Planificar el día** ✔ · S. Pura composición, sin API: lo de ayer → lo urgente → Bandeja y
  sin planificar → imprescindibles → carga frente a capacidad → anclar → «Empezar».
  **Hecho (2026-10-02).** Sin ADR ni API propia.
  - **Cada paso actúa al momento**, con las mismas mutaciones que Hoy y el
    menú de fila, así que el siguiente paso ya ve el cambio.
  - **«Sin planificar»** enseña las 15 primeras y remite al Planificador para
    el resto.
  - **Las horas se anclan** al salir del campo o con Intro. «Empezar» arranca
    el cronómetro en la primera imprescindible, o en la primera del plan si
    no hay ninguna.
  - **Botón en la cabecera de Hoy**, junto a «Terminar el día».

  Verificación: 1 prueba de extremo a extremo con los seis pasos y el
  cronómetro en marcha; pasada visual.
- **2.3 Revisión semanal** ✔ · M. Vaciar la Bandeja, vencidas, «Esperando a», la semana pasada
  —horas, hechas y precisión de estimación— y planificar la siguiente.
  **Hecho (2026-10-02).** Sin ADR propia: el cierre semanal es el periodo
  `week` de la ADR 054.
  - **`GET/PUT /review/week/:start`**: los siete días desde `start`. Las
    cifras se recalculan en cada lectura y se congelan en el resumen al
    guardar.
  - **La precisión** solo cuenta lo terminado con estimación y tiempo
    registrado. Una tarea sin medir no dice que se tardara menos: la primera
    pasada visual enseñaba «100 % menos».
  - **Qué semana se revisa:** la que está en curso, según la preferencia de
    comienzo de semana. En sus dos primeros días, la anterior. Se puede
    cambiar entre las dos.
  - **Vaciar la Bandeja** mueve cada tarea a su proyecto sin salir del
    ritual: `TaskMovePopover` gana `onMoved`, que sustituye la navegación.
  - **Comparte con el cierre del día:**
    - `saveReview` y `getReview`;
    - el paso de bloqueos y valoración, extraído a `RatingStep`.
  - **Botón en el Planificador**, y los tres rituales en la paleta.

  Verificación:
  - 3 pruebas de integración: cifras con lo de fuera de la semana, lo ajeno
    y lo sin medir; guardar sin pisar el cierre del día; semana futura;
  - 1 de extremo a extremo: vaciar la Bandeja moviendo a un proyecto,
    planificar una vencida, ver las cifras y guardar;
  - pasada visual.
- **2.4 Stand-up** · S. Derivado, sin guardar: ayer, hoy y bloqueos. La persona copia el suyo
  en Markdown; el del equipo solo lo ve el responsable (5.3). **Enviarlo a Slack o Telegram se
  aplaza a la Fase 8**, como acción de automatización: las integraciones son por proyecto y
  un departamento no es un proyecto.

**Bloque 3 — Foco y avisos del navegador** (≈ 2,5 semanas)

- **3.1 Avisos y recordatorio a la hora anclada** · M · ADR 055. Dispara una sola pestaña
  (`navigator.locks`), sin repetir lo ya avisado. `GET /today` da el instante de cada hora
  anclada, calculado en el servidor. Sin service worker la notificación no puede llevar
  botones: al pulsarla se abre un diálogo con «Empezar», «Posponer 10 min» y «Mañana».
  **Límites declarados**: sin pestaña abierta no avisa, en segundo plano puede retrasarse
  alrededor de un minuto, y posponer vale para ese navegador.
- **3.2 Modo foco** · M · ADR 056. Máquina pura en el cliente —Pomodoro 25/5/15×4, Flowtime con
  un descanso del 20 % de lo trabajado, cuenta atrás— sobre entradas de tiempo reales:
  `time_entry.focus_mode`, que se filtra porque el cierre del día cuenta las sesiones. Los
  descansos no registran tiempo, y el cronómetro del servidor manda.
- **3.3 Avisos de ritmo** · S. Descanso, «no estás registrando» en horario laboral (como mucho
  uno por hora) y cronómetro en marcha pasada la jornada.

**Bloque 4 — Calendario** (≈ 3 semanas) · *si falta tiempo, se recorta primero 4.2*

- **4.1 Exportar ICS** · S-M · ADR 057. Feed por token: solo se guarda su sha256, se enseña una
  vez, y se puede regenerar o revocar. Escritor propio: el plan con hora, los bloques (una
  cadencia de intervalo 1 se escribe como RRULE con `TZID=Europe/Madrid`; las demás, ocurrencia
  a ocurrencia) y los vencimientos como días enteros.
- **4.2 Importar iCal** · L · ADR 058. `ical.js` (MPL-2.0, sin dependencias transitivas): expandir
  a mano RRULE, EXDATE, RECURRENCE-ID y los TZID de Outlook es una trampa. La URL se guarda
  cifrada, con guarda anti-SSRF en cada salto, y un trabajo cada quince minutos con
  arrendamiento llena una caché de ocurrencias. Las reuniones entran como bloques fijos de solo
  lectura: cuentan en la carga del Planificador y el Cronograma, y el responsable no las ve.

**Bloque 5 — Equipo** (≈ 2,5 semanas)

- **5.1 Ausencias y festivos** · S-M · ADR 060. `user_time_off` —rangos de días, **sin motivo**,
  con nota privada—, que gestiona la propia persona junto a su jornada, y `workspace_holiday`,
  que gestiona quien administra el espacio. Un día no disponible vale 0, como uno no laborable
  (ADR 045). Las recurrentes se siguen generando en festivo: declarado.
- **5.2 Responsable de departamento** · S · ADR 059. `team_member.is_lead`. **Un único punto
  de visibilidad**, `lead/visibility.ts`, por el que pasa todo controlador del responsable:
  las ADR 041, 046 y 047 ya pagaron tres fugas entre espacios por repetir un `WHERE`. Ningún
  endpoint de `lead/` escribe.
- **5.3 «Mi equipo»** · M. Por persona: plan, capacidad con ausencias y festivos, carga, hechas,
  horas, el cierre **público** y el stand-up, todo en lote —unas ocho consultas para el equipo
  entero— y con sondeo de 60 s.

**Orden.** 0.1 → 0.2 → (0.3, 0.4, 0.5) · 1.1 → 1.2 · 0.3 → 1.3 → 2.1/2.2 · 1.4 → 2.3 ·
2.1 → 2.4 · 3.1 → 3.2/3.3 · 4.1 → 4.2 · 0.5 → 5.1 · 5.1 + 5.2 + 2.4 → 5.3. **Unas 18
semanas nominales, 4-5 meses reales.**

**Riesgos.** (1) El cambio de zona horaria sobre datos existentes, con la igualdad exacta de
`planned_date` y el cambio de hora del 25 de octubre. (2) La visibilidad del responsable:
privacidad y fugas entre espacios. (3) Que alguien espere privacidad de la Bandeja. (4) Que
alguien espere avisos sin tener la pestaña abierta. (5) La importación de iCal: SSRF,
secretos, una licencia nueva y la variedad de feeds.

**Aplazado a sabiendas:** hábitos y contadores · push, PWA y service worker ·
autoplanificar · bandeja de notificaciones completa · mapa de calor · zona horaria por
persona · enviar el stand-up a Slack o Telegram (Fase 8) · matriz de Eisenhower · editar la
recurrencia desde la propia tarea · tiempo real en la vista del responsable · CalDAV y
sincronización bidireccional · avisos de los rituales (decidido: solo botón) · que el
responsable edite el plan ajeno (decidido: solo lectura) · saltarse las recurrentes en festivo.

**Verificación**, en cada sub-bloque:

- **Pruebas unitarias** de toda función pura nueva.
- **Pruebas de integración** de cada invariante:
  - la captura no toca `due_date`;
  - nunca hay más de tres imprescindibles;
  - el aviso de vencimiento llega a cada asignado;
  - los campos privados no salen para nadie más;
  - el responsable no ve otros espacios y no puede escribir;
  - ausencias y festivos dejan la capacidad a cero.
- **e2e** con `E2E_DATABASE_URL` → `riuna_e2e_test`.
- **`EXPLAIN`** en el banco de 50.000 tareas para «Esperando a», la vista del responsable y el
  calendario.

**Hecho cuando:** capturas una tarea con una línea, cierras el día decidiendo qué pasa con lo
pendiente, trabajas en foco con avisos del navegador, ves tus reuniones en el Cronograma, y tu
responsable ve tu plan y tu carga —con ausencias y festivos— pero no tu valoración.

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

La guía de actualización y las copias externas tienen ya un plan concreto,
pendiente de aplicar: [plan de despliegue](plan-despliegue.md) (Oracle Always
Free + Tailscale).

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

## Humo de punta a punta (Playwright)

**El plan daba Playwright por heredado desde la Fase 0 y no existía.** No había
dependencia ni configuración: la frase de la sección de verificación era falsa, y
por eso las Fases 4, 5 y 6 pudieron declarar «no pasado por el navegador» tres
veces seguidas sin que nada lo impidiera. Ahora existe.

`pnpm test:e2e` levanta **su propio par API (1338) + web (5174) contra
`riuna_e2e_test`**, así que no toca la base de desarrollo ni obliga a parar los
servidores de quien esté programando. Siete casos que cubren las cuatro
rebanadas de la Fase 6, en español, que es el idioma que la gente ve. Con las
Fases 7 y 7.5 son **trece**: se suman objetivos, panel y la paleta de datos.

Lo que hizo falta para que arrancara, y que conviene no volver a descubrir:

- **La API no leía `PORT`**: el puerto estaba fijo en 1337, así que una segunda
  instancia era imposible. Añadido y documentado en `.env.sample`, que es lo que
  la guarda de CI de la Fase 4.5 exige.
- **`tsx watch` con la salida redirigida no abre el puerto** —el síntoma que la
  skill `verify` ya describía—, así que el humo arranca la API con `tsx` a secas.
- **Chromium arranca en `en-US`** y la resolución de idioma lo respeta, de modo
  que sin fijar `locale: "es-ES"` el humo mediría una interfaz que ningún usuario
  de Riuna ve.
- **Los desplegables de Base UI sí funcionan** aquí. La nota de la Fase 4 sobre
  que no abren en headless era de otra herramienta, no de Playwright: ese
  aplazamiento se puede retirar.

**Lo que encontró**, que es para lo que estaba: el panel de plantillas se quedaba
en un **esqueleto eterno** cuando el espacio activo no estaba resuelto —la
consulta queda desactivada y `isPending` no baja nunca—. Ninguna prueba de API lo
habría visto, porque la API estaba bien.

**Lo que sigue fuera:** el humo de la Fase 0 —«login → crear proyecto → campo
personalizado → dos subtareas → mover en tablero → filtrar y guardar vista →
exportar»— y el asistente de importación de la Fase 5. La infraestructura ya
está; falta escribir esos casos. Y engancharlo a CI, que pide un servicio de
Postgres y `playwright install`.

## Verificación

Se aprovecha la infraestructura de pruebas heredada: Vitest unitario e
integración y el comprobador de i18n. **Playwright no venía heredado** —esta
sección lo dio por hecho durante seis fases sin que existiera— y se añade en la
Fase 6; ver «Humo de punta a punta» arriba.

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

El **interludio de espacio personal y administración** está **cerrado**: sus
catorce bloques están hechos, commiteados y verificados. Lo siguiente es el
**[interludio de productividad personal y equipo](#interludio--productividad-personal-y-equipo-antes-de-la-fase-8--pendiente)**,
con los sub-bloques **0.1** (pantallas personales frescas,
[ADR 048](adr/048-frescura-de-las-pantallas-personales.md)) y **0.2** (la API
en `Europe/Madrid`, [ADR 049](adr/049-la-api-vive-en-madrid.md)) hechos. Antes
de desplegar el 0.2 hay que ensayar la conversión sobre una copia de
producción, como explica [actualizar.md](actualizar.md). El **0.3** (cronómetro
en todas partes y tiempo en el detalle), el **0.4** (Planificador, atajos y
paleta) y el **0.5** (recordatorios por asignado, una sola carga del día y
paridad de MCP, [ADR 050](adr/050-recordatorios-por-asignado-y-una-sola-carga.md))
también están hechos: **el Bloque 0 está cerrado**. Del **Bloque 1**, captura
y acciones, están hechos el **1.1**, la Bandeja
([ADR 051](adr/051-la-bandeja-es-un-proyecto-oculto.md)), y el **1.2**, la
captura rápida ([ADR 052](adr/052-captura-rapida.md)), el **1.3**, acciones
de fila, imprescindibles y plan en bloque
([ADR 053](adr/053-acciones-de-fila-imprescindibles-y-plan-en-bloque.md)), y
el **1.4**, «Esperando a»: **el Bloque 1 está cerrado**. Del **Bloque 2**,
los rituales, están hechos el **2.1**, terminar el día
([ADR 054](adr/054-terminar-el-dia-y-la-valoracion-privada.md)), y el **2.2**,
planificar el día, y el **2.3**, la revisión semanal; sigue el **2.4**, el
stand-up. Después del interludio viene la **Fase 8**: automatizaciones e
importadores externos.

~~Pendiente suelto del bloque del Cronograma: `tests/e2e/schedule.spec.ts`
está escrito pero sin ejecutar — este devcontainer no tiene Docker, y la
prueba de extremo a extremo necesita la PostgreSQL de `compose.local.yml`.~~
**Ejecutada (2026-09-30, item 14):** no hace falta Docker ni
`compose.local.yml` — `E2E_DATABASE_URL` apuntado a una base propia
(`riuna_e2e_test`) en el PostgreSQL nativo que ya usan las pruebas de
integración basta. De paso salió una regresión real: el ancla de flujo se
esperaba en torno a las 08:00, la constante de instancia que la ADR 045 ya
había sustituido por las 09:00 por defecto. Corregida; las 25 pruebas de
`tests/e2e/` quedan en verde.

**Revisión de código del interludio (2026-09-23):** `/code-review high` sobre
los nueve bloques devolvió 10 hallazgos confirmados, ya corregidos. Cuatro con
riesgo real de perder o falsear datos: `workspaceId` sin comprobar en cuatro
mutaciones del Cronograma/Planificador (`update-block`, `delete-block`,
`set-entry-time`, `remove-plan-entry`), un fantasma de recurrencia que podía
duplicar una tarea ya generada por el planificador real, «sin planificar» sin
excluir lo archivado, y un `minuteSchema` que dejaba pasar `1440` donde la
CHECK de Postgres exige `0–1439` (salía 500 en vez de 400). El resto son
inconsistencias del "día del servidor": una clave de día en UTC
(`toISOString().slice(0,10)`) frente al resto de la superficie en hora local,
`validateAndParseDate` interpretando mal un `yyyy-mm-dd` pelado, y el
`due-window` del cliente recalculando la ventana con su propio reloj en vez de
leer la que ya resuelve la API (`dueWindowExpression`, extraída a
`utils/due-window.ts` y proyectada como columna en la búsqueda de "Mis
tareas"; la API también publica su `serverToday`). Más tres del lado web: una
vista de espacio sin proyecto que no se invalidaba por WebSocket, un redirect
legado de ajustes de proyecto que perdía el `_splat`, y una `queryKey` de
"Mis tareas" que no cubría `sortOrder`/`page`/`limit`. ADR 040/041/042 llevan
la actualización correspondiente.

**Las dos cosas que la Fase 7 dejaba abiertas están cerradas**, y las cerró la
Fase 7.5:

- ~~Objetivos, compartir y el widget de objetivo no se han visto nunca en
  pantalla.~~ **Vistos**, en los dos temas y a 1440 y 390 px. De ahí salió que el
  selector de objetivo del editor estaba anidado dentro de otro desplegable, así
  que **el widget de objetivo era increable** — un fallo que solo un navegador
  podía encontrar. Sigue sin verse el **cubo «otros»**, que necesita más de
  cincuenta grupos y no se provoca con datos de prueba razonables.
- ~~El humo de Playwright no se ha ejecutado.~~ **Ejecutado, y no arrancaba:**
  `vite.config.ts` fija el puerto a fuego y no lee `PORT`, así que el web abría
  5173 mientras Playwright esperaba 5174. Ahora son **13 casos en verde**.

Lo que arrastra la Fase 6, y que sigue abierto:

- ~~Ninguna de las cuatro rebanadas se ha pasado por el navegador.~~ **Cerrada,
  y con ella la deuda que arrastraban las Fases 4 y 5.** Ver «Humo de punta a
  punta» más arriba.
- **Faltan dos casos de humo:** el de la Fase 0 —login → proyecto → campo
  personalizado → dos subtareas → mover en tablero → filtrar y guardar vista →
  exportar— y el del asistente de importación de la Fase 5. La infraestructura
  está; falta escribirlos y engancharlos a CI.
- **Sigue sin decidirse cuándo migrar Tablero, Lista y Backlog al motor de
  filtros.** Arrastra desde la Fase 4.
- **Repaso de diseño de «Mi trabajo» (2026-09-07).** La pantalla se construyó al
  final de la Fase 6, después de que las ADR 018-021 fijaran la escala, la
  densidad, la elevación y el movimiento en tokens, y la capa visual se escribió
  saltándoselas. Veinte hallazgos contra [`marca.md`](marca.md) y esas ADR;
  aplicados todos menos los tres de abajo. Lo gordo eran cuatro cosas visibles: la
  página no tenía margen lateral, en tema oscuro no se distinguía el filtro
  activo, el control de filtros no tenía foco de teclado y el contador de cada
  sección contaba la página en vez de la sección. De paso se extrae el control
  segmentado a un primitivo y convergen los tres sitios que lo tenían a mano
  ([ADR 028](adr/028-control-segmentado.md)).

  **Deuda que deja el repaso:**

  - ~~**El recuento topado en 500 está sin medir.**~~ **Medido y confirmado**
    (2026-09-08, banco con 100.000 tareas): el `count(*)` sobre la subconsulta
    con `LIMIT 501` sale a **11 ms y 1.607 bloques**, frente a **37,7 ms y 5.367
    bloques** del mismo recuento sin topar. El tope **sí** acota el barrido —3,4
    veces más rápido y un tercio de los bloques— y, al ir en paralelo con la
    consulta de página (39,9 ms), no suma latencia. El razonamiento era correcto,
    y ahora está comprobado en vez de supuesto.
  - **El resalte de tiempo real no se puede enganchar aquí.**
    `useRealtimeHighlightStore` existe y lo usa la vista Lista, pero solo lo
    dispara `use-project-websocket`. «Mi trabajo» se refresca con
    `MY_WORK_INVALIDATED`, que **no lleva el id de la tarea a propósito**
    (ws/index.ts): añadirlo obligaría a resolver `project → workspace` en cada
    evento. Cumplir el principio 5 de `marca.md` en esta página exige cambiar la
    forma del mensaje, que es una decisión de protocolo, no de diseño.
  - ~~**Los tamaños de texto arbitrarios siguen.**~~ **Cerrada** por la Fase
    7.5: los 119 tamaños arbitrarios volvieron a los siete papeles de §05 y no
    queda ningún `text-[Npx]` en `apps/web/src`. Lo que sigue fuera son las 48
    clases de tamaño de Tailwind de pantallas que esa revisión no recorrió; ver
    su deuda declarada.
