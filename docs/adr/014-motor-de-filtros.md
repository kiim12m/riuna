# ADR 014 — Motor de filtros y vista Tabla

**Estado:** aceptada · **Fecha:** 2026-08-28

## Contexto

Hasta ahora cada vista filtraba por su cuenta **en el navegador**:
`use-task-filters` recibe las tareas ya cargadas y las descarta en memoria. Por
eso Calendario y Gantt nunca filtraron —no había motor al que engancharlos— y
por eso el plan describe la Fase 4 como «conectar las vistas que ya existen»
cuando en realidad hay que mover el filtrado al servidor. Filtrar en memoria
además rompe la paginación: una página filtrada después de traerse devuelve
menos filas de las que dice.

## Decisión

Un **registro de descriptores** más un **traductor único** a SQL de Drizzle.

1. **El registro es la lista blanca.** Un nombre de campo que no esté en él no
   llega nunca a la consulta. Es la única defensa contra inyección por nombre
   de campo, y tiene su prueba.
2. **Los campos personalizados viven bajo `custom.<key>`.** El prefijo impide
   que un campo llamado «status» tape al de verdad.
3. **El casteo numérico va envuelto en `jsonb_typeof`.** Sin la guarda,
   `(custom_fields->>'k')::numeric` revienta **la consulta entera** en cuanto
   una sola fila guarde ahí un texto — y eso pasará al cambiar una definición o
   al importar en la Fase 5. Con ella, esas filas simplemente no casan, que es
   lo que un filtro debe hacer. Comprobado retirándola: el caso falla.
4. **`neq` y `notIn` incluyen las filas nulas.** «Prioridad distinta de alta»
   tiene que devolver también las que no tienen prioridad; `<>` a secas las
   deja fuera y sorprende a todo el mundo.
5. **Las etiquetas se filtran por nombre, no por id.** `label` no es una tabla
   de unión: cada tarea tiene sus propias filas y sus ids no significan nada
   entre tareas. Lo estable es el nombre, que es lo que fija
   `unique(task_id, name)`.
6. **El filtro viaja como JSON en la URL**, no en el cuerpo. Una vista guardada
   acaba siendo un enlace; con un `POST` dejaría de serlo.
7. **Convive con los filtros heredados** en vez de sustituirlos: se combinan
   con `AND`, así que un filtro nuevo nunca puede ensanchar uno viejo mientras
   se migran las vistas una a una.
8. **TanStack Table v9 para la vista Tabla** — la única dependencia externa que
   el plan aprueba, por sus sub-filas nativas. Ojo: en la v9 `state.expanded`
   **no** siembra el átomo que lee `getIsExpanded`; hay que usar
   `initialState`. Con `state` el árbol no se despliega nunca, y ni el
   typecheck ni las pruebas lo detectan.

## Consecuencia

*(Escrita a mitad de la Fase 4. La vista Tabla, el Calendario y el Gantt se
conectaron después; Tablero, Lista y Backlog siguen filtrando en el cliente.)*

El motor existe y se ejecuta contra Postgres, pero **la interfaz todavía no lo
usa**: la vista Tabla sigue trayendo el proyecto entero y filtrando nada.
Conectar la UI, y con ella Tablero, Lista, Calendario y Gantt, es el grueso que
queda de la fase.

**Corrección de la Fase 4.5.** Tres afirmaciones de esta ADR resultaron
incompletas al medirlas:

- El punto 3 —el `CASE` con `jsonb_typeof`— es correcto y necesario, pero tiene
  un coste que no estaba escrito: **impide que un índice de expresión llegue a
  usarse**, porque Postgres empareja índices de expresión por igualdad
  estructural y `CASE WHEN ... THEN (...)::numeric END` no es `(...)::numeric`.
  Quien intente cerrar la deuda de «GIN no acelera los rangos» creando el índice
  obvio verá que `EXPLAIN` sigue mostrando un barrido, sin causa visible.
- Las fechas de campo personalizado **no se comparaban bien**: la expresión era
  texto y el valor viajaba como `Date`, que node-postgres serializa como
  instante en la hora local del servidor. `eq` no casaba nunca y `neq` casaba
  siempre. Arreglado normalizando a `YYYY-MM-DD` en el camino JSONB.
- El alcance «con subtareas» era un `EXISTS` correlacionado dentro de un `OR`,
  que Postgres no convierte en semi-join: **28 segundos** con 10.000 tareas.
  Reescrito uniendo por los segmentos del `path` en vez de por prefijo: 41 ms.

`GIN` **no acelera los rangos**, que es justo el ejemplo estrella del plan
(`Presupuesto > 1000`). Serviría un índice de expresión por campo, y se decide
cuando se sepa qué campos se filtran de verdad en vez de indexar a ciegas. El
presupuesto de rendimiento —50.000 tareas, `EXPLAIN`, < 300 ms p95— sigue sin
medirse.

La paginación sigue siendo por desplazamiento. El cursor que pide el plan llega
con la tabla `view`, que tampoco existe todavía: no se pueden guardar ni
compartir vistas.

**Una fecha suelta sobre una columna `timestamp` es un día (2026-10-03).**
`dueDate eq 2026-10-05` comparaba el instante `2026-10-05T00:00Z`, y el
vencimiento que elige el navegador es la medianoche de Madrid, así que no casaba
con nada. Si el valor es un `yyyy-mm-dd` —lo que manda `<input type="date">`— el
traductor lo lee como el día de la zona de la API ([ADR 049](049-la-api-vive-en-madrid.md)):
`eq` es `[inicio, fin)` de ese día, `gt` es desde el día siguiente, `lte` hasta el
final del día, y así el resto. Un instante completo (`…T22:00:00Z`) sigue siendo un
instante, y un día inexistente (`2026-13-45`) es un 400 y no se desborda al año
siguiente. Las fechas de campos personalizados ya eran un día (texto `YYYY-MM-DD`).

