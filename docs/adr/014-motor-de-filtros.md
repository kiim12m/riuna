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

El motor existe y se ejecuta contra Postgres, pero **la interfaz todavía no lo
usa**: la vista Tabla sigue trayendo el proyecto entero y filtrando nada.
Conectar la UI, y con ella Tablero, Lista, Calendario y Gantt, es el grueso que
queda de la fase.

`GIN` **no acelera los rangos**, que es justo el ejemplo estrella del plan
(`Presupuesto > 1000`). Serviría un índice de expresión por campo, y se decide
cuando se sepa qué campos se filtran de verdad en vez de indexar a ciegas. El
presupuesto de rendimiento —50.000 tareas, `EXPLAIN`, < 300 ms p95— sigue sin
medirse.

La paginación sigue siendo por desplazamiento. El cursor que pide el plan llega
con la tabla `view`, que tampoco existe todavía: no se pueden guardar ni
compartir vistas.
