# Riuna — Plan de desarrollo

> Documento vivo. Se actualiza al cerrar cada fase; el estado de la tabla de
> abajo manda sobre cualquier otra cosa escrita aquí.
>
> Complementarios: [qué hace Riuna hoy](funcionalidades.md) ·
> [auditoría de partida](auditoria-fase-0.md) ·
> [decisiones (ADR)](adr/) · [copias de seguridad](copias-de-seguridad.md) ·
> [actualizar la instancia](actualizar.md) ·
> [plan de despliegue](plan-despliegue.md) ·
> [comparativa con OpenProject](comparativa-openproject.md)

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
| Interludio — Productividad personal y equipo | 18 | **Cerrado** — Bloques 0 a 5; el 4.2 (importar iCal), aplazado · [plan por bloques](#interludio--productividad-personal-y-equipo-antes-de-la-fase-8--cerrado) |
| Cierre de la deuda de las fases cerradas | 18 | **Cerrado** — cinco tandas, en `main` el 2026-10-05 (PR #38–#45); la facturación heredada sigue abierta por decisión · [inventario](#cierre-de-la-deuda-de-las-fases-cerradas) |
| 8 — Automatizaciones, hoja de SERVITEC y stand-up a chat | 9 | **Cerrada** (2026-10-07) — los importadores externos, solo documentados · [plan por bloques](#fase-8--automatizaciones-hoja-de-servitec-y-stand-up-a-chat--cerrada) |
| 9 — Operación | 6 | **Hecha salvo lo que se lanza en el PC** (2026-10-11): el informe de la base (5.2) y el simulacro con la copia real (7.2) · [plan por bloques](#fase-9--operación) |
| **Total Bloque A** | **45** + 18 del interludio | |
| Interludio — Ideas de OpenProject (antes de la Fase 10) | ≈ 23 | **En curso** — planificado el 2026-10-12, cinco tandas; hechas la tanda 1 (1.1-1.6) y la tanda 2 (2.1-2.4), y de la tanda 3 la 3.1 · [plan por tandas](#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado) |

**Estimación honesta:** 35 semanas nominales —las 29 del plan original más las
6 de las Fases 4.5 y 7.5, que no estaban— a ~8 h/semana son **10-13 meses**
reales para cerrar el Bloque A. La ventaja del fork no está en la fecha final,
sino en cuándo llega el valor: Riuna fue usable en la **semana 2** y la
plataforma diferencial —árbol, campos personalizados, vistas e importación—
llega en la **semana 18**. Escribiéndolo desde cero, en la semana 18 habría un
gestor de tareas básico y nada propio.

La Fase 8 se replanificó el 2026-10-05 al empezarla: pasa de 3 a **9 semanas
nominales** porque entran el motor de automatizaciones completo, las reglas de
espacio, los disparadores por fecha, el stand-up a chat y la hoja de SERVITEC de
ida y vuelta, y salen los cuatro importadores externos. Ver su sección.

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
- ~~Catalán: 238 de 1.760 claves traducidas de verdad (13,5%); el resto es relleno
  en español.~~ **Cerrado por decisión (2026-10-03):** retirado en la Fase 4.5 y
  así se queda.
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
  - ~~**Asignar exige `task:assign`, que solo tienen `admin` y `owner`.**~~ **Cerrado
    (2026-10-03, [ADR 062](adr/062-los-miembros-asignan-tareas.md)).** Un
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
- ~~Las tarjetas de tablero y lista muestran solo al responsable principal; la
  lista completa de asignados solo se ve en el detalle.~~ Cerrado (punto 15 del cierre de la deuda).
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
- ~~**El tipo `relación` no está conectado a nada.**~~ Existe en el vocabulario y
  la validación lo mantiene fuera del JSONB —su valor son filas de
  `task_relation`, que sí tiene integridad referencial—, pero nadie lo enlaza.
  El criterio de aceptación pedía «Cliente (relación)» y esa mitad no está.
  **Cerrado por decisión (2026-10-03), y trasladado a la Fase 10:** un «Cliente»
  tiene que apuntar a una empresa, no a una tarea, y las dependencias entre
  tareas ya existen como `blocks`.
- **Definir campos es cosa de `admin` y `owner`.** El rol `member` heredado
  tiene `project: ["create", "read"]` y no `update`, así que un miembro puede
  rellenar valores (`task:update`) pero no crear el campo. No es decisión de
  esta fase sino el vocabulario heredado, y es el mismo hallazgo que la Fase 1
  hizo con `task:assign`. Queda documentado en las pruebas y en la
  [ADR 013](adr/013-campos-personalizados.md).
- ~~**No hay editor de definiciones.** Se crean desde el «+» de la vista Tabla;
  renombrar, archivar, borrar y reordenar existen en la API y no en la
  interfaz. Tampoco hay forma de crear un campo de alcance espacio de trabajo
  sin llamar a la API.~~ **Cerrado (2026-10-04)**, punto 25 del cierre de la deuda.
- ~~**Cambiar un campo no deja rastro en la actividad**~~ (cerrado, punto 24 del cierre de la deuda), mientras que cambiar el
  título sí. Se notará la primera vez que alguien pregunte quién tocó el
  presupuesto.
- ~~**MCP no sabe de campos personalizados**: `create_task`, `update_task` y
  `list_tasks` los ignoran.~~ Cerrado el 2026-10-04 (punto 27 del cierre de la deuda).
- ~~**Los agregados del árbol no suben los campos numéricos.** Sumar un
  «Presupuesto» de toda la rama es previsible y no está.~~ Cerrado el 2026-10-04
  (punto 30 del cierre de la deuda).
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

**El criterio de aceptación no se cumplió entero**, y se cerró igual a
sabiendas. De lo que pedía —«filtras `Presupuesto > 1000 AND estado != Hecho`,
agrupas por épica, guardas la vista, la compartes, y el mismo filtro funciona
en tablero, calendario y gantt»— faltaban agrupar por épica y que el filtro
llegara al tablero. **Las dos cosas están hechas desde el 2026-10-04** (puntos 32
y 33 del cierre de la deuda).

- ~~**Tablero, Lista y Backlog siguen filtrando en el cliente.**~~ Migradas el 2026-10-04
  (punto 33 del cierre de la deuda, [ADR 065](adr/065-tablero-lista-y-backlog-filtran-en-el-servidor.md)).
  Las dos notas de abajo se cumplieron tal cual: etiquetas por nombre y fechas relativas
  traducidas a absolutas en el navegador.

- ~~**No hay agrupación por épica** ni forma de elegir qué columnas se ven. Por
  eso una vista guardada solo recuerda el filtro y el modo de jerarquía.~~
- ~~**Faltan los agregados del árbol como columnas** ordenables.~~ Los tres
  cerrados el 2026-10-04 (punto 32 del cierre de la deuda).
- ~~**La paginación sigue siendo por desplazamiento**, no por cursor.~~
  **Cerrado por decisión (2026-10-03):** ver «Cierre de la deuda».
- **GIN no acelera los rangos**, que es el ejemplo estrella del plan. Y la
  consulta de «con subtareas» es un bucle anidado sobre `path`: es la primera
  candidata a mirar con `EXPLAIN`.
- **El presupuesto de rendimiento sigue sin medirse**: 50.000 tareas y
  < 300 ms p95. Se arrastra a la Fase 9, que es la otra que lo pedía.
- ~~**Tres gestos sin probar en vivo**~~ (probados, punto 20 del cierre de la deuda): elegir el tipo de un campo, editar un
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
- **Datos:** se empieza limpio, pero importar y exportar **CSV/Excel** es funcionalidad de producto, e importadores desde Trello/Jira/Asana/Notion entran en el plan (desde el 2026-10-05, solo documentados: ver la Fase 8).
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
| Automatizaciones de usuario | **Hecho** (fase 8): reglas de proyecto y de espacio, por evento y por fecha |
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

- ~~**`dueDate eq <día>` sobre columnas `timestamp` sigue comparando un
  instante.**~~ El caso grave —los campos personalizados— está arreglado. Este
  exigía decidir en qué zona horaria vive «un día»: la de la API (ADR 049), y
  **cerrado el 2026-10-03** (punto 16 del cierre de la deuda).

- **Los índices de rango sobre `custom_fields`.** El envoltorio `CASE` que
  protege del tipo equivocado impide que un índice de expresión llegue a usarse
  ([ADR 013](adr/013-campos-personalizados.md)). Medido: `Presupuesto > 1000` es
  un barrido de 12 ms sobre 10.000 tareas, así que no corre prisa.

- ~~**Las pruebas de componente del web** no arrancan en el contenedor de
  desarrollo: los workers de jsdom caducan al iniciarse. Todo lo que sí arranca
  pasa, y CI las ejecuta enteras.~~ Ya arrancan (punto 19 del cierre de la deuda).

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

- ~~**El asistente de importación no se ha pasado por el navegador.**~~ **Cerrado
  (2026-10-04), y era peor que una deuda: el asistente no funcionaba.** Ver el punto 20.
  La API está
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
densidad. ~~El **compositor de tarea en línea** al pie de columna queda para una
pasada propia: es función nueva, no pulido.~~ Hecho el 2026-10-04 (punto 31 del cierre de la deuda). En el Gantt, encajar el arrastre a la
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

~~**Deuda declarada de la rebanada 4:** una plantilla de proyecto guarda columnas y
épicas, pero aplicarla solo despliega el árbol dentro de un proyecto **que ya
existe**.~~ Cerrado el 2026-10-04 (punto 28 del cierre de la deuda): `POST /project`
acepta `templateId`.

~~**Deuda declarada de la rebanada 3:** la plantilla lleva título, descripción,
prioridad, estimación, responsable y equipo, pero **no** etiquetas, épicas,
campos personalizados ni subtareas.~~ Etiquetas, épicas y campos, cerrado el
2026-10-04 (punto 29 del cierre de la deuda); las subtareas siguen fuera.

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
- ~~**`getNotifications` sigue topada en 50 filas sin paginar ni filtrar por no
  leídas.**~~ Invisible en un desplegable, visible a página completa: la bandeja lo
  avisa en vez de fingir que eso es todo. **Cerrado (2026-10-04)**, punto 21 del cierre de la deuda.
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
- ~~**Un widget de espacio todavía no ofrece los campos personalizados del
  espacio**, que la API sí acepta: falta el fetcher que los lea sin pasar por un
  proyecto. Se dijo que iba en la rebanada 2 y **no entró**; sigue abierto.~~
  **Cerrado (2026-10-04)**, punto 26 del cierre de la deuda.
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
- ~~**`GET /api/my-work/tasks` se queda sin consumidor web.**~~ Sigue publicada,
  documentada y probada; retirarla es una decisión sobre la superficie pública
  que no se toma de paso. **Cerrado (2026-10-03):** se mantiene como API pública.
- ~~**El índice `task (completed_at)` está declarado y no construido**, con la
  condición que lo justificaría escrita en la ADR 030.~~ Construido (punto 17 del cierre de la deuda).
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

- ~~**48 clases de tamaño de Tailwind fuera de los siete papeles**~~ (cerrado, punto 11 del cierre de la deuda) —`text-lg` (23),
  `text-2xl` (24), `text-4xl` (1)— en acceso, alta, invitaciones y proyecto
  público. Medidas y acotadas, no barridas a ciegas: son pantallas que esta
  revisión no recorrió.
- **La escala del editor TipTap va aparte**: 28 `font-size` en CSS con valores
  propios. Es prosa, no interfaz densa, y se deja como excepción **declarada**.
- ~~**`i18n:check` no detecta claves usadas que no existen**~~ (cerrado, punto 12 del cierre de la deuda) en ningún idioma:
  comprueba paridad, no existencia. Las tres de ciclos estaban igual de ausentes
  en los tres, así que pasaban por «en sync». La puerta de CI tiene ese hueco.
- **Las leyendas que cada página de ajustes escribe en línea** siguen sin acotar;
  las primitivas compartidas sí. Son leyendas de escaneo, no prosa de lectura.
- ~~**La búsqueda pinta `result.status` crudo**, como hacía la tabla. Resolverlo
  cruza proyectos y necesita una consulta que hoy no se hace.~~ Cerrado (punto 22 del cierre de la deuda).
- ~~**Las preferencias viven solo en `localStorage`** y se pierden al cambiar de
  navegador, aunque la pantalla cuelgue de «Ajustes › Cuenta». De ahí sale también
  que el calendario empiece en domingo.~~ **Cerrado (2026-10-04)**, ADR 064: viajan
  con la cuenta (punto 23 del cierre de la deuda).

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

### Interludio — Productividad personal y equipo (antes de la Fase 8) · **cerrado**

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

  **Ensayo sobre una copia de producción (2026-10-03):** con los Bloques 0
  a 5 encima, la conversión de días lleva las 5 entradas del plan a la
  medianoche de Madrid sin que ninguna cambie de fecha, y la segunda vuelta no
  toca nada.
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
  - ~~`apps/api/openapi.json` no se regenera desde la Fase 5. Regenerarlo mete
    unas 9.000 líneas ajenas y la URL de la API del `.env`; pide su propio
    cambio, con la URL saneada.~~ Regenerado (punto 13 del cierre de la deuda).
  - ~~El calendario heredado nombra los días en inglés.~~ Era el selector de fecha;
    cerrado (punto 5 del cierre de la deuda).
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

  **Cambio posterior (2026-10-03): se llama «Personal».** Tras verla en la
  copia de producción, el usuario pidió llevarla a «Proyectos». Cada persona
  ve la suya fija en lo alto de su grupo «Proyectos», con clave `PER`; la
  migración 0077 renombra las ya creadas. Sigue oculta para los demás y no es
  privada, así que no se llama «privado». Detalle en la ADR 051.
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
- **2.4 Stand-up** ✔ · S. Derivado, sin guardar: ayer, hoy y bloqueos. La persona copia el suyo
  en Markdown; el del equipo solo lo ve el responsable (5.3). **Enviarlo a Slack o Telegram se
  aplaza a la Fase 8**, como acción de automatización: las integraciones son por proyecto y
  un departamento no es un proyecto.
  **Hecho (2026-10-02).** Sin ADR.
  - **`GET /review/standup`**, calculado en `review/standup.ts`:
    - ayer es el último día laborable de la jornada personal;
    - los bloqueos son los del cierre más reciente, de hoy o de ayer;
    - nunca la valoración. El fichero no nombra la tabla privada, y la prueba
      de arquitectura de la ADR 054 lo vigila;
    - el responsable (5.3) reutilizará este mismo cálculo.
  - **El Markdown lo monta el cliente**, en `lib/standup.ts` y con i18n: la
    API devuelve datos.
  - **Diálogo desde un botón en Hoy.** La cabecera de Hoy pasa a partir sus
    tres botones en varias líneas: en móvil se salían de la pantalla.

  Verificación:
  - 2 pruebas de integración, que comprueban que la nota privada no sale;
  - 2 unitarias del Markdown;
  - 1 de extremo a extremo con el portapapeles;
  - pasada visual en escritorio y móvil.

  **Verificación del Bloque 2 completo (2026-10-02):**
  - integración 713 de 716 en la batería completa. Fallaron dos pruebas por
    tiempos y bloqueos con la máquina cargada:
    - un *deadlock* del `TRUNCATE` que limpia la base entre pruebas;
    - la importación grande, intermitente desde el Bloque 0.

    Solas pasan: `task-assignees` a la primera, y la importación 3 de 3
    seguidas;
  - de extremo a extremo 53 de 53;
  - unitarias 352 (web), 727 (API) y 33 (MCP);
  - typecheck de todos los paquetes, `biome ci` e i18n.

**Bloque 3 — Foco y avisos del navegador** (≈ 2,5 semanas)

- **3.1 Avisos y recordatorio a la hora anclada** ✔ · M · [ADR 055](adr/055-avisos-del-navegador-sin-service-worker.md). Dispara una sola pestaña
  (`navigator.locks`), sin repetir lo ya avisado. `GET /today` da el instante de cada hora
  anclada, calculado en el servidor. Sin service worker la notificación no puede llevar
  botones: al pulsarla se abre un diálogo con «Empezar», «Posponer 10 min» y «Mañana».
  **Límites declarados**: sin pestaña abierta no avisa, en segundo plano puede retrasarse
  alrededor de un minuto, y posponer vale para ese navegador.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **Ventana de 15 minutos:** una hora anclada que pasó hace más no avisa al
    abrir la pestaña.
  - **«Mañana» es «Pasar al» siguiente día laborable**, conservando la hora.
  - **Sin `BroadcastChannel`:** `localStorage` ya lo comparten las pestañas,
    y el cerrojo de `navigator.locks` evita que dos avisen a la vez.
  - **El interruptor está en Ajustes › Preferencias** y es por navegador.
    Solo se lee Hoy en segundo plano si está activado.

  Verificación:
  - 7 pruebas unitarias;
  - 3 de integración de `startsAt`, incluida la del 25 de octubre;
  - 1 de extremo a extremo con el reloj adelantado y `Notification`
    sustituida;
  - pasada visual del ajuste y del diálogo.
- **3.2 Modo foco** ✔ · M · [ADR 056](adr/056-modo-foco-sobre-entradas-reales.md). Máquina pura en el cliente —Pomodoro 25/5/15×4, Flowtime con
  un descanso del 20 % de lo trabajado, cuenta atrás— sobre entradas de tiempo reales:
  `time_entry.focus_mode`, que se filtra porque el cierre del día cuenta las sesiones. Los
  descansos no registran tiempo, y el cronómetro del servidor manda.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **Tras un descanso la sesión queda «lista»**: el siguiente bloque no
    empieza solo.
  - **El descanso de Flowtime** va de 1 a 30 minutos.
  - **`POST /time-entry/start`** abre otra entrada si cambia el modo en la
    misma tarea, y no hace nada si es el mismo.
  - **`GET /today` cuenta las sesiones del día**, y el cierre las guarda.
    `GET /time-entry/task/:taskId` devuelve el modo de cada entrada.
  - **El cronómetro del servidor manda**, con 15 segundos de gracia para que
    el arranque llegue a su consulta.
  - **Pantalla completa** en `focus/$taskId`, la fase en el pie de la barra
    lateral y «Modo foco» en el menú de fila. La primera pasada visual
    enseñó la pantalla encogida en una columna: el contenedor padre es flex
    y faltaba el ancho completo.

  Verificación:
  - 9 pruebas unitarias;
  - 4 de integración;
  - 1 de extremo a extremo con el reloj adelantado;
  - pasada visual.
- **3.3 Avisos de ritmo** ✔ · S. Descanso, «no estás registrando» en horario laboral (como mucho
  uno por hora) y cronómetro en marcha pasada la jornada.
  **Hecho (2026-10-02).** Sin ADR propia: van en la
  [ADR 056](adr/056-modo-foco-sobre-entradas-reales.md), con el modo foco. Decisiones de detalle:
  - **Descanso tras 90 minutos seguidos**, y otra vez cada 90. Las entradas
    con huecos de menos de 5 minutos cuentan como seguidas: cambiar de tarea
    no es descansar.
  - **`GET /time-entry/running` da `workingSince` y `lastStoppedAt`**, de
    todos los espacios, con el índice `(user_id, start_time)` que ya había.
  - **«Sin registrar» espera 15 minutos** desde la entrada, la vuelta de la
    comida o la última parada. No suena en los descansos del foco.
  - **«Fuera de jornada» no avisa a quien empieza antes de su hora**, solo
    pasada la salida, en un día no laborable o con un cronómetro de otro día.
  - **Cada aviso se activa aparte**, por navegador, y vienen apagados.
  - **Las ausencias, cuando lleguen (5.1), tendrán que callar «sin
    registrar».**

  Verificación:
  - 8 pruebas unitarias de las reglas;
  - 4 de integración, una con un hueco de 5 minutos justos, que destapó un
    `<` que debía ser `<=`;
  - 1 de extremo a extremo con `Notification` sustituida. Enseñó que el
    primer aviso ya suena en la página de ajustes, porque el runtime vive en
    todo el panel;
  - pasada visual del ajuste en escritorio y a 375 px.

  **Verificación del Bloque 3 completo (2026-10-02):**
  - integración 726 de 726, con 1 omitida;
  - de extremo a extremo 56 de 56;
  - unitarias 376 (web), 727 (API) y 33 (MCP);
  - typecheck de todos los paquetes, `biome ci` e i18n.

**Bloque 4 — Calendario** (≈ 3 semanas) · *si falta tiempo, se recorta primero 4.2* · **cerrado con el 4.1; el 4.2, aplazado**

- **4.1 Exportar ICS** ✔ · S-M · [ADR 057](adr/057-exportar-el-calendario-por-token.md). Feed por token: solo se guarda su sha256, se enseña una
  vez, y se puede regenerar o revocar. Escritor propio: el plan con hora, los bloques (una
  cadencia de intervalo 1 se escribe como RRULE con `TZID=Europe/Madrid`; las demás, ocurrencia
  a ocurrencia) y los vencimientos como días enteros.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **Uno por persona y espacio**, en Ajustes › Preferencias, con el nombre
    del espacio activo. El enlace entero solo se ve al crearlo o regenerarlo.
  - **Solo con sesión:** las claves de API no pueden crear, ver ni revocar
    el enlace.
  - **En cada petición se busca el hash y se comprueba que la persona sigue
    en el espacio**, antes de la caché de cinco minutos: revocar, regenerar
    o salir del espacio cortan el enlace al momento.
  - **Las series empiezan el día en que se creó el bloque.** Los mensuales
    después del 28 van ocurrencia a ocurrencia, porque «el 31» se recorta en
    los meses cortos y `BYMONTHDAY` se los salta.
  - **Las horas sueltas van en UTC**, válidas en cualquier zona. Las series
    llevan su `VTIMEZONE` de Madrid, porque Outlook la necesita.
  - **«✓» delante de lo terminado**, y «Vence:» o «Due:» según el idioma de
    la persona.

  Verificación:
  - 8 pruebas unitarias del escritor y de la decisión entre serie y
    ocurrencias;
  - 6 de integración. Quitando la comprobación de pertenencia o el rechazo
    de las claves de API, fallan las suyas;
  - 1 de extremo a extremo, del ajuste al `.ics` sin cookies;
  - lectura con `ical.js`, fuera del repositorio: la serie de los lunes da
    las 10:00 de Madrid a ambos lados del cambio de hora;
  - pasada visual del ajuste en escritorio y a 375 px.

  **Verificación del Bloque 4 completo (2026-10-02):**
  - integración 732 de 732, con 1 omitida;
  - de extremo a extremo 56 de 57. Falló «crear una tarea desde un hueco»
    del Cronograma, que también falla 1 de cada 3 veces sola. Es una carrera
    de la prueba, ajena al 4.1: crear desde un hueco son dos peticiones, y la
    prueba leía la API con la segunda en vuelo. Ahora espera a que la tarea
    esté anclada, y pasa 8 de 8;
  - unitarias 376 (web), 735 (API) y 33 (MCP);
  - typecheck de todos los paquetes, `biome ci` e i18n.
- **4.2 Importar iCal** · *aplazado* · L · ADR 058. `ical.js` (MPL-2.0, sin dependencias transitivas): expandir
  a mano RRULE, EXDATE, RECURRENCE-ID y los TZID de Outlook es una trampa. La URL se guarda
  cifrada, con guarda anti-SSRF en cada salto, y un trabajo cada quince minutos con
  arrendamiento llena una caché de ocurrencias. Las reuniones entran como bloques fijos de solo
  lectura: cuentan en la carga del Planificador y el Cronograma, y el responsable no las ve.
  **Aplazado (2026-10-02).** El usuario lo decidió al cerrar el 4.1, antes de
  añadir `ical.js`. La ADR 058 queda reservada para cuando se retome.

**Bloque 5 — Equipo** (≈ 2,5 semanas)

- **5.1 Ausencias y festivos** ✔ · S-M · [ADR 060](adr/060-ausencias-y-festivos.md). `user_time_off` —rangos de días, **sin motivo**,
  con nota privada—, que gestiona la propia persona junto a su jornada, y `workspace_holiday`,
  que gestiona quien administra el espacio. Un día no disponible vale 0, como uno no laborable
  (ADR 045). Las recurrentes se siguen generando en festivo: declarado.
  **Hecho (2026-10-02).** Decisiones de detalle:
  - **Una sola fuente:** `work-schedule/unavailable-days.ts` da el día y su
    tipo, nunca la nota. `capacityForDay` lo recibe y devuelve 0 en el
    Planificador, el Cronograma y Hoy, que pintan «Festivo · nombre» o
    «Ausente».
  - **La ausencia es de un espacio** (toda tabla nueva lleva
    `workspace_id`), como mucho de un año, y se da en Ajustes › Preferencias
    para el espacio activo, debajo de la jornada.
  - **Los festivos van en Administración › Festivos.** Los lee cualquier
    miembro; añadir y quitar piden `workspace:manage_settings`, y un día
    repetido da 409.
  - **Si un festivo cae dentro de una ausencia, se ve el festivo.**
  - **El aviso de «sin registrar» calla en un día no disponible.** El de
    cronómetro fuera de jornada, no.
  - **Pendiente:** ~~«Pasar al siguiente día laborable» aún no salta festivos
    ni ausencias~~ (cerrado, punto 7 del cierre de la deuda), y un festivo nuevo llega a los demás al volver a leer, no
    por WebSocket.

  Verificación:
  - 5 pruebas de integración: capacidad 0 en las tres lecturas sin la nota,
    rango y propiedad, permisos y duplicado, aislamiento entre espacios, y
    festivo dentro de ausencia. Quitando el filtro por persona, el de espacio
    o el permiso, falla la suya;
  - 1 prueba unitaria más de los avisos de ritmo;
  - 2 de extremo a extremo, una por ajuste;
  - pasada visual en escritorio y a 375 px. Con un festivo, en la columna
    estrecha del Cronograma, la fecha se encogía hasta «d…»: ahora se recorta
    la marca.
- **5.2 Responsable de departamento** ✔ · S · [ADR 059](adr/059-responsable-de-departamento.md). `team_member.is_lead`. **Un único punto
  de visibilidad**, `lead/visibility.ts`, por el que pasa todo controlador del responsable:
  las ADR 041, 046 y 047 ya pagaron tres fugas entre espacios por repetir un `WHERE`. Ningún
  endpoint de `lead/` escribe.
  **Hecho (2026-10-03).** Decisiones de detalle:
  - **Dos módulos:** `team-lead/` marca al responsable con el permiso de
    gestionar miembros (`member:update`), y `lead/` solo lee. Una prueba de
    arquitectura falla si `lead/` registra una ruta que escriba, escribe en
    la base o publica eventos.
  - **Una sola consulta de pares** (responsable, miembro) para los dos
    sentidos. Exige que el equipo sea de este espacio, que el responsable
    lleve la marca, que los dos sigan en el espacio y que no sean la misma
    persona.
  - **El interruptor va en el diálogo de miembros del equipo**, y quien no
    puede gestionarlo ve la etiqueta «Responsable».
  - **El aviso** «Tu responsable, X, ve tu plan y tus cierres, nunca tu
    valoración» sale en Hoy y en el Planificador, con
    `GET /lead/my-leads`.
  - **Better Auth no conoce la columna:** al añadir a alguien queda en
    `false`, y sacarle del equipo se la lleva.

  Verificación:
  - 3 pruebas de integración de la regla, el interruptor y el aviso. La
    primera versión no detectaba quitar el filtro de espacio del equipo,
    porque la persona del otro espacio no estaba en este; ahora lo está y
    lo detecta;
  - la prueba de arquitectura de solo lectura, comprobada con una escritura
    metida a propósito;
  - 1 de extremo a extremo con dos personas: la segunda entra por una
    invitación pendiente;
  - pasada visual del diálogo y del aviso.
- **5.3 «Mi equipo»** ✔ · M. Por persona: plan, capacidad con ausencias y festivos, carga, hechas,
  horas, el cierre **público** y el stand-up, todo en lote —unas ocho consultas para el equipo
  entero— y con sondeo de 60 s.
  **Hecho (2026-10-03).** Sin ADR propia: va en la
  [ADR 059](adr/059-responsable-de-departamento.md). Decisiones de detalle:
  - **`GET /lead/day` y `GET /lead/standup`** pasan por `visibility.ts` y
    cargan en lote: nueve consultas el día y siete el stand-up, sea cual sea
    el tamaño del equipo.
  - **Los bloques, las jornadas y los días no disponibles ganan versión de
    varias personas**, y la de una sola delega en ella: la regla sigue en
    un solo sitio.
  - **El stand-up del responsable es el mismo que la persona ve en Hoy.**
    Cada «ayer» sale de la jornada de cada uno, y una prueba compara los dos
    campo a campo.
  - **Ruta `team`, «Mi equipo»** en la navegación personal, solo para quien
    lleva a alguien. Tiene una tarjeta por persona y una pestaña de stand-up
    con «Copiar todo». Ningún botón sobre el plan ajeno.
  - **Se relee cada minuto**: el tiempo real queda aplazado a sabiendas.

  Verificación:
  - 3 pruebas de integración: el día sin nada privado ni de fuera del
    equipo, el stand-up idéntico al propio, y nada para quien no lleva a
    nadie;
  - **banco de 50.000 tareas con un equipo de 20 personas**: el día da p95
    de 34 ms con 200 tareas terminadas hoy, y el stand-up de 21 ms;
  - 1 prueba de extremo a extremo y la de la navegación;
  - pasada visual en escritorio y a 375 px.

  **Verificación del Bloque 5 completo (2026-10-03):**
  - integración 742 de 743, con 1 omitida. Falló la importación grande,
    intermitente desde el Bloque 0, que sola pasa 19 de 19;
  - de extremo a extremo 60 de 61. Falló «una ausencia deja hoy sin
    horas»: al quitar la ausencia, el `DELETE` salió del navegador y no tuvo
    respuesta. Pasó 4 de 5, 8 de 8 y 20 de 20 al repetirla. En las 20 se
    registraron en el servidor la llegada y el fin de cada `DELETE`, y todos
    tardaron de 5 a 38 ms. **Queda sin explicar**; se vigila;
  - unitarias 378 (web), 743 (API) y 33 (MCP);
  - typecheck de todos los paquetes, `biome ci` e i18n.

**Orden.** 0.1 → 0.2 → (0.3, 0.4, 0.5) · 1.1 → 1.2 · 0.3 → 1.3 → 2.1/2.2 · 1.4 → 2.3 ·
2.1 → 2.4 · 3.1 → 3.2/3.3 · 4.1 → 4.2 · 0.5 → 5.1 · 5.1 + 5.2 + 2.4 → 5.3. **Unas 18
semanas nominales, 4-5 meses reales.**

**Riesgos.** (1) El cambio de zona horaria sobre datos existentes, con la igualdad exacta de
`planned_date` y el cambio de hora del 25 de octubre. (2) La visibilidad del responsable:
privacidad y fugas entre espacios. (3) Que alguien espere privacidad de la Bandeja. (4) Que
alguien espere avisos sin tener la pestaña abierta. (5) La importación de iCal, aplazada:
SSRF, secretos, una licencia nueva y la variedad de feeds.

**Aplazado a sabiendas:** hábitos y contadores · push, PWA y service worker ·
autoplanificar · bandeja de notificaciones completa · mapa de calor · zona horaria por
persona · enviar el stand-up a Slack o Telegram (Fase 8) · matriz de Eisenhower · editar la
recurrencia desde la propia tarea · tiempo real en la vista del responsable · CalDAV y
sincronización bidireccional · avisos de los rituales (decidido: solo botón) · que el
responsable edite el plan ajeno (decidido: solo lectura) · saltarse las recurrentes en festivo ·
importar iCal (4.2, decidido al cerrar el 4.1).

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
pendiente, trabajas en foco con avisos del navegador, ves tu plan con hora en tu calendario, y
tu responsable ve tu plan y tu carga —con ausencias y festivos— pero no tu valoración. Ver tus
reuniones en el Cronograma se aplazó con el 4.2.

### Fase 8 — Automatizaciones, hoja de SERVITEC y stand-up a chat · **cerrada**

*Replanificada el 2026-10-05 al empezarla, preguntando antes de diseñar. El texto
original pedía el motor de automatizaciones e importadores de Trello, Jira, Asana y
Notion; le habían llegado además la hoja de SERVITEC (Fase 5) y enviar el stand-up a
Slack o Telegram (interludio, 2.4). Las decisiones del usuario son vinculantes para
toda la fase.*

**Decisiones del usuario:**

- **Importadores de Trello, Jira, Asana y Notion: solo documentados.** «Solo necesito
  Excel por ahora»: una ADR con la receta, sin código que nadie use todavía.
- **La hoja de SERVITEC, de ida y vuelta**: se migra el cuadro histórico que se llevaba
  a mano **y** se puede exportar, editar en Excel y volver a subir. Un PROYECTO que no
  existe se resuelve en el asistente: uno existente, crearlo o descartar sus filas.
- **Reglas de proyecto y de espacio.**
- **Entran:** disparadores por fecha; el stand-up a Slack o Telegram, que programa **un
  admin o el responsable** del departamento; la acción «mensaje a chat»; y recetas
  listas para usar.
- El permiso de las reglas no tenía preferencia: se aplica el de abajo.

**Ampliar `workflowRule`, no sustituirlo.** Sigue siendo el mapeo *(integración, evento)
→ columna* de GitHub y Gitea. Los movimientos que provoca publican `task.status_changed`
y el motor reacciona a ellos, así que «cuando GitHub la pase a En revisión, avisa a…»
funciona encadenando. Los dos se editan en la misma página.

**El motor**, en `apps/api/src/automation/`, es un suscriptor más del bus, como la
actividad o los avisos:

- **Modelo** (migración 0082, solo tablas nuevas): `automation` —`project_id` nulo para
  una regla de espacio, `team_id` para el stand-up, `trigger_type`, y en `jsonb` la
  configuración del disparador, las condiciones y las acciones— y `automation_run`, el
  historial de cada ejecución con el resultado de cada acción, purgado a los 30 días.
- **Disparadores**: tarea creada, cambia de columna, se asigna, cambia la prioridad,
  cambia un campo, comentario, etiqueta; vence en N días y vencida (planificador); y una
  hora fija de ciertos días, solo para el stand-up.
- **Condición**: las mismas condiciones editables que un widget, compiladas por el motor
  de filtros y evaluadas sobre la tarea por su id. La semántica es la de las vistas,
  campos personalizados incluidos.
- **Acciones**: mover de columna (solo en proyecto: las columnas son de cada uno),
  marcar hecha, prioridad, vencimiento relativo, campo, etiqueta, asignar a personas o
  equipo, crear tarea o subtarea, avisar, webhook, mensaje a chat (la integración del
  proyecto, o un destino propio cifrado en una regla de espacio) y enviar el stand-up.
- **Lo que no dispara**: lo importado (`origin: "import"`), lo que arrastra una cascada,
  los proyectos archivados y, en las reglas de espacio, los proyectos «Personal».
- **Bucles**: la cadena de reglas viaja en el contexto del bus (`eventContext`), y una
  regla que ya está en ella, o una cadena de tres, no corre y queda anotada.
- **Actor**: quien guardó la regla por última vez, como las recurrentes. Si pierde el
  permiso, la regla se pausa y lo dice. La actividad lo enseña como «Automatización
  ‹nombre›».
- **Permisos**: una regla de proyecto pide `project:update`; si saca datos fuera —webhook
  o chat—, también `workspace:manage_settings`, como las integraciones. Una de espacio,
  `workspace:manage_settings`. El stand-up, eso **o** ser responsable de ese equipo. Los
  secretos se guardan cifrados y no salen nunca de la API.

**Bloques.** Mismas tallas: **S** unos días · **M** ≈ 1 semana · **L** 2+ semanas. Las
ADR siguen en la 066 (la 058 sigue reservada).

**Bloque 0 — `workflowRule` a punto** · S
- **0.1** ✔ Índice único `(proyecto, integración, evento)` con limpieza previa de
  duplicados; `issue_reopened` en la web, que la API ya maneja; quitar una regla (el hook
  existía sin consumidor); y el editor respeta el permiso, como el de campos.
  **Hecho (2026-10-05).** Sin ADR: es un arreglo, no una decisión.
  - **Migración 0081**: borra los duplicados conservando la regla guardada la última y
    crea el índice. El guardado pasa a ser un solo `INSERT … ON CONFLICT DO UPDATE`, y la
    siembra heredada de las integraciones, `ON CONFLICT DO NOTHING`.
  - **En la web**: «Por defecto» encabeza cada desplegable y, elegido, quita la regla; un
    texto explica que entonces decide la integración. Sale «Issue reabierto». Sin
    `project:update` los desplegables se ven pero no se tocan.
  - **Pruebas**: seis de integración (`workflow-rule.test.ts`), entre ellas la migración
    sobre duplicados reales y veinte guardados simultáneos del mismo evento, que con el
    guardado antiguo dan un 500 (comprobado dos de dos), y un e2e
    (`workflow-rules.spec.ts`) que falla sin el cambio.
  - **De paso**: `hardcoded-copy.test.ts` caducaba a los 5 s con la máquina cargada
    —analiza todos los `.tsx`; a solas tarda ~2 s—. Lleva ahora su propio plazo de 30 s.

**Bloque 1 — Motor** · L
- **1.1 Modelo y API** ✔ · M · [ADR 066](adr/066-automatizaciones-modelo-y-alcance.md).
  **Hecho (2026-10-05).**
  - **Migración 0082**, solo tablas nuevas: `automation` y `automation_run`.
  - **Router `/automation`**: listar, crear, editar, activar, archivar e historial
    paginado por cursor, con Valibot y OpenAPI.
  - **Permisos según la regla** (`automation/permissions.ts`). De ahí sale
    `roleHasWorkspacePermission`, que el motor necesita sin petición de por medio.
  - **Secretos** cifrados y de solo escritura (`automation/secrets.ts`).
  - **Al guardar se valida** todo lo que la regla nombra.
  - Ocho pruebas de integración y siete unitarias.
- **1.2 Ejecución** ✔ · M · [ADR 067](adr/067-como-corre-una-automatizacion.md). **Hecho
  (2026-10-05).**
  - `automation/engine.ts` se suscribe a nueve eventos y busca las reglas en una
    consulta.
  - El disparador se empareja en `triggers.ts`, que es puro.
  - La condición se evalúa con el motor de filtros, por la clave primaria de la tarea.
  - **Bus**: la cadena de reglas viaja en `eventContext` y `publishEvent` la copia en cada
    evento. Las importaciones marcan `origin: "import"`.
  - **Actividad y avisos**: la actividad lleva la marca de la regla y la web la pinta como
    «Automatización ‹nombre›». Los avisos no se saltan a quien guardó la regla.
- **1.3 Acciones internas** ✔ · M. **Hecho (2026-10-05).**
  - Mover, marcar hecha, prioridad, vencimiento relativo, campo, etiqueta, asignar
    personas o equipo, y crear tarea o subtarea.
  - Cada una llama al controlador que ya usa la interfaz.
  - Si la tarea ya está como la acción quiere, no la toca: un evento de más sería un
    disparo de más.
- **1.4 Acciones de salida** ✔ · M. **Hecho (2026-10-05).**
  - **Aviso**: tipo `automation`, con el nombre de la regla y su texto ya rellenado. La
    campana y los canales de cada persona pintan título y texto tal cual, así que no hizo
    falta clave i18n.
  - **Webhook**: firmado y con la guarda anti-SSRF del cliente del webhook genérico.
  - **Chat**: Slack, Discord o Telegram. Una regla de proyecto usa la integración del
    proyecto; una de espacio, un destino cifrado.
  - **Pruebas del motor**: ocho de integración.
    - Cubren el criterio de aceptación: mueve, avisa y dispara un webhook firmado a un
      receptor real.
    - También la condición por campo, la regla de espacio sin «Personal», el bucle
      cortado, la importación, la cascada, la pausa por permiso perdido y el destino
      privado.
    - Las guardas de importación y cascada, de «Personal» y de bucle se comprobaron
      quitándolas: cada una tumba su prueba.
  - Doce unitarias, y un e2e (`automation-activity.spec.ts`) que falla sin el cambio de la
    actividad.

**Bloque 2 — Por fecha y programadas** · M · [ADR 068](adr/068-el-stand-up-sale-de-riuna.md)
- **2.1 Disparadores por fecha** ✔ · S. **Hecho (2026-10-05).**
  - Disparadores `task.due_in` (vence en N días o menos) y `task.overdue`, con las fronteras
    de día de `utils/due-window.ts`. «Vencida» no avisa de lo que llevaba más de una semana
    vencido.
  - Un trabajo cada cinco minutos (`automations`, `automation/scheduled.ts`) con
    arrendamiento. El «ya disparado» va en `task_reminder_sent`, que el disparador de la
    0069 rearma al cambiar el vencimiento.
  - El mismo trabajo purga el historial de más de 30 días.
  - **Medido en el banco de 50.000 tareas**, las dos por `task_dueDate_idx`: 1,3 ms y
    0,9 ms; 10 ms con 20.000 marcas «ya disparado». La consulta de reglas por evento del
    Bloque 1 tarda 0,14 ms.
- **2.2 Stand-up a chat** ✔ · M. **Hecho (2026-10-05).**
  - Disparador `schedule` (días y hora de Madrid) y acción `standup`. Una regla de espacio
    con `team_id`, que solo envía stand-ups.
  - La gestionan un admin o el responsable de ese departamento (`isLeadOfTeam` en
    `lead/visibility.ts`), y este solo desde su sesión. Ruta propia para que liste los envíos
    de su equipo.
  - Sale una vez al día. En festivo no sale, quien está ausente no aparece y nunca lleva la
    valoración.
  - **`standupMarkdown` no pasó a `packages/libs`**, como decía este plan: ese paquete
    depende de la API para los tipos del cliente. Hay una segunda copia en la API con prueba
    de paridad, como `buildFilter`.
  - La negrita se adapta a cada canal.
  - **La ADR deja escrito que enviarlo amplía, a propósito, quién lo lee**: el interludio
    decidió «solo la persona y su responsable», y aquí lo decide quien lo programa.
  - **Pruebas**: seis de integración —por fecha: una vez y rearme al mover la fecha,
    vencidas sin las antiguas; stand-up: permisos del responsable, una vez al día sin el
    ausente, festivo y día no programado, forma de la regla— y cuatro unitarias (paridad
    del texto y negrita por canal).

**Bloque 3 — Interfaz** · M–L · **Hecho (2026-10-07)**
- **3.1** ✔ *Ajustes del proyecto › Automatizaciones* (con «Desde GitHub y Gitea», que sale
  de «Flujo de trabajo») y *Administración del espacio › Automatizaciones*.
  - Editor «Cuando · Si · Entonces» (`components/automation/`). La condición es la barra de
    filtros de las vistas, y los campos filtrables los da `useWidgetFields`.
  - Las acciones se ordenan con flechas.
  - Los secretos son de solo escritura: un campo secreto vacío conserva el guardado
    (`toInput`).
  - Fetchers y hooks siguen el patrón de las recurrentes. Sin WebSocket: la pantalla relee
    al montar.
  - **De la pasada por el navegador**: las etiquetas de los campos no estaban asociadas a
    su control (lo cazó el e2e, que buscaba «URL del webhook» por su etiqueta). Ahora lo
    están, con `TextField`. Además el cuerpo de los diálogos va en `DialogPanel` (iba
    pegado al borde), y la fila de una regla deja bajar sus botones en móvil (el nombre se
    partía letra a letra).
- **3.2** ✔ Historial de cada regla: estado, tarea, acción que falló, error y motivo de
  salto, paginado.
- **3.3** ✔ Cinco recetas que solo rellenan el editor.
- **3.4** ✔ En «Mi equipo», pestaña Stand-up, el responsable programa el envío de cada
  departamento que lleva, con el aviso de que todo el chat lo leerá. Desde la lista del
  espacio, una regla programada abre ese mismo editor.
- **Pruebas**:
  - siete unitarias del modelo del editor;
  - tres e2e (`automations.spec.ts`): una receta que avisa al cerrar la tarea y deja
    historial; el responsable que programa el stand-up; una regla pausada que lo dice;
  - pasada visual a 1440 y 390 px en los dos temas.
  - `playwright.config.ts` da a la API del humo una clave de cifrado: en CI no hay `.env`.

**Bloque 4 — La hoja de SERVITEC vuelve** · M · ADR 069
- **Adelantado (2026-10-05), a petición del usuario:** en la celda «Comentario» los
  comentarios van **seguidos**, uno por línea, sin líneas en blanco ni entre ellos ni
  dentro de uno —un párrafo vacío del editor dejaba una—, y **la fecha va en negrita**.
  La celda pasa a ser texto enriquecido de Excel, así que el libro recibe los comentarios
  como lista (fecha y texto) y no como una cadena ya montada. Pruebas:
  `servitec-workbook.test.ts` y `task-export-xlsx.test.ts`, que miran el texto y qué
  trozos van en negrita después de releer el fichero.
- **4.1** ✔ La exportación lleva el id de cada tarea en la columna J, oculta; la captura
  diaria no cambia.
- **4.2** ✔ Lector puro (`servitec-parse.ts`):
  - busca la fila de cabeceras por nombre, porque el cuadro histórico se hizo a mano;
  - salta la leyenda y los relevos;
  - una línea que empieza por fecha abre un comentario, y las demás siguen al de arriba.
- **4.3** ✔ Importar (`import-servitec.ts` y `servitec-{plan,write,finish,comments}.ts`):
  - el núcleo del importador de Excel sale a `importTasksInTransaction`, y sus eventos a
    `publishImportEvents`: SERVITEC es el segundo consumidor;
  - una transacción para el libro, con los cerrojos en orden de id;
  - identidad por id o por huella en `external_ref`;
  - estado a columna sin mover lo que ya cuadra;
  - fecha de alta de la hoja en las altas;
  - comentarios con su día, sin avisos y sin repetir;
  - un proyecto nuevo se crea antes y se borra si falla.
- **4.4** ✔ Asistente en *Administración del espacio › General*, junto a la exportación:
  subir, ver qué trae, decidir cada proyecto que no existe, «Comprobar» e importar.
- **Hecho (2026-10-07)**, [ADR 069](adr/069-la-hoja-de-servitec-vuelve.md). Pruebas:
  - ocho unitarias del lector y del paso de estado a columna;
  - seis de integración: migrar el cuadro creando un proyecto, subirlo dos veces sin
    duplicar, ida y vuelta por el ID oculto que cambia concepto y estado y añade solo el
    comentario nuevo, proyectos desconocidos (preguntar, descartar, llevar a otro),
    ensayo sin escribir, y permisos;
  - un e2e del asistente.
  - Las 19 del importador de Excel siguen en verde tras separar su núcleo.

**Bloque 5 — Importadores documentados y cierre** · S
- **5.1** ✔ [ADR 070](adr/070-como-se-anade-un-importador-externo.md), «Cómo se añade un
  importador externo»: un adaptador del lado del servidor sobre
  `importTasksInTransaction`, `external_ref`, los comentarios fechados sin avisos y
  `origin: "import"`; lo que falta (guardar ficheros sin S3, ampliar la `CHECK` de
  `external_ref`) y notas de Trello, Jira, Asana y Notion. Sin código.
- **5.2** ✔ `funcionalidades.md` (automatizaciones, la hoja de vuelta, seis trabajos
  programados y «Lo que no está»), este documento y `AGENTS.md`, que aún decía que
  `import-tasks` no era idempotente.
- **5.3** ✔ **Verificación de la fase (2026-10-07)**, sobre el estado final de los cinco
  bloques:
  - integración: 823 bien y 1 omitida, ninguna fallada;
  - humo: 92 bien, 1 omitida (avisos de ritmo, que se salta sola de noche) y 2 falladas,
    ya corregidas y repetidas 3 veces cada una:
    - el e2e de las reglas de GitHub seguía abriendo «Flujo de trabajo», de donde el
      Bloque 3 movió su editor;
    - `task-time` consultaba la API antes de que el servidor confirmara el alta del
      cronómetro. Ahora espera la respuesta;
  - unitarias: API 789, web 430, MCP 34, permisos 10, libs 6, PLANKA 54 y email 11;
  - typecheck, `biome ci`, i18n y `openapi.json` al día.
  - De paso: `leader-lock.test.ts` caía por carga (esperaba un segundo a que el
    arrendamiento se tomase); ahora espera hasta diez.

**Hecho cuando:** importas el cuadro de SERVITEC que se llevaba a mano y lo vuelves a
subir sin duplicar nada; exportas, cambias un estado en Excel y al subirlo cambia en
Riuna; una regla de proyecto mueve una tarea, avisa y dispara un webhook sin
intervención; una regla de espacio sube la prioridad de lo que vence mañana en cualquier
proyecto; y el stand-up de un departamento llega a Telegram a su hora, y en festivo no
sale.

**Fuera de alcance, declarado:** los cuatro importadores externos (solo la ADR 070),
herramientas MCP de automatizaciones, WebSocket para la lista de reglas, reintentos de
webhook, tope de ejecuciones por minuto, disparadores directos de eventos de GitHub o
Gitea (se encadenan a través de `workflowRule`) y enviar la hoja de SERVITEC programada.

### Fase 9 — Operación

*Planificada el 2026-10-10 preguntando antes de diseñar, como la 8. El texto original
pedía logs estructurados, métricas, límites de tasa, repaso de índices con datos reales,
las pantallas de consulta móvil, humo, copias fuera de la máquina y una guía de
actualización propia, en ≈2 semanas. Con lo que el usuario eligió pasa a **≈6 semanas
nominales**. Es la última fase del Bloque A.*

**Hecho cuando:** restauras una copia en limpio y la suite de humo pasa contra esa
instancia.

**Decisiones del usuario:**

- **Oracle se pospone.** La instancia sigue en el PC (Docker Desktop y
  `compose.local.yml`) y se entra por Tailscale. Del [plan de despliegue](plan-despliegue.md)
  se aprovecha lo que sirve en el PC, y el resto queda para cuando haya VM.
- **Tailscale con `tailscale serve`.** Hoy se entra por la IP de Tailscale y los puertos.
  Se pasa a HTTPS con una sola URL, y los puertos dejan de escuchar en la red local.
- **Observabilidad:**
  - logs estructurados;
  - una página «Estado de la instancia» para el admin de instancia;
  - alertas por los canales que ya existen (ntfy, Gotify, correo, webhook).
  - **Sentry, pospuesto**, y sin endpoint `/metrics`.
- **Restauración, por partida doble:**
  - un simulacro sintético cada noche en CI;
  - y el simulacro con la copia real, en el PC, en un proyecto Compose aislado. La copia real
    nunca baja a desarrollo.
- **Copia externa a Google Drive**, cifrada con un remoto `crypt` de rclone, desde un
  contenedor más de `compose.local.yml`.
- **Móvil a 390 px**:
  - se rehacen Hoy y Mi trabajo (Hoy, Mis tareas, Planificador y Mi panel), el detalle de
    tarea, el Tablero y la Lista;
  - el resto solo se revisa para que no se desborde.

**Lo que había al empezar**, comprobado en el código:

- **Un 500 no dejaba rastro.** `app.onError` solo llamaba a `Sentry.captureException`, y
  Sentry está inactivo.
- No había logs de petición, sino unas 300 llamadas `console.*`.
- Better Auth solo limitaba la tasa en modo cloud: en autoalojado nada frenaba los intentos de
  contraseña.
- `compose.local.yml` publicaba Postgres en todas las interfaces.
- Las copias vivían en el mismo disco que la base.

**Bloques.** Mismas tallas. ADR desde la 071 (la 058 sigue reservada); migraciones desde la
0083.

**Bloque 0 — El PC, solo por Tailscale, y actualizar con red** · S ·
[ADR 071](adr/071-la-instancia-del-pc-por-tailscale.md) · **Hecho (2026-10-11)**
- **0.0** ✔ Este plan.
- **0.1** ✔ Puertos y `tailscale serve`.
  - Los puertos de `compose.local.yml` escuchan en `127.0.0.1` (`RIUNA_BIND_ADDRESS`).
  - Se publica con `tailscale serve`: `/` va a la web y `/api` a `http://127.0.0.1:1337/api`.
    `serve` quita el prefijo del montaje y le añade la ruta del destino, así que hay que
    repetirlo en ella.
  - El paso único de la IP y los puertos a `serve` está en [actualizar](actualizar.md), y el
    orden importa: cerrar los puertos antes de montar `serve` deja fuera a quien entraba por la
    IP.
- **0.2** ✔ Orden `migrate`.
  - `node dist/migrate.js` migra y sale, con 0 o con 1.
  - Lo común sale a `database/run-migrations.ts`, y el arranque normal sigue migrando.
  - Tres pruebas de integración en un proceso aparte: base vacía, base ya migrada y una
    migración que falla.
- **0.3** ✔ `deploy/actualizar.sh`, en el orden de arriba.
  - La versión que sirve se lee de la etiqueta `org.opencontainers.image.revision`, que
    `compose.local.yml` sella al construir, y no de git.
  - Fija `MSYS_NO_PATHCONV=1`: sin eso, Git Bash convierte `/scripts/backup.sh` en una ruta de
    Windows.
  - **Probado** con `shellcheck` y con un `docker` simulado en un clon desechable: worktree
    sucio, al día, fallo al construir, al copiar, al migrar y al arrancar (con y sin migraciones
    aplicadas) y primera vez sin etiqueta.
  - **Sin probar aquí**: este devcontainer no tiene Docker. La primera ejecución real es en el
    PC.
- **0.4** ✔ `pg_stat_statements` se carga en el Postgres del PC. La extensión se creará en la
  base `postgres`, así que no viaja en las copias.

**Bloque 1 — Copias fuera de la máquina y simulacro en CI** · M ·
[ADR 072](adr/072-copias-fuera-de-la-maquina-y-simulacro.md) · **Hecho (2026-10-11)**
- **1.1** ✔ Servicio `offsite` (rclone 1.68) y `scripts/backup/offsite.sh`.
  - `copy` y nunca `sync`, y solo copias terminadas.
  - No purga si la última copia local tiene más de 48 h o está dañada.
  - Retención de 90 días, conservando siempre las 5 más recientes.
  - Deja `backups/.offsite-status.json`.
  - Va en el perfil `offsite` (`COMPOSE_PROFILES`) y no lee el `.env` entero.
  - **Probado** con el busybox y el rclone de la imagen contra un remoto local cifrado: sano
    (sube cifrado, deja fuera el `.partial` y purga hasta dejar 5), copia vieja, copia dañada,
    remoto inexistente y sin copias. Los cuatro fallos salen con 1 y no purgan.
- **1.2** ✔ [Copias de seguridad](copias-de-seguridad.md) explica:
  - cómo montar Drive cifrado (la autorización se hace con `rclone.exe` en Windows);
  - que **las dos contraseñas del `crypt` se guardan fuera del PC**;
  - cómo recuperar desde Drive en una máquina nueva.
- **1.3** ✔ El humo puede correr contra una instancia en marcha (`E2E_BASE_URL` y `E2E_API_URL`).
  - El único origen escrito a mano (`home.spec.ts`) pasa a leer `baseURL`.
  - `RIUNA_DISABLE_SCHEDULER=true` no arranca ningún trabajo. Lo vigila una unitaria, que falla
    quitando la guarda.
- **1.4** ✔ `restore-drill.yml`, cada noche y en las PR que tocan copias, imágenes o
  migraciones:
  1. construye las imágenes de `compose.local.yml`, siembra y copia;
  2. tira la instancia y levanta un Postgres vacío;
  3. rechaza un volcado truncado sin crear nada;
  4. restaura y compara los recuentos (`scripts/backup/counts.sh`);
  5. pasa el humo entero contra lo restaurado.
  - **Ensayado aquí sin Docker**: los mismos `backup.sh`, `restore.sh` y `counts.sh` contra el
    Postgres local, y la API y la web sobre la base restaurada, con datos previos y sin
    planificador. Recuentos iguales, el truncado rechazado y el humo **94 de 95**. Falló el
    arrastre para redimensionar del Cronograma, que pasó 2 de 2 al repetirlo: es un gesto
    sensible a los tiempos tras diez minutos de carga, y en CI las pruebas ya tienen un
    reintento.
  - El job de verdad corre por primera vez en la PR de este bloque.

**Bloque 2 — Logs estructurados** · M · [ADR 073](adr/073-logs-estructurados.md) ·
**Hecho (2026-10-11)**
- **2.1** ✔ `utils/log.ts`, sin dependencia.
  - JSON por línea en producción y legible en desarrollo (`LOG_FORMAT`), con `LOG_LEVEL`.
  - Firma de `console`: texto, campos, `Error` con su pila y su causa.
  - Tapa los secretos a cualquier profundidad.
  - Doce unitarias. Una cazó que un campo llamado `level` o `msg` pisaba la cabecera.
- **2.2** ✔ Una línea por petición (`utils/request-log.ts`):
  - `requestId` (respeta uno entrante razonable y lo devuelve en `X-Request-Id`), método,
    patrón de ruta, estado, duración y usuario;
  - todo lo registrado durante la petición lleva su `requestId`, por `AsyncLocalStorage`;
  - el patrón es el de la ruta que respondió, o el de la ruta pedida si cortó un middleware: un
    401 sale como `/api/task/:id` y no como `/api/*`;
  - **nunca la ruta cruda**: el token del `.ics` no aparece, y una prueba lo vigila;
  - `/api/health` no se registra.
- **2.3** ✔ Todo 500 deja su pila con la ruta y el `requestId` (**antes no dejaba nada**). Los
  trabajos programados registran cómo acabaron (`debug`, `warn` o `error`), y Better Auth
  escribe por el mismo registro.
- **2.4** ✔ Los ~300 `console.*` de 87 ficheros pasan a `log.*`, con un cambio mecánico que la
  firma permite. `tests/api/no-console.test.ts` impide que vuelvan, y salta con uno de prueba.
  Las cinco pruebas que espiaban `console` espían ahora `log`.
- **De paso**: `compose.local.yml` rota los logs de cada contenedor (5 × 10 MB). Docker Desktop no
  los rota, y con una línea por petición crecerían sin límite.
- **Visto en vivo**: la API empaquetada con `NODE_ENV=production` escribe JSON por línea, el `.ics`
  sale como `/api/calendar/:file{.+\.ics}` y el token no aparece en el log.
- **Pruebas**: 12 unitarias del logger, la guarda y 5 de integración del middleware (patrón sin
  token, `/health` callado, `X-Request-Id` de ida y vuelta, id entrante descartado y la pila de un
  500). Unitarias de la API: 804 de 804.

**Bloque 3 — Límites de tasa** · S · [ADR 074](adr/074-limites-de-tasa.md) ·
**Hecho (2026-10-11)**
- **3.1** ✔ **La IP sale de un solo sitio** (`utils/client-ip.ts`).
  - `X-Forwarded-For` solo cuenta si la conexión viene de un proxy de confianza
    (`TRUSTED_PROXIES`, por defecto localhost y las redes privadas, con `net.BlockList`).
  - Better Auth la recibe resuelta en una cabecera propia que se borra a la entrada.
  - **Hallazgo heredado**: Better Auth leía `cf-connecting-ip` y `X-Forwarded-For` sin mirar de
    dónde venía la conexión. Con los límites encendidos, inventarse la cabecera habría dado un cupo
    nuevo en cada intento.
  - En el PC no hay que configurar nada: la pasarela de Docker es una red privada.
- **3.2** ✔ **Better Auth limita siempre**, no solo en cloud. Entrar: 10 por minuto. Enlace
  mágico: 5. Registrarse: 3. Invitar: 5. *Device flow*: 10.
- **3.3** ✔ **El resto de la API** (`utils/rate-limit.ts`, en memoria y con ventana fija):
  - 600 por minuto por persona o clave (`RATE_LIMIT_USER_PER_MINUTE`);
  - por IP, lo público: el `.ics`, el proyecto público, la invitación pública, el estado de la
    instancia y los webhooks de GitHub y Gitea;
  - 429 con `Retry-After`, que CORS expone igual que `X-Request-Id`;
  - `/health`, los avatares y los adjuntos, sin límite.
- **3.4** ✔ **En la web**, un 429 no se reintenta (ya no se reintentaba ningún 4xx).
  - El cliente compartido avisa (`onRateLimited`), y la web enseña un aviso traducido por tanda.
  - Los formularios de acceso explican en español el 429 de Better Auth, que llega en inglés.
- `RATE_LIMIT_ENABLED=false` lo apaga: lo usan la integración, el humo y los simulacros.
- **Pruebas**:
  - cuatro de integración: el cupo por persona con `Retry-After` sin tocar a otra, lo público por
    IP, `/health` libre y **once intentos de contraseña con una IP inventada en las tres
    cabeceras: el undécimo es un 429**;
  - comprobado quitando cada guarda: sin el límite por persona, y con la lectura antigua de la IP,
    cae su prueba;
  - ocho unitarias de la IP y del contador, y dos del aviso en `libs`;
  - `session-client-ip.test.ts`, heredada, mandaba `X-Forwarded-For` sin socket y daba por
    buena la cabecera. Ahora simula de dónde viene la conexión, y tiene un caso nuevo: si no viene
    de un proxy de confianza, se ignora;
  - con la API empaquetada en producción, diez 401 y el undécimo intento es un 429.

**Bloque 4 — Estado de la instancia y alertas** · M–L ·
[ADR 075](adr/075-estado-de-la-instancia-y-alertas.md) · **Hecho (2026-10-11)**
- **4.1** ✔ Migración 0083, solo tablas nuevas:
  - `job_status`: una fila por trabajo con la última vuelta, el estado, la duración, el último
    éxito, los fallos seguidos y el último error, sin la consulta de las URL;
  - `instance_alert`: con un índice único mientras está abierta.
  - La escribe `withCheckIn`, así que vale para los siete trabajos sin tocarlos.
  - Los tiempos por ruta (p50 y p95 de las últimas 200 peticiones) van en memoria y no cuentan
    los preflight de CORS.
- **4.2** ✔ `GET /api/instance/report`, solo para el admin de instancia y solo con sesión.
  - Enseña:
    - versión, commit (`RIUNA_REVISION`, que ahora se sella en la imagen) y tiempo en marcha;
    - la base y sus migraciones;
    - los trabajos;
    - las copias, desde `BACKUP_DIR`, que `compose.local.yml` monta de solo lectura;
    - Redis y WebSocket;
    - rutas lentas, problemas y alertas;
    - **la IP con la que la API ve a quien pregunta**.
  - Con Valibot y OpenAPI.
- **4.3** ✔ «Estado de la instancia» en el menú del avatar, solo para el admin de instancia.
  Se refresca cada minuto.
  - **Pasada visual** a 1440 y 390 px, en los dos temas: sin desbordamiento.
  - De ella salieron el margen que faltaba, los preflight que llenaban la tabla de rutas y dos
    plurales mal hechos.
- **4.4** ✔ El trabajo `instance-health`, cada 15 minutos y con arrendamiento.
  - Abre una alerta cuando la copia local se retrasa, la copia externa deja de subir o un
    trabajo falla tres veces seguidas.
  - Avisa al admin de instancia por sus canales una vez, y otra al resolverse.
  - Sin `BACKUP_DIR` no alerta de copias.
- **Pruebas**:
  - 8 unitarias de las condiciones y 4 de los tiempos por ruta;
  - 6 de integración: 403 a quien no es admin y a una clave de API, el informe completo (sin el
    token del error), los fallos seguidos que se reinician y la alerta que se abre, no se
    repite, no llega a quien no es admin y se cierra;
  - un e2e que promueve al usuario por la base y abre la página desde el avatar; contra el
    simulacro se salta;
  - la entrada del menú, en la unitaria del hook.

**Bloque 5 — Índices con datos reales y presupuesto** · S–M
- **5.1** ✔ `scripts/ops/informe-bd.sh`, que corre en el PC y saca **solo estadísticas, ni una
  fila**: tamaño y volumen, el recuento de los cinco proyectos más grandes, índices sin uso,
  tablas con más barridos secuenciales, y las sentencias más caras de `pg_stat_statements`,
  normalizadas.
  - `compose.local.yml` deja de registrar las órdenes de utilidad: no se normalizan, y una que
    llevara una contraseña la guardaría tal cual.
  - Probado contra una base de pruebas, salvo crear la extensión: aquí no hay superusuario, y en
    el contenedor del PC sí.
- **5.2** ⏳ **Pendiente del informe real.** Se lanza en el PC tras actualizar
  (`sh scripts/ops/informe-bd.sh > informe-bd.txt`), cuando `pg_stat_statements` lleve unos días
  recogiendo. Cada candidato se mide en el banco con `EXPLAIN`, antes y después.
- **5.3** ✔ **Presupuesto de las pantallas posteriores a la Fase 4.5**, medido con
  `apps/api/scripts/bench-views.ts`:
  - en el mismo proceso, con la app entera (middleware y autenticación incluidos);
  - sobre el banco de 50.000 tareas;
  - con la persona con más tareas asignadas, hecha responsable de un departamento;
  - 30 vueltas tras 3 de calentamiento.

  | Pantalla | p50 | p95 |
  |---|---|---|
  | Hoy | 74 ms | 83 ms |
  | Planificador (7 días) | 114 ms | 146 ms |
  | Cronograma (7 días) | 7 ms | 11 ms |
  | Mis tareas: contadores | 41 ms | 73 ms |
  | Mis tareas: asignadas | 36 ms | 49 ms |
  | Mis tareas: del departamento | 11 ms | 16 ms |
  | Mis tareas: esperando | 10 ms | 14 ms |
  | Mi equipo: el día | 9 ms | 11 ms |
  | Mi equipo: stand-up | 8 ms | 10 ms |
  | Búsqueda | 129 ms | 138 ms |
  | Mi panel (todos los widgets) | 79 ms | 104 ms |

  **Todas por debajo de 300 ms p95**, y la más cara, la búsqueda, con más del doble de margen.
  - El plan personal no se siembra: tiene decenas de entradas, no miles. Así que Hoy, el
    Planificador y el Cronograma miden lo que sí crece con el volumen, lo vencido y lo sin
    planificar.
  - Las automatizaciones no están: su coste es el número de reglas, medido en la ADR 068.

**Bloque 6 — Móvil a 390 px** · M · **Hecho (2026-10-11)**
- **6.1** ✔ Proyecto `mobile` en Playwright (Chromium a 390×844, táctil) y
  `tests/e2e/mobile/`.
  - **`overflow.spec.ts`** recorre 26 rutas y falla si algo visible asoma por la derecha fuera
    de un contenedor que se desplace en horizontal. También falla si el marco de la página se
    desliza de lado: `SidebarInset` es `overflow-auto`, así que lo que lo desbordaba arrastraba la
    página entera. La primera versión de la guarda lo daba por bueno; ahora salta con la
    cabecera de antes, comprobado.
  - **`screens.spec.ts`**: un gesto por pantalla elegida, y que el título se lea entero.
- **6.2** ✔ Lo que se arregló:
  - **La cabecera de las páginas** (`WorkspaceLayout`).
    - En Mi panel y en Mis tareas, las acciones desbordaban y **la página entera se
      deslizaba 450 px de lado**.
    - Ahora crece en dos líneas: arriba el título, la tarea nueva y la campana; debajo, las
      acciones, que se desplazan.
    - El nombre del espacio sale desde `sm`.
  - **Hoy y Mis tareas**: el título se quedaba en una o dos letras. Ahora va arriba, con hasta
    dos líneas, y la etiqueta de vencimiento y la acción debajo. En escritorio, igual que antes.
  - **El detalle de tarea**: el título era un `input` de una línea. Ahora es un `textarea` que
    crece (ajustado en JS, porque Safari de iOS no tiene `field-sizing`). Intro guarda, y un
    salto de línea pegado pasa a espacio.
  - **Tablero y Planificador**: columnas al 85 % del ancho con `scroll-snap`. Se mueve de columna
    manteniendo pulsada la tarjeta (menú «Estado»).
  - **La Lista**: la clave se oculta por debajo de `sm`, y el título tiene dos líneas.
- **6.3** ✔ Pasada visual a 390 px en los dos temas, y a 1440 para comprobar que el escritorio
  no cambió.
- **De paso, un fallo real del modo foco**, destapado por el simulacro de restauración con el
  build de producción.
  - Una parada del cronómetro desde otro dispositivo en los primeros 15 s de un bloque no se
    notaba nunca: el modo foco seguía «Trabajando».
  - Ahora se vuelve a mirar al acabar el margen.
  - `focus.spec.ts` avanza el reloj de 2 en 2 s y cae con el código de antes.

**Bloque 7 — Simulacro real y cierre** · S
- **7.1** ✔ `deploy/simulacro.sh`.
  - **Proyecto Compose aparte** (`riuna-simulacro`):
    - un `.env` generado, sin SMTP y con claves nuevas;
    - su directorio de copias y sus puertos (web 5183 y API 1347, solo en `127.0.0.1`);
    - planificador apagado, sin salida a la red (`RIUNA_DISABLE_OUTBOUND`) y sin límites de
      tasa.
  - **Lo que hace:**
    - restaura la copia;
    - compara los recuentos con la instancia de verdad;
    - arranca sobre las imágenes que ya sirven;
    - con `--humo`, pasa el humo entero desde un contenedor de Playwright dentro de su red, así
      que no hace falta Node en el PC;
    - `--down` lo tira todo.
  - `compose.local.yml` admite `RIUNA_ENV_FILE`, `RIUNA_BACKUP_DIR` y `RIUNA_*_PORT`, que por
    defecto valen lo de siempre, y fija los nombres de imagen (`riuna-api`, `riuna-web`).
  - **El simulacro nocturno de CI usa este mismo guion**, así que lo que se lanza en el PC se
    prueba entero cada noche con Docker de verdad.
  - **Primera vuelta real (2026-10-11):** restauró, los recuentos coincidieron y el humo pasó
    contra la copia, **100 bien** (1 omitida, la que necesita la base, y 1 frágil que pasó al
    reintentar y quedó reforzada), en 15 minutos.
  - Antes falló entera: con los nombres de servicio (`web`, `api`), la web y la API eran dos
    sitios para el navegador y la cookie de sesión no viajaba. El humo entra ahora por
    `localhost`, como en el PC (`deploy/simulacro-proxy.mjs`).
  - Probado aquí con `shellcheck` y un `docker` simulado: mirar, `--humo` bien y mal, sin
    imágenes, sin copias, opción desconocida y `--down`.
  - Una prueba vigila que la imagen de Playwright sea la de la versión instalada.
- **7.2** ⏳ **Pendiente del PC: el criterio de la fase con la copia real.**
  - `sh deploy/simulacro.sh --humo` tras actualizar.
  - La fecha y los recuentos van a [copias de seguridad](copias-de-seguridad.md).
- **7.3** ✔ Documentación:
  - [actualizar](actualizar.md), como guía propia: Tailscale, `actualizar.sh`, `migrate`, logs,
    el informe de la base y volver atrás;
  - [copias de seguridad](copias-de-seguridad.md): la copia externa, recuperar desde Drive y el
    simulacro;
  - funcionalidades, las ADR 071 a 075, `AGENTS.md` y `.env.sample`;
  - [plan de despliegue](plan-despliegue.md), pospuesto.
- **7.4** Verificación final: integración, humo (escritorio y móvil), unitarias de todos los
  paquetes, typecheck, `biome ci`, `i18n:check`, `check:env` y `openapi.json`.

**Fuera de alcance, declarado:**
- Oracle;
- Sentry y `/metrics`;
- avisar si la API entera cae, que necesita un vigilante externo;
- paginar las vistas, cerrado por decisión;
- la facturación heredada, abierta por decisión;
- la zona horaria por persona.

**Revisión de código de la Fase 9 (2026-10-12):** `/code-review extra-high` sobre los ocho
bloques (PR #51 a #58) devolvió 15 hallazgos, comprobados uno a uno contra el código. Están
corregidos en la PR #59, un commit por hallazgo, y cada arreglo con una prueba que fallaba antes
(salvo el de la caché de Docker, que se revisó a mano):
1. **las alertas de la instancia no salían de la campana**: sin recurso ni regla de espacio, la
   entrega se las saltaba. Ahora van por los canales de las preferencias generales;
2. **con dos réplicas, «falla seguido» no saltaba nunca**: la vuelta que se salta porque otra
   instancia tiene el arrendamiento se apuntaba como buena;
3. **el simulacro podía mandar mensajes reales**: las integraciones de proyecto (el token de
   Gitea y los webhooks de Discord, Slack y Telegram) se restauran en claro y los plugins seguían
   escuchando. `RIUNA_DISABLE_OUTBOUND=true` deja a la API sin red, salvo `localhost`;
4. el último error de un trabajo podía llevar un token en la ruta de una URL, o los datos tras
   `params:` de un error de Drizzle;
5. un `TRUSTED_PROXIES` con un prefijo fuera de rango hacía fallar cada petición; ahora se valida
   y la lista se construye una vez por valor;
6. un directorio de copias ilegible contaba como «no configurado» y cerraba las alertas abiertas.
   Ahora es su propio problema, `backup.unreadable`;
7. Turnstile recibía la IP de `cf-connecting-ip`, que escribe quien llama;
8. los cupos por IP contaban cada dirección IPv6 aparte: ahora, por su /64;
9. el contenedor del humo copiaba el `.env` de la instancia de verdad;
10. `rate-limit.test.ts` no devolvía el entorno como lo encontró;
11. el Intro que confirma una palabra de un método de entrada (japonés, chino, coreano) cerraba
    el título;
12. **el primer toque en un desplegable del detalle no abría nada** si llegaba antes que los
    permisos. Era la causa de los reintentos del humo, que se quitan; once desplegables usan
    ahora `useEditableUntilKnown`, y `permission-race.spec.ts` retrasa los permisos 2 s a
    propósito;
13. los problemas y los avisos de la instancia salían en español fijo; ahora llevan `kind` y
    `params` y se traducen;
14. `RIUNA_REVISION` iba antes de los `COPY` de la imagen de la API y rompía su caché de capas;
15. un prefijo vacío en `TRUSTED_PROXIES` (`10.0.0.0/`) se leía como `/0`: confiar en todo.

---

### Interludio — Ideas de OpenProject (antes de la Fase 10) · **planificado**

*Nace de una [comparativa con OpenProject](comparativa-openproject.md) 17.9.1 hecha el
2026-10-12. OpenProject es GPL-3.0, así que se usa solo como inspiración: la comparativa sale de
su documentación pública y sus notas de versión, nunca de su código, y cada funcionalidad se
diseña desde cero sobre los motores de Riuna. Las decisiones se tomaron preguntando
funcionalidad por funcionalidad y son vinculantes para todo el interludio. Su aspecto está en la
maqueta [`ideas-openproject.html`](design-previews/ideas-openproject.html), revisada y aprobada
antes de cerrar este plan.*

**Decisiones del usuario:**

- **Entran** cinco tandas: lo pequeño de cada día, planificación, proyectos y cartera, campos e
  informes, y una wiki.
- **Las tareas resumen entran a petición propia**, tras ver la «summary task» de OpenProject:
  fechas automáticas del padre, mover la rama entera, aviso de desviación y progreso ponderado.
- **Los costes se anotan para el Bloque B**, no se hacen aquí: tipo de actividad y facturable,
  tarifas, presupuesto y cierre de periodos. Ver la nota al principio del Bloque B.
- **La wiki es de páginas simples**: el editor TipTap de siempre, historial y aviso si otro guardó
  mientras editabas. La edición simultánea con Yjs sigue fuera de alcance.
- **El interludio va antes del Bloque B.**

**Tandas.** Tallas a ~8 h/semana: **S** unos días · **M** ≈ 1 semana · **L** 2+ semanas. Cada
punto se entrega en su rama, con su ADR —desde la 076; la 058 sigue reservada—, sus migraciones
—desde la 0084— y su verificación. Cada uno recorre las superficies de «Follow a change through»
de `AGENTS.md`:
- la API, con Valibot y OpenAPI;
- el cliente tipado;
- los eventos y el WebSocket;
- los permisos;
- el MCP, con la prueba de paridad;
- i18n, con `en-US.json` como fuente;
- la actividad;
- la migración para las instalaciones que ya existen;
- y `funcionalidades.md` al cerrar.

**Tanda 1 — Lo pequeño de cada día** (≈ 3 semanas)

- **1.1 Observadores** ✔ · M · [ADR 076](adr/076-observadores.md). Seguir una tarea sin estar
  asignado. **Hecho (2026-10-12).** Pasó de S a M con las decisiones del usuario, tomadas al
  empezarla:
  - se observa solo al crear la tarea, al comentarla y al salir mencionado;
  - añadir o quitar a otra persona pide `task:assign`; observarse a uno mismo, `task:read`;
  - todos los asignados avisan y cuentan como observadores implícitos;
  - lo observado se ve en un filtro `watchers` del motor y en la pestaña «Observando» de Mis
    tareas.

  Lo construido:
  - tabla `task_watcher` (migración 0084) y el módulo `task-watcher`;
  - comentarios, cambios de estado y un tipo nuevo, `task_due_date_changed`, que avisan a toda
    la audiencia;
  - el botón del detalle, la pestaña, el filtro «Observada por», el destinatario de las
    automatizaciones y tres herramientas MCP (49 en total).

  Lo que salió por el camino, ya arreglado:
  - comentar y cambiar el estado solo avisaban al responsable principal;
  - la edición completa de una tarea cambiaba el vencimiento sin publicar
    `task.due_date_changed`, así que ni la actividad ni las automatizaciones se enteraban;
  - la edición en bloque publicaba el cambio de estado de todas las tareas, cambiaran o no, y
    sin el estado anterior.

  Pruebas: 16 de integración en `task-watchers.test.ts`, el filtro y los destinatarios en las
  unitarias, y `watchers.spec.ts` de extremo a extremo.
- **1.2 Recordatorio en la tarea** ✔ · S · [ADR 077](adr/077-recordatorio-en-la-tarea.md).
  **Hecho (2026-10-12).** «Recuérdamelo» en el detalle (mañana a las 9:00, el próximo lunes, en
  una semana, o día y hora, con una nota privada) y en el menú contextual de filas y tarjetas.
  - Tabla `task_reminder` (migración 0085): uno por persona y tarea, privado; basta con poder ver
    la tarea.
  - El planificador lo manda cada minuto (`task-reminders`). Cada fila se reclama borrándola con
    `SKIP LOCKED`, así que con dos instancias no se avisa dos veces.
  - Llega como `task_reminder` por la campana y los canales, y pinchar abre la tarea.
  - MCP: `set_task_reminder` y `clear_task_reminder`.
- **1.3 Acciones de un clic** ✔ · S · [ADR 078](adr/078-acciones-de-un-clic.md). **Hecho
  (2026-10-12).** Un disparador nuevo, «Se pulsa el botón» (`manual`).
  - La regla sale como botón en el detalle, junto al cronómetro, y en «Acciones» del menú
    contextual, mientras la tarea cumpla su «Si».
  - Actúa en nombre de quien pulsa, con `task:update` (y `task:assign` si reparte).
  - La actividad la firma «Ana con «Enviar a revisión»», y la ejecución apunta quién pulsó.
  - MCP: `list_task_actions` y `run_task_action`.
- **1.4 Sesiones activas** ✔ · S · [ADR 079](adr/079-sesiones-activas.md). **Hecho
  (2026-10-12).** Ajustes › Seguridad: navegador y sistema, IP, cuándo entró y cuándo caduca;
  cerrar una o todas menos esta.
  - Rutas propias en `/api/session`, porque las de Better Auth devuelven el token de cada
    sesión.
  - No se gestionan con una clave de API.
  - No enseña la «última actividad»: Better Auth no la guarda con esa precisión.
  - Un dispositivo cerrado sigue hasta cinco minutos, lo que dura la caché de sesión en cookie.
- **1.5 Totales y colores en la Tabla** ✔ · S · [ADR 080](adr/080-totales-y-colores-en-la-tabla.md).
  **Hecho (2026-10-12).**
  - **Totales**: cuántas tareas, estimado, registrado y cada campo de número o moneda, sobre todo
    el filtro.
    - Los calcula `GET /task/tasks/:projectId/totals` con la misma cláusula que la lista
      (`taskListWhere`, sacada de `get-tasks.ts`).
    - Cada tarea cuenta una vez.
    - Medido con 50.000 tareas: p95 de 21 a 35 ms, y 111 ms con la rama entera.
  - **Colores**: colorear filas por prioridad o por vencimiento, guardado en la vista.
  - MCP: `get_task_totals`.
- **1.6 Avisos del proyecto** ✔ · M · [ADR 081](adr/081-avisos-de-proyecto-y-espacio.md).
  **Hecho (2026-10-12).** Tablón de avisos por proyecto (el megáfono de su cabecera) y por
  espacio (paleta de comandos, franja y enlace), con el editor de siempre.
  - Tabla `announcement` (migración 0086).
  - Permisos con el vocabulario que ya existe: `project:update` en un proyecto y
    `workspace:manage_settings` en el espacio.
  - Avisar a los miembros se elige al publicar.
  - Uno fijado sale como franja en las vistas del proyecto, hasta una fecha o sin fin. Cada uno
    la oculta en su navegador.
  - Tiempo real por el canal de usuario.
  - MCP: `list_announcements` y `post_announcement`.

  Lo que salió por el camino, ya arreglado:
  - `i18n:check` fallaba desde la 1.1 porque al catalán le faltaban las claves nuevas; se copian
    del castellano, como el resto del fichero;
  - con «Colorear filas», la barra de la Tabla se salía de ancho en el móvil (lo cazó
    `mobile/overflow`); ahora salta de línea.

Pruebas de los puntos 1.2 a 1.6:
- 22 de integración: `task-reminders`, `manual-automations`, `sessions`, `task-totals` y
  `announcements`;
- unitarias de los atajos del recordatorio, el color de las filas, el navegador de cada sesión y
  los destinos de las notificaciones;
- de extremo a extremo: `task-reminder`, `manual-actions`, `sessions`, `table-totals` y
  `announcements`.

Verificación de la tanda entera (2026-10-12): la batería de integración completa (886 pruebas),
las unitarias de la API y de la web, y las de extremo a extremo (107 pasan y 2 se saltan, como
siempre), incluida `watchers.spec.ts` de la 1.1.

**Tanda 2 — Planificación** (≈ 6 semanas)

- **2.1 Hitos** ✔ · S · [ADR 082](adr/082-hitos.md). **Hecho (2026-10-13).** Una tarea marcada
  como hito, con una sola fecha, que sale como rombo en el Gantt y con `◆` en el Calendario, el
  tablero, la lista y la Tabla, y se puede filtrar.
  - Columna `is_milestone` (migración 0087).
  - El inicio es siempre el vencimiento, en cualquier camino que cambie fechas.
  - Sin estimación, cronómetro ni subtareas: la API rechaza cada una.
  - Interruptor «Hito» en el detalle, actividad propia y MCP (`set_task_milestone`).
  - La hoja CSV/Excel de ida y vuelta no lleva todavía la marca.
- **2.2 Tareas resumen** ✔ · M · [ADR 083](adr/083-tareas-resumen.md). **Hecho (2026-10-13).**
  Decisiones del usuario: los padres sin fechas propias pasan solos a automáticas; una subtarea
  sin estimar pesa la media de la rama; los días laborables son de lunes a viernes sin los
  festivos del espacio.
  - **Fechas automáticas**: marca `auto_dates` y fechas guardadas en la fila (migración 0088,
    que convierte los padres sin fechas y les escribe las de su rama). Se recalculan al escribir
    en `task/schedule`, bajo el cerrojo del proyecto, desde cada camino que mueve fechas, estados
    o el árbol.
  - **Mover la rama entera**: `POST /task/shift-branch/:id`, que usa arrastrar un padre en el
    Gantt. La barra de resumen no se estira.
  - **Aviso de desviación** en el detalle y corchete en tono de peligro.
  - **Progreso ponderado**, ajuste de jerarquía del proyecto. Un hito no pesa.
  - La fecha de inicio pasa a dejar actividad. Lo que mueve la planificación deja actividad,
    pero no avisa ni dispara automatizaciones. MCP: `set_task_auto_dates` y
    `shift_task_branch`.
- **2.3 Precede/sigue con desfase y planificación automática** ✔ · L ·
  [ADR 084](adr/084-precedencias-y-planificacion-automatica.md). **Hecho (2026-10-13).**
  Decisiones del usuario: las sucesoras van **atadas** (se mueven en los dos sentidos) y los días
  laborables son de lunes a viernes sin los festivos del espacio, sin ausencias.
  - Relación `precedes` con `lag` en días laborables (migración 0089); «sigue a» es su vista
    desde la otra punta. Crearla pone a la sucesora en fechas automáticas.
  - El mismo motor de la 2.2: cada cambio despierta a sucesoras y ancestros, en una transacción
    bajo el cerrojo del proyecto. Lo que mueve deja actividad, pero no avisa.
  - Se rechaza lo que no se puede planificar: entre proyectos, con un resumen como sucesora,
    dentro de la propia rama, o si cerraría un ciclo (409). Mover una tarea de proyecto rompe
    las precedencias que crucen.
  - El inicio de una sucesora atada no se edita a mano; su fin, que es su duración, sí.
  - Gantt con flechas y desfase; «Precede a» y «Sigue a» en las relaciones del detalle, con el
    desfase editable.
  - MCP: `precedes` y `lag` en `create_task_relation`, y `set_task_relation_lag`.
  - Medido con 50.000 tareas: una cadena de 200 precedencias que arrastra unas 240 tareas, p95
    de 167 ms (299 ms con la batería de integración a la vez). Un cambio sin nada automático
    encima, 1,4 ms. Los planes, revisados con `EXPLAIN`.
- **2.4 Línea base** ✔ · L · [ADR 085](adr/085-linea-base.md). **Hecho (2026-10-13).** Comparar
  una vista con ayer, el último día laborable, hace una semana o una fecha: qué tareas entran,
  salen o cambian, con el valor anterior tachado, y en el Gantt la barra anterior en fantasma.
  - Se reconstruye desde `activity`, sin instantáneas ni migración. El filtro se evalúa contra el
    pasado con el motor de siempre.
  - Huecos cubiertos de aquí en adelante: asignado y equipo anteriores, la estimación, y el título
    y la prioridad de la edición completa. Una fila antigua sin el valor anterior se da por igual
    que ahora.
  - Las pertenencias se evalúan como están ahora. Las tareas borradas no salen.
  - Selector en la Tabla (en la URL y en la vista guardada) y en el Gantt. MCP:
    `compare_task_baseline`.
  - Medido con 50.000 tareas: ayer y una semana, menos de 155 ms de p95; dos meses con el
    proyecto entero cambiado, 295 ms en el peor caso. Revisado con `EXPLAIN`: un índice nuevo en
    `activity` se probó y no se usaba.
  - De paso: la vista guardada perdía el color de las filas de la 1.5. Ya no.

**Tanda 3 — Proyectos y cartera** (≈ 7 semanas)

- **3.1 Estado de salud del proyecto** ✔ · S · [ADR 087](adr/087-estado-del-proyecto.md).
  **Hecho (2026-10-13).** Sin empezar, en plazo, en riesgo, desviado, terminado o cancelado, con
  una nota. Decisiones del usuario: el responsable es una columna propia; las fechas son propias,
  con aviso si las tareas acaban después del fin.
  - Columnas en `project` (migración 0090) y una actividad de proyecto nueva, `project_activity`.
  - `PATCH /project/:id/status` con `project:update`; «Avisar al espacio» al cambiar la salud.
  - En la lista de proyectos: salud, responsable, fechas con aviso, resumen por estados y los
    filtros «Todos», «En riesgo o desviados» y «Los míos». También en la cabecera del proyecto y en
    sus ajustes, con el historial.
  - MCP: `set_project_status`.
- **3.2 Campos de proyecto y cartera** · L. Campos personalizados con alcance de proyecto, definidos
  en el espacio. La lista de proyectos pasa por el motor de filtros
  ([ADR 014](adr/014-motor-de-filtros.md)), con columnas, orden, vistas guardadas y exportación:
  Excel ya, PDF cuando llegue la 4.2.
- **3.3 Subproyectos** · L. Un proyecto padre con profundidad limitada.
  - Las vistas del padre pueden incluir las tareas de los hijos.
  - El progreso se agrega, y la lista de proyectos sale en árbol.
  - La ADR comprueba que los permisos son del espacio y no hay herencia que diseñar.
  - «Personal» no admite hijos.
  - Nunca se une por prefijo de `path` (regla de `AGENTS.md`).

**Tanda 4 — Campos e informes** (≈ 3 semanas)

- **4.1 Campos calculados y textos de ayuda** · M. Un tipo `formula` sobre campos de número y
  moneda, la estimación y lo registrado, con suma, resta, multiplicación, división, mínimo,
  máximo y «si», evaluado por un analizador propio y pequeño, sin `eval`. La ADR decide si se
  materializa para poder filtrar y ordenar. Cada definición de campo lleva un texto de ayuda, que
  sale en el detalle, la Tabla y el importador.
- **4.2 Exportar a PDF** · M. Tres documentos:
  - una tarea, con sus campos, la descripción, las subtareas y los comentarios;
  - cualquier vista con sus filtros, como ya hace el Excel;
  - el parte de horas con sus totales.

  Una dependencia nueva, con su justificación de una línea y licencia compatible: nada GPL.

**Tanda 5 — Wiki de páginas** · L (≈ 4 semanas)

- Páginas en árbol por proyecto y por espacio, con el editor TipTap actual: menciones, enlaces a
  tareas, adjuntos y Mermaid.
- Historial con diferencias y restaurar.
- Bloqueo optimista: «Marc guardó mientras editabas», con ver diferencias, guardar encima o
  descartar.
- Búsqueda global y enlaces de la página a la tarea y de la tarea a la página.
- Permisos con `@riuna/permissions` y MCP para leer, buscar y crear.
- Sin dependencias nuevas. La edición simultánea con Yjs se reconsidera solo si la wiki se usa de
  verdad.

**Al cerrar el interludio**, antes de empezar el Bloque B: **montar la copia externa en Google
Drive**, aplazada desde la Fase 9 el 2026-10-12. Es el servicio `offsite` de `compose.local.yml`
con un remoto `crypt` de rclone ([ADR 072](adr/072-copias-fuera-de-la-maquina-y-simulacro.md));
los pasos están en [copias de seguridad](copias-de-seguridad.md). Las dos contraseñas del cifrado
se guardan fuera del PC. Hasta entonces, las copias viven solo en el disco del PC.

**Fuera de alcance, declarado:** reacciones y citar comentarios, planificador de equipo, página de
resumen del proyecto, reuniones, correo entrante, 2FA, resumen diario por correo, compartir una
tarea con alguien de fuera y parte semanal en rejilla. Lo descartado sin preguntar, con su
motivo, está en la [comparativa](comparativa-openproject.md#qué-se-decidió-2026-10-12).

---

# BLOQUE B — CRM y ERP ligero (posterior)

Marco para que las decisiones de hoy no lo bloqueen. Modelo funcional guiado
por Dolibarr, implementación propia sobre los motores de las Fases 2, 3 y 4.

**Ideas de OpenProject anotadas para este bloque** (2026-10-12, ver la
[comparativa](comparativa-openproject.md#4-tiempo-y-costes)):
- tipo de actividad y marca de facturable en cada entrada de horas, para facturar horas en la
  Fase 11;
- tarifas por hora por persona y, si hace falta, por proyecto, que convierten lo registrado en
  coste (Fases 11 y 12);
- presupuesto de proyecto en horas, en dinero y en gastos, frente a lo real (Fases 10 y 11, con
  el enlace deal ↔ proyecto);
- cierre de periodos de imputación y topes por entrada y por día, para que lo facturado no
  cambie (Fase 11).

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

Edición simultánea de la wiki con Yjs (la wiki de páginas entra en el
[interludio de ideas de OpenProject](#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado)),
pizarras, chat interno, formularios públicos, app móvil nativa, funciones de IA,
facturación de suscripciones.

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

**Cerrado el 2026-10-04** (punto 20 del cierre de la deuda): el humo de la Fase 0
(`phase0-flow.spec.ts`), el asistente de importación (`import-wizard.spec.ts`) y los
tres gestos de la tabla (`table-gestures.spec.ts`) están escritos, y el humo corre en
CI (job `e2e`, con servicio de PostgreSQL y `playwright install`).

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

## Cierre de la deuda de las fases cerradas

**Cerrado (2026-10-05).** Las cinco tandas y sus remates están en `main` (PR #38–#45). Solo
queda abierta, por decisión del usuario, la facturación heredada.

*Decidido el 2026-10-03, antes de empezar la Fase 8: dejar a cero lo que las fases
anteriores declararon pendiente, o cerrarlo por escrito con su razón. El inventario
sale de las secciones «Deuda» de cada fase, de la
[revisión estética](revision-estetica-2026-09.md) y de «Lo que no está» en
[funcionalidades](funcionalidades.md); las más importantes se comprobaron contra el
código el mismo día. Cinco tandas, de más fácil a más difícil; una rama y una PR por
tanda (`chore/deutes-tanda-N`), un commit por punto. Mismas tallas que arriba.*

**Decisiones del usuario:** la instancia de producción ya tiene el interludio
desplegado; los miembros pueden asignar tareas y definir campos sigue siendo de
`admin`/`owner`; el catalán se queda retirado; la facturación heredada **queda
abierta** porque quiere estudiarla; Tablero, Lista y Backlog se migran al motor de
filtros.

**Tanda 1 — decisiones y retoques** · XS
1. Este inventario. ✔
2. ✔ Retirar el normalizador de días del 0.2 (producción ya está convertida), conservando
   el aviso de que PostgreSQL no está en UTC. **Hecho (2026-10-03).** El aviso vive ahora en
   `utils/warn-if-database-not-utc.ts`; de las seis pruebas de `day-columns-timezone` quedan las
   dos que no dependían de la conversión. Detalle en la ADR 049.
3. ✔ `task:assign` para el rol `member` (migración de los `workspace_role` existentes).
   **Hecho (2026-10-03)**, [ADR 062](adr/062-los-miembros-asignan-tareas.md). La migración 0078
   solo toca las filas que conservan el reparto sembrado. Cuatro pruebas nuevas, que fallan sin
   el cambio; las tres del RBAC que vigilaban la puerta `assign` pasan a un rol que edita pero no
   reparte. De paso, `task-team` leía la actividad sin esperar al suscriptor (carrera que fallaba
   dos de dos con la máquina cargada): ahora usa `vi.waitFor`, como `task-assignees`.
4. ✔ El `<h2>` de «Rama» en la tarea, a 14 px. **Hecho (2026-10-03).** «Rama» y «Tiempo» (que
   copió su clase en el 0.3) pasan al papel «Título de sección» de §05, como «Actividad».
   Visto a 1440 y 390 px.
5. ✔ El calendario heredado nombra los días en inglés. **Hecho (2026-10-03).** No era el calendario
   del proyecto, que ya formatea con la lengua de la aplicación, sino el **selector de fecha**:
   `DayPicker` no recibía `locale` y pintaba «October 2026» y los días en inglés. Ahora recibe
   `es` o `enUS` según la lengua activa, y el desplegable de mes usa la misma. Lo vigila
   `date-picker.spec.ts`, que falla sin el cambio.
6. ✔ `GET /api/my-work/tasks` sin consumidor web: se mantiene como API pública y se cierra la nota.
   **Hecho (2026-10-03).** Sigue publicada, documentada y probada; la usan las claves de API y los
   scripts. Retirar una ruta pública no se hace por no tener consumidor propio.

*Verificación de la tanda 1 (2026-10-03): integración 748 de 750 (1 omitida) —la que falla es la
importación grande, intermitente, que sola pasó 19 de 19 en dos de tres vueltas—, humo 63 de 63,
unitarias 745 (API) y 10 (permisos), typecheck de API y web, Biome e i18n.*

**Tanda 2 — arreglos pequeños** · S
7. ✔ «Pasar al siguiente día laborable» salta festivos y ausencias. **Hecho (2026-10-03).**
   `nextWorkDayKey` recibe el conjunto de días no disponibles (`unavailableDayKeys`, a partir de
   `GET /availability/holidays` y `/time-off`, que la web ya leía) y lo usan «Terminar el día» y
   el diálogo de aviso («Mañana»). El conjunto va vacío mientras carga. Prueba e2e en
   `close-day.spec.ts` que falla sin el cambio, más 5 unitarias.
8. ✔ Un solo formateador `yyyy-mm-dd` en la web y un solo esquema de día en la API.
   **Hecho (2026-10-03).** Sin ADR: es un ayudante, no una decisión estructural. Web:
   `lib/day-key.ts` (`dayKey`, `parseDayKey`) sustituye a 13 copias; API:
   `utils/day-key-schema.ts` sustituye a 5. De paso, el rango por defecto de «Crear ciclo»
   dejó de cortar en UTC —el fallo de la víspera entre las 00:00 y las 02:00 que la ADR 049
   dejó anotado—. Verificación: typecheck, 383 unitarias del web (con `day-key.test.ts`),
   95 de integración de los routers tocados y 44 e2e de las pantallas que usan días.
9. ✔ Festivos, ausencias y el interruptor de responsable publican eventos. **Hecho (2026-10-03)**,
   [ADR 063](adr/063-festivos-ausencias-y-responsable-por-websocket.md). Un evento
   `availability.changed` con los destinatarios resueltos al publicar y un mensaje
   `AVAILABILITY_INVALIDATED`. Tres pruebas de integración de los destinatarios (fallan sin el
   cambio) y una unitaria del mapa de invalidaciones.
10. ✔ El stand-up propio reutiliza las lecturas en lote de `lead/` (hoy, unas 25 consultas).
    **Hecho (2026-10-03).** Medido: de **30 a 7 consultas**. `review/standup-batch.ts`
    (`loadStandups`) es la única implementación y el stand-up propio es esa función con una sola
    persona, así que ya no pueden diferenciarse; `previousWorkDay` se mueve a su propio fichero
    para no hacer un ciclo `review` ↔ `lead`. Las pruebas que comparan el propio con el del
    responsable campo a campo siguen en verde.
11. ✔ Las 48 clases `text-lg`/`2xl`/`4xl` pasan a los siete papeles tipográficos. **Hecho
    (2026-10-03).** Eran 47 en 38 ficheros (el inventario se había quedado corto: los ajustes
    del espacio y del proyecto añadieron más). Los `h1` de página → `text-page`; los títulos de
    tarjeta, diálogo y sección → `text-section`; el importe de facturación → `text-display`.
    Se quitan de paso los pesos e interlineados sueltos que el papel ya lleva. `type-scale.test.ts`
    vigila que no vuelvan (falla con una clase puesta a propósito). Visto en inicio de sesión,
    ajustes, búsqueda y crear espacio; en la búsqueda hizo falta `font-normal`, porque el papel
    pone 600 y un campo de texto no lo quiere.

    ~~**Hallazgo, fuera del inventario:** quedan `text-xl` (títulos de todos los diálogos, el
    onboarding, el logotipo y el `Empty`), `text-3xl` (error público) y `text-7xl` (reloj del
    modo foco).~~ Cerrado el 2026-10-04 (ver «Remates tras la tanda 5»).
12. ✔ `i18n:check` detecta claves usadas que no existen. **Hecho (2026-10-03).** Busca los literales
    `"ns:ruta"` de `apps/web/src` y falla si alguno no está en `en-US.json` (con plurales y prefijos
    de objeto). Hoy no hay ninguno: el hueco que dejó la Fase 7.5 estaba cerrado, ahora además
    vigilado. Se descartan los identificadores de permiso (`workspace:read`), que parecen claves;
    las claves construidas con `${…}` no se pueden ver. Comprobado con una clave inventada.
13. ✔ Regenerar `apps/api/openapi.json` (sin tocar desde 2026-08-27), con la URL saneada.
    **Hecho (2026-10-03).** 197 rutas. La URL del servidor salía del `.env` (una IP de Tailscale):
    se regenera con `RIUNA_API_URL=http://localhost:1337 pnpm --filter @riuna/api openapi:export`.
    Para que no vuelva a caducar en silencio, `tests/api/openapi-up-to-date.test.ts` compara el
    fichero con la especificación viva, salvo `servers`; falla con una ruta quitada y pasa sin
    `.env`, que es como corre la CI.
14. ✔ Tonos 4 y 5 de la paleta de datos por debajo de 3:1: etiquetas del eje o vista de tabla.
    **Cerrado por verificación (2026-10-03), sin cambio de código.** La entrada «P2 bis 17» de la
    revisión estética era anterior al arreglo que ya hizo el 17 de la segunda tanda (barras
    horizontales con `interval: 0`). Se comprobó cada uso de la paleta: el reparto en barras y el
    reparto en lista rotulan cada cubo con su nombre, y todo lo demás (burndown, velocidad,
    tendencia) usa solo `--chart-1`. La condición de relevo de la regla —rótulo visible— se cumple.
15. ✔ Las tarjetas de tablero y lista muestran todos los asignados. **Hecho (2026-10-03).**
    `GET /task/tasks/:projectId` devuelve `assignees` en cada tarea: el conjunto completo, en orden
    de asignación; para las de varias personas, desde `task_assignee` (`task/multi-assignees.ts`,
    solo las que tienen más de un asignado); para las de una, el responsable principal que ya se leía.
    **Medido** en el banco de 50.000 tareas (proyecto de 10.000, 261 con varios asignados):
    **26 ms**, todo por índices. En la web, `AssigneeStack` sustituye a tres bloques de avatar
    repetidos (tablero, lista y backlog) y de paso elimina una búsqueda en los miembros del
    espacio por cada tarjeta. Prueba de integración del contrato y e2e del tablero, que falla sin
    el cambio. Quedan fuera los asignados por equipo, que ya tienen su propia etiqueta.
16. ✔ `dueDate eq <día>` compara un instante: comparar por rango del día de Madrid. **Hecho
    (2026-10-03)**, nota en la [ADR 014](adr/014-motor-de-filtros.md). Un `yyyy-mm-dd` sobre una
    columna `timestamp` es el día de la zona de la API: `eq` es `[inicio, fin)`, `gt` desde el
    día siguiente, etc.; un instante completo sigue siendo un instante, y un día inexistente es
    un 400. Antes `eq` devolvía lista vacía con un vencimiento elegido en el navegador (la prueba
    de integración con fechas reales de Madrid lo demuestra: falla sin el cambio). «Vence hoy a las
    00:00 sale vencida», la segunda mitad del hallazgo, ya la cerraba la ADR 049 y la vigila
    `day-columns-timezone.test.ts`.
17. ✔ Índice `task (completed_at)`: medir en el banco y construir solo si se cumple la condición de la ADR 030.
    **Hecho (2026-10-03): se construye** (migración 0079). La condición era «ventana estrecha
    sobre años de historia», que el banco no tenía (su historia cabía entera en la ventana). Con
    las cerradas repartidas en tres años, «hechas esta semana» en un espacio de 50.000 tareas pasa
    de **20 ms a 0,5 ms** y el planificador lo usa. Parcial (`WHERE completed_at IS NOT NULL`),
    así que solo pesa lo cerrado. Ver nota en la ADR 030.

*Verificación de la tanda 2 (2026-10-03/04): integración 754 de 755 (1 omitida, ninguna fallada), humo 64 de 65, unitarias 754 (API), 390 (web) y 33 (MCP), typecheck de los seis paquetes, Biome e i18n. La que falla, `weekly-review.spec.ts`, **falla igual en `main`**: depende del día de la semana (los dos primeros días de la semana la revisión es la de la semana anterior y lo cerrado hoy no cuenta), y se vio al cruzar la medianoche del sábado al domingo. Va al punto 18.*

**Tanda 3 — pruebas y estabilidad** · S–M
18. ✔ Las pruebas intermitentes. **Hecho (2026-10-04).** Sin ADR: el bus gana dos funciones, no una decisión.
    - **La importación grande no era un fallo de la prueba, era un defecto de producción.** La
      importación emitía todos sus `task.created` de golpe; cada uno despierta a varios gestores
      que consultan la base, y miles de consultas contra un pool de 10 con cinco segundos de espera
      dejaban sin conexión a los que no llegaban: **con el código antiguo, en una de cada tres
      vueltas se perdían 500 de las 600 actividades**, en silencio ("Error processing event
      task.created: timeout exceeded when trying to connect"). Ahora el bus sabe qué gestores están
      en marcha (`settleEvents`) y la importación publica por tandas de 20 esperando a que cada una
      drene (`publishEventsPaced`), **después de responder**. La prueba comprueba que llegan las 600
      actividades; con el cambio, 3 de 3 limpias.
    - **El *deadlock* del `TRUNCATE`** venía del mismo trabajo asíncrono de la prueba anterior:
      `resetTestDatabase` espera ahora a los gestores en marcha y reintenta (hasta 3) solo ante un
      `40P01`. Es lo único que no se ha podido demostrar con una vuelta corta; lo juzgará la
      batería completa.
    - **`weekly-review.spec.ts`** esperaba "Hechas1" sin mirar el día: los dos primeros días de la
      semana la pantalla revisa la anterior. Ahora espera lo que toca ese día.
    - **El e2e de la ausencia** no se reprodujo en 30 vueltas seguidas. No se inventa una causa: se
      espera explícitamente la respuesta del `DELETE`, para que el próximo fallo diga si hubo
      respuesta.
    - **`task-team`** (punto 3) ya esperaba la actividad con `vi.waitFor`.
19. ✔ Las pruebas de componente del web no arrancan en el devcontainer (jsdom). **Cerrado por
    verificación (2026-10-04).** Ya arrancan: las 30 de componente corren entre las 74 del web
    (390 pruebas), también con `pnpm test --force`, que lanza los diez paquetes a la vez —el
    escenario donde caducaban los workers—. La nota era de la Fase 4.5 y se quedó vieja.
20. ✔ Los dos casos de humo que faltan (el de la Fase 0 y el asistente de importación), los tres
    gestos de la Fase 4 sin probar, y Playwright en CI. **Hecho (2026-10-04).**
    - **El asistente de importación de la Fase 5 no funcionaba en ningún navegador.** El cliente
      compartido (`packages/libs/src/hono.ts`) ponía `Content-Type: application/json` a toda
      petición, también a un `FormData`; el navegador no podía poner su
      `multipart/form-data; boundary=…` y el servidor no veía ningún campo
      (`Expected "file" but received undefined`). Los 19 casos de integración pasaban porque
      llaman a la API sin ese cliente. Lo encontró el primer intento de escribir el caso de humo.
      Corregido en origen (`apiHeaders`), con prueba unitaria.
    - **`import-wizard.spec.ts`**: fichero con jerarquía → mapeo → «Comprobar» (no crea nada) →
      importar (la hija cuelga de su madre) → reimportar el mismo fichero: actualiza y no duplica,
      que es el criterio de aceptación de la Fase 5.
    - **`phase0-flow.spec.ts`**: inicio de sesión por el formulario (el resto de pruebas lo
      saltan), crear proyecto, dos subtareas, mover una tarea en el tablero **arrastrando** y
      exportar a Excel.
    - **`table-gestures.spec.ts`**: elegir el tipo «Selección múltiple» al crear un campo, editar
      esa selección, y guardar y **cargar** una vista del menú. De paso se vio que el menú de
      selección múltiple se cierra tras cada elección: hay que reabrirlo para marcar la segunda.
    - **CI**: job `e2e` con servicio de PostgreSQL, `pnpm build` (la API y la web consumen el
      `dist` de los paquetes), Chromium y trazas como artefacto si falla. No se puede ejecutar
      Actions desde aquí: el YAML se validó y el camino se simuló en local con `CI=true`.
    - Las tres especificaciones nuevas, 3 vueltas seguidas: 9 de 9.

*Verificación de la tanda 3 (2026-10-04): integración 754 de 755 (1 omitida, ninguna fallada), humo **68 de 68**, unitarias de los diez paquetes, typecheck, Biome e i18n.*

**Tanda 4 — funcionalidad mediana** · M
21. ✔ Notificaciones paginadas y con filtro de no leídas (hoy, tope de 50). **Hecho (2026-10-04).**
    `GET /notification` acepta `limit` (1-100), `before` (cursor por fecha, no `OFFSET`: se crean y
    borran sin parar) y `unread`; sin parámetros devuelve las 50 de siempre, así que el contrato
    público no cambia. `GET /notification/unread-count` da el total exacto: **la insignia de la
    campana contaba las no leídas entre las 50 que traía**, y con más decía «50» (el e2e lo
    demuestra: falla sin el cambio). El desplegable gana «Cargar notificaciones anteriores». De
    paso, el título de la campana en castellano decía «Notificationes». Seis pruebas de
    integración (recorrer 120 sin repetir ni saltar ninguna, filtro, total, aislamiento entre
    personas, 400 por parámetros absurdos) y un e2e.
22. ✔ La búsqueda enseña el nombre de la columna, no `status` en crudo. **Hecho (2026-10-04).**
    `GET /search` devuelve `statusName` junto a `status`, con una subconsulta escalar sobre las
    columnas del proyecto de cada tarea (no un `JOIN`: `column` no es única por `(proyecto, slug)` y
    repetiría el resultado; hay una prueba con dos columnas del mismo slug). Un estado que no es
    columna —`planned`, `archived`— queda sin nombre y la pantalla cae al estado. Dos pruebas de
    integración.
23. ✔ Las preferencias pasan de `localStorage` a la API (incluido el inicio de semana). **Hecho
    (2026-10-04)**, [ADR 064](adr/064-las-preferencias-viajan-con-la-cuenta.md). Tabla `user_preference`
    (un `jsonb` por persona, migración 0080 solo de tabla nueva) con `GET`/`PUT /api/user-preferences`,
    lista cerrada de claves y fusión en SQL. En la web el almacén sigue siendo la memoria inmediata y
    `usePreferencesSync` lo sincroniza: aplica lo del servidor salvo lo que la persona tocó mientras
    tanto, sube lo personalizado la primera vez, y manda cada cambio con espera. **El tema y los avisos
    del navegador no viajan** (son del dispositivo). Seis pruebas de integración, seis unitarias de la
    lógica de fusión (una vigila que los valores por defecto del almacén y de la sincronización no se
    separen) y dos e2e que fallan sin el cambio.
24. ✔ Cambiar un campo personalizado deja rastro en la actividad. **Hecho (2026-10-04).** Una fila
    `custom_field_changed` por campo, con el valor anterior y el nuevo («cambiado “Presupuesto” de
    1000 a 2500»). El controlador lee el valor previo en la misma transacción, con la fila
    bloqueada, para que el «de» sea el de verdad sin reintroducir la pérdida de actualizaciones
    que su fusión en SQL evita. Guardar el mismo valor no deja nada, y los campos de tipo usuario
    o relación dicen que cambiaron, no a qué identificador. Cuatro pruebas de integración que
    fallan sin el cambio.
25. ✔ Editor de definiciones de campos: renombrar, archivar, borrar, reordenar y campos de espacio.
    **Hecho (2026-10-04).** Un componente (`FieldEditor`) en dos sitios: una sección «Campos
    personalizados» en *Ajustes del proyecto › Flujo de trabajo*, y una página nueva *Administración
    del espacio › Campos personalizados*. Sin cambios de API: ya hacía todo. Crear reutiliza el diálogo
    de la tabla; ordenar renumera todos con su índice (si varios compartían posición, intercambiar solo
    dos no habría fijado un orden); borrar pide confirmación y dice que se pierden **los valores** de
    todas las tareas. En el editor de un proyecto, los campos del espacio se ven con su etiqueta y no se
    tocan: se editan donde tienen el permiso (`workspace:manage_settings`). Dos e2e, el primero cae sin
    la sección de la página.
26. ✔ Los campos de espacio llegan a los widgets y a «Mis tareas». **Hecho (2026-10-04).** El endpoint
    ya existía (`GET /field/workspace/:id`); faltaban el fetcher y los consumidores. Cada campo lleva
    ahora `filterable`, con el mismo criterio que el registro del servidor: **falso si algún proyecto
    redefine la clave con otra forma de comparación**, porque ofrecerlo acabaría en un 400. Un ayudante
    compartido (`customFieldsToFilterable`) convierte definiciones en campos filtrables para el
    proyecto, «Mis tareas» y los widgets de espacio, que antes tenían cada uno lo suyo. Dos pruebas de
    integración, cuatro unitarias del ayudante y un e2e que falla sin el cambio. No añade columnas
    personalizadas a «Mis tareas» (solo filtro), que sigue siendo de lectura.
27. ✔ MCP conoce campos personalizados, asignados múltiples y equipos (y el paquete stdio igual).
    **Hecho (2026-10-04).** `create_task` y `update_task` aceptan `customFields`, `assigneeIds` y
    `teamId`; `list_tasks` acepta `filter` (el JSON del motor de filtros, con `custom.<clave>`) y
    `treeScope`. Cada cosa vive en su ruta y con su permiso, así que se guardan **después** de la
    tarea; si una falla, el error dice que la tarea ya está guardada (con su id) en vez de dejar creer
    que no se creó, y lo que se devuelve es la tarea como quedó. Los dos registros siguen siendo dos
    copias: la prueba de paridad ahora compara también **los parámetros de cada herramienta**, no solo
    los nombres (cae si el *stdio* se queda atrás, comprobado). Cinco pruebas del HTTP y una del
    *stdio*. Siguen sin herramienta: vistas, paneles, objetivos, ciclos, plantillas y recurrencias.
28. ✔ Crear un proyecto entero desde una plantilla de proyecto. **Hecho (2026-10-04).** `POST /project`
    acepta un `templateId` opcional: el proyecto nace con **las columnas de la plantilla** (las cuatro
    de siempre si no trae), sus épicas y su árbol de tareas, que se despliega con el mismo código
    que aplicar una plantilla (comprueba profundidad y campos antes de crear nada). Si el despliegue
    falla igualmente, el proyecto recién creado se borra: no queda uno vacío a medias. Una
    plantilla de otro espacio es un 404, como si no existiera. `insertProject` acepta columnas. En
    la web, el modal de «Añadir proyecto» ofrece «Plantilla» cuando el espacio tiene alguna de
    proyecto. Cuatro pruebas de integración y un e2e.
29. ✔ La plantilla de las recurrentes lleva etiquetas, épicas y campos. **Hecho (2026-10-04).** Nota en
    la [ADR 026](adr/026-tareas-recurrentes.md). Se reutiliza, no se duplica: `parseTaskExtras` y
    `decorateTask`/`resolveEpics` salen del desplegador de plantillas de tarea y los usan las dos.
    Dos pruebas de integración que fallan sin el cambio, y las de plantillas siguen en verde. El
    editor web sigue escribiendo solo título y prioridad: el cambio es del modelo y de la API.
30. ✔ Los agregados del árbol suman campos numéricos. **Hecho (2026-10-04).** `subtree.fieldSums` en
    el listado y en el detalle: la suma de cada campo numérico o de moneda sobre la rama, la propia
    tarea incluida y sin lo archivado, como la estimación. Va en una **segunda consulta** y solo si el
    proyecto tiene algún campo sumable (meterla en la primera multiplicaría sus filas por el número de
    campos y falsearía los recuentos); sigue el truco de los segmentos de `path`. **Medido** en el
    banco, un proyecto de 10.000 tareas con valores en el 70 %: **25 ms** para una página y 50 ms
    para el proyecto entero. La tarjeta «Rama» del detalle enseña una fila por campo («Presupuesto de
    la rama: 1350,50 €»). Esto es la mitad de datos del punto 32 (agregados como columnas de la tabla).
    Dos pruebas de integración y un e2e que falla sin el cambio.
31. ✔ Compositor de tarea en línea al pie de cada columna del tablero. **Hecho (2026-10-04).** «Añadir
    tarea» al pie de la columna se vuelve un campo de título: Intro crea la tarea en esa columna y el
    campo se queda abierto, vacío y con el foco, para encadenar una lista; Esc lo cierra sin crear.
    Solo título: el «+» de la cabecera sigue abriendo el formulario entero. El campo está en `readOnly`
    mientras se crea y no `disabled`, porque un campo desactivado pierde el foco (lo encontró el e2e).
    Un e2e que crea dos seguidas y comprueba su estado en la API.

*Verificación de la tanda 4 (2026-10-04): integración 782 de 783 (1 omitida, ninguna fallada), humo **77 de 77**, unitarias de los diez paquetes (API 762, web 400, MCP 34), typecheck, Biome e i18n. Migración nueva: 0080 (`user_preference`, solo una tabla).*

**Tanda 5 — las grandes** · L
32. ✔ Vista Tabla: agrupar por épica, elegir columnas (que la vista guardada las recuerde) y
    agregados del árbol como columnas ordenables. **Hecho (2026-10-04).**
    - **Agrupar por épica.** Una tarea con varias sale en cada una de ellas (una épica es
      transversal, no un cajón) y lo que no tiene ninguna va al final; las hijas van con su madre
      sea cual sea su épica, porque la rama no se parte. Cada grupo es una tabla hermana con las
      mismas columnas y el mismo orden, para que ordenar no mezcle los grupos; cada copia lleva su
      propio identificador de fila, y los grupos se pliegan.
    - **Elegir columnas.** Un selector con las fijas, los campos y los **totales de la rama**
      (progreso, subtareas hechas/total, estimación y la suma de cada campo numérico o de moneda),
      ordenables como cualquier otra. Los totales vienen apagados: la tabla de siempre no cambia.
      `title` no se puede ocultar, y una columna que ya no existe —un campo archivado después de
      guardar la vista— se ignora en vez de fallar.
    - **La vista guardada lo recuerda**: `config.columns` y `config.groupBy`, validados y acotados en la
      API como el filtro, y en la URL como el resto del estado de la tabla.
    - Lógica en módulos puros con prueba (`rows.ts`, `columns.ts`: 11 casos), tres e2e y dos pruebas de
      integración de la vista. No toca el modelo de datos.
33. ✔ Tablero, Lista y Backlog pasan al motor de filtros del servidor: cierra el criterio de
    aceptación de la Fase 4. **Hecho (2026-10-04)**, [ADR 065](adr/065-tablero-lista-y-backlog-filtran-en-el-servidor.md).
    - **Un solo constructor** (`lib/task-view-filter.ts`, 12 casos) traduce los menús y el
      buscador al árbol del motor; las tres vistas piden `useGetTasks(projectId, filter)` y no
      queda filtrado en memoria. El Backlog usa por fin la semana de la persona y filtra por
      etiqueta (leía una caché que casi siempre estaba vacía).
    - El buscador espera 250 ms y conserva la respuesta anterior mientras llega la nueva.
    - **Encontrado de paso:** el filtro del tablero se perdía al recargar en desarrollo (un
      efecto de lectura y otro de escritura en el mismo montaje; el segundo borraba lo guardado).
      Ahora se lee al crear el estado.
    - **Cambios de comportamiento, razonados en el ADR:** un número en el buscador casa con el
      número exacto (`2` ya no trae la 12); las etiquetas se filtran por nombre, sin distinguir
      el color; «mover todo» del Backlog mueve lo que el Backlog muestra.
    - Cuatro e2e (`view-filters.spec.ts`: prioridad con recarga y Lista, buscador por título y
      por identificador, etiqueta por nombre, Backlog por prioridad y etiqueta). Medido en un
      proyecto de 10.000 tareas: 13 ms.

*Verificación de la tanda 5 (2026-10-04): integración 784 de 785 (1 omitida, ninguna fallada), humo **84 de 84**, unitarias de los paquetes (API 762, web 422, MCP 34, permisos 10, libs 6, planka-import 54, email 11), typecheck, Biome e i18n. Sin migraciones nuevas.*

**Remates tras la tanda 5 (2026-10-04)** — los dos hallazgos que dejó la verificación.
- ✔ **Tamaños fuera de escala.** `text-xl` y `text-3xl` pasan a los papeles de la marca: los títulos
  de diálogo, hoja (`Sheet`), diálogo de alerta y `Empty` a `text-section` (16 px, que es lo que
  pide el manual para modales; llevaban 20), el onboarding, el alta de perfil, la búsqueda y el
  logotipo a `text-page` (20 px, igual que antes) y el error público a `text-display` (30 px,
  igual). La prueba de escala vigila ahora también `xl` y `3xl` (falla con una clase puesta a
  propósito). Se queda `text-7xl` a propósito: el reloj del modo foco es un numeral de portada
  que ningún papel cubre.
- ✔ **«Workspace Name»** en la pantalla de crear espacio: la clave `workspace:create.nameLabel` ya
  existía y traducida; el literal simplemente no la usaba.
- ✔ **Textos en inglés escritos a mano en pantallas heredadas.** «Workspace Name» no era un caso
  aislado, y `i18n:check` no lo ve: sin clave no hay clave que falte. Un rastreo sobre el árbol
  sintáctico (JSX, atributos de texto y `toast.*`) encontró y se tradujo: la autorización de clientes
  MCP y la aprobación de dispositivos (`auth.mcp.*`, `auth.device.*`), la navegación móvil del
  proyecto, el modal de archivar tareas (con plural), el aviso de columna vacía de la vista
  pública, los textos accesibles («Cambiar tema», «Abrir el menú de ajustes», «Descartar»,
  «Cargando») y el aviso de proyecto creado. Los iconos de marca de los menús dejan de llevar un
  `<title>Check</title>` que un lector de pantalla leía en inglés. Se borró
  `delete-team-member-modal.tsx`, que no importaba nadie.
  - **Lo vigila `hardcoded-copy.test.ts`**: lee todos los `.tsx` con el analizador de Babel
    (TypeScript 7 ya no trae API de JavaScript) y falla si queda texto de JSX, un `aria-label`,
    `title`, `placeholder`… o un `toast.*` con texto escrito a mano. Se exceptúan nombres propios,
    teclas y ejemplos de `placeholder`. Probado que falla con un literal puesto a propósito; al
    escribirlo ya cazó un import duplicado en `kanban-view.tsx`.
  - **Quedan exentos, con su razón en el propio test**: la facturación heredada (deuda abierta) y
    la página de prueba de errores (solo desarrollo).
  - Tres e2e (`translated-screens.spec.ts`).

**Sigue abierta, sin tanda:** el código de facturación heredado (apagado por configuración).
El usuario quiere estudiarlo antes de decidir.

**Cerrado por decisión, no es deuda:**
- **Paginar las vistas.** Con los tamaños reales no se notaría: cargar un proyecto entero cuesta
  41 ms con 500 tareas, 89 ms con 2.000 y 215 ms con 5.000. Además empeoraría el tablero, que
  tendría que cargar por columnas. El punto 33 ya recorta lo que viaja en una vista filtrada. Se
  reabre si un proyecto se acerca a las 5.000 tareas, y `ProjectSizeWarning` ya avisa.
- **Índices de rango y GIN sobre `custom_fields`:** 12 ms medidos sobre 10.000 tareas.
- **El tipo de campo «relación»:** pasa a la Fase 10, donde apuntará a `company`.
- **El catalán:** retirado.
- **Razonadas en su ADR y por tanto intencionadas:** el orden entre hermanas comparte columna con
  el tablero (011); la profundidad heredada puede superar el límite (011); `Tab`/`Shift+Tab` solo
  en modo jerarquía; el burndown se dibuja sobre el alcance actual (025); solo se reordenan grupos
  de hermanas completos (017); la escala de TipTap va aparte (018); la tabla embebida no pagina y no
  hay `widget.view_id` (030).
- **Menores de la revisión estética:** `#5FD3C0` como texto activo en oscuro y las leyendas de ajustes
  escritas en línea.
- **Sin protocolo nuevo:** el resalte en tiempo real en «Mi panel» exigiría cambiar `MY_WORK_INVALIDATED`.
- **Si el perfilado lo pide:** encajar el arrastre del Gantt a la unidad del zoom y virtualizar filas.
- **El cubo «otros» sin ver en pantalla:** lo cubren las pruebas.
- **A otras fases:** importar la hoja de SERVITEC y enviar el stand-up a Slack o Telegram → Fase 8;
  Sentry y las copias fuera de la máquina → Fase 9.

**Riesgo fuera de alcance:** las copias viven en el mismo disco que la base
([copias de seguridad](copias-de-seguridad.md)). Si hubiera una sola excepción a «solo deuda»,
sería `deploy/copia-externa.sh` del [plan de despliegue](plan-despliegue.md).

---

## Siguiente paso

El **interludio de espacio personal y administración** está **cerrado**: sus
catorce bloques están hechos, commiteados y verificados. También lo está el
**[interludio de productividad personal y equipo](#interludio--productividad-personal-y-equipo-antes-de-la-fase-8--cerrado)**:
sus cinco bloques están hechos, con el **4.2**, importar iCal, aplazado a
petición del usuario (la ADR 058 queda reservada). Está todo en `main`
(2026-10-03): de la PR #28 (Bloque 0) a la #33 (Bloque 5), la #34 con los
arreglos de la revisión de código y la #36 con «Personal» en Proyectos, la
administración en el menú del avatar y «Objetivos» fuera de la barra.

**Ensayo del despliegue (2026-10-03).** Sobre una copia de producción, con lo
mismo que hace la API al arrancar y sin planificador, plugins ni WebSocket:
- las migraciones 0069-0076 se aplican sin errores; la 0077, que llegó
  después, se aplicó sobre la misma copia y renombró la Bandeja creada al
  probarla;
- la conversión de días del 0.2 lleva las 5 entradas del plan a la medianoche
  de Madrid sin cambiar ninguna de fecha, y la segunda vuelta no toca nada;
- Hoy, el Planificador, el Cronograma, el stand-up y «Mi equipo» cargan para
  cada persona en cada espacio.

Falta desplegar la instancia como explica [actualizar.md](actualizar.md).

La **Fase 8** está **cerrada** (2026-10-07):
- el motor de automatizaciones, de proyecto y de espacio, por evento y por fecha;
- el stand-up programado a un chat;
- la hoja de SERVITEC de ida y vuelta;
- los importadores externos, solo documentados (ADR 070).

Ver su [plan por bloques](#fase-8--automatizaciones-hoja-de-servitec-y-stand-up-a-chat--cerrada).
La **Fase 9**, operación, está hecha (2026-10-11), en las PR apiladas #51 a #58. Ver su
[plan por bloques](#fase-9--operación).

**Lo que queda se hace en el PC**, en este orden:

1. **Fusionar las PR** y actualizar siguiendo [actualizar](actualizar.md). El paso de la IP y
   los puertos a `tailscale serve` va antes del primer `deploy/actualizar.sh`.
2. **En «Estado de la instancia»**, comprobar que la API te ve con tu IP de Tailscale y que ve
   las copias.
3. ~~**Montar la copia externa** en Google Drive.~~ **Aplazado (2026-10-12):** se hace al cerrar
   el [interludio de ideas de OpenProject](#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado),
   antes del Bloque B. Mientras tanto, las copias viven solo en el disco del PC.
4. **`sh deploy/simulacro.sh --humo`**: el criterio de la fase con la copia real (7.2).
5. **Unos días después, `sh scripts/ops/informe-bd.sh`**, y pasar el resultado para repasar
   los índices con el uso real (5.2).

Con eso se cierra el Bloque A. Después viene el
[interludio de ideas de OpenProject](#interludio--ideas-de-openproject-antes-de-la-fase-10--planificado),
planificado el 2026-10-12, y el Bloque B (CRM y ERP ligero) empieza en la Fase 10. Del
interludio está hecha la tanda 1 (2026-10-12); la siguiente es la tanda 2, planificación.

**Revisión de código del interludio (2026-10-03):** `/code-review` sobre los
seis bloques devolvió 14 hallazgos, comprobados uno a uno contra el código.
Los diez fallos están corregidos (PR #34), cada uno con una prueba que
fallaba antes del arreglo:
1. el cierre del día contaba un cronómetro en marcha solo hasta las 12:00;
2. un bloque de foco que se comprobaba tarde registraba hasta la
   comprobación, no hasta su hora;
3. las ausencias y la vista del responsable ignoraban el alcance de la
   clave de API;
4. el aviso del responsable y «Mi equipo» no se refrescaban sin recargar;
5. «Mi equipo» podía perder las hechas de quien tenía la tarea asignada y
   planificada;
6. una sesión de foco olvidada callaba el aviso de descanso;
7. el día planificado del detalle no se actualizaba al mover la tarea;
8. la Bandeja daba un 403 a quien ya la tenía y pasó a lector;
9. la captura rápida confundía «@constructor» y similares con un día;
10. el «ayer» del stand-up no saltaba festivos ni ausencias.

**Queda como deuda declarada:**
- ~~los festivos, las ausencias y el interruptor de responsable no publican
  eventos: los demás lo ven al volver a leer (ADR 060);~~ publican (punto 9 del cierre de la deuda);
- ~~el stand-up propio hace unas 25 consultas, cuando podría reutilizar las
  lecturas en lote de «Mi equipo»;~~ ahora son 7 (punto 10 del cierre de la deuda);
- ~~el normalizador de días del 0.2 recorre dos tablas enteras en cada
  arranque;~~ retirado (punto 2 del cierre de la deuda);
- ~~el formateador de `yyyy-mm-dd` está repetido unas ocho veces en la web, y
  el esquema de día en cinco routers de la API;~~ unificados (punto 8 del cierre de la deuda);
- ~~«Pasar al siguiente día laborable» del cierre aún no salta festivos ni
  ausencias.~~ Cerrado (punto 7 del cierre de la deuda).

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
- ~~**Faltan dos casos de humo:** el de la Fase 0 —login → proyecto → campo
  personalizado → dos subtareas → mover en tablero → filtrar y guardar vista →
  exportar— y el del asistente de importación de la Fase 5.~~ Escritos y en CI
  (punto 20 del cierre de la deuda).
- ~~**Sigue sin decidirse cuándo migrar Tablero, Lista y Backlog al motor de
  filtros.** Arrastra desde la Fase 4.~~ Migradas (punto 33 del cierre de la deuda).
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
