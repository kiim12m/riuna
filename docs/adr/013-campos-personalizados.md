# ADR 013 — Campos personalizados

**Estado:** aceptada · **Fecha:** 2026-08-28

## Contexto

`task` tiene un juego fijo de columnas. Todo lo que un departamento quiera
apuntar y no esté ahí —«Nº de expediente», «Presupuesto», «Cliente»— hoy es una
columna nueva, y con ella una migración, un validador, un formulario, una
traducción y una entrada de MCP. El presupuesto de complejidad de
[`AGENTS.md`](../../AGENTS.md) ya lo prohíbe —columna nueva solo si se filtra,
se ordena, se agrupa o es clave foránea— y remite a un `custom_fields` que
todavía no existía. Esta fase lo construye.

## Decisión

Dos piezas: `field_definition` es el catálogo y `task.custom_fields jsonb` son
los valores.

1. **JSONB en la propia fila, no una tabla de valores.** El tablero ya está
   leyendo esa fila: una tarea con ocho campos sigue siendo una consulta en vez
   de ocho filas que pivotar. Con el presupuesto de rendimiento firmado —50.000
   tareas, < 300 ms p95— esa diferencia es la decisión entera.
2. **Los campos de tipo relación se quedan fuera del JSONB** y apuntan a
   `task_relation`. Una clave foránea dentro de un blob JSON no tiene
   integridad referencial: se borra la tarea destino y queda un identificador
   colgando que nadie limpia.
3. **`key` separada de `name`, e inmutable.** `key` es la clave dentro del
   JSONB y se deriva del nombre una sola vez. Renombrar «Presupuesto» a
   «Presupuesto 2026» no puede huerfanar el valor guardado en miles de tareas.
   El tipo tampoco cambia después de crear el campo, por lo mismo.
4. **Dos alcances, proyecto y espacio de trabajo**, con dos índices únicos
   **parciales**. Un `unique(workspace_id, project_id, key)` dejaría repetir la
   clave entre los campos de espacio, porque en SQL dos `NULL` no son iguales;
   `NULLS NOT DISTINCT` lo arreglaría pero exige Postgres 15. Cuando los dos
   alcances declaran la misma clave gana el del proyecto, y ese desempate vive
   en el controlador porque los índices son por alcance.
5. **GIN con `jsonb_ops`.** Indexa claves además de valores, así que responde
   también a «¿esta tarea tiene el campo X?». **No acelera rangos**:
   `presupuesto > 1000` pide un índice de expresión por campo, que se decide en
   la Fase 4 cuando se sepa qué campos se filtran de verdad.
6. **Borrar arrastra los valores; archivar los conserva.** Sin definición, un
   valor es basura ilegible que sigue ocupando sitio en cada fila. Quien quiera
   conservarlos tiene el archivado.
7. **Permisos:** definir un campo de proyecto es `project:update`; uno de
   espacio, `workspace:manage_settings`, porque afecta a todos los proyectos a
   la vez. Rellenar un valor es editar la tarea, `task:update`. Como en `PATCH`
   y `DELETE` el alcance no está en la URL, el permiso sale de la fila.

## Consecuencia

El esquema deja de crecer con cada petición y una clase entera de encargos deja
de ser trabajo de desarrollo.

A cambio, **`project:update` solo lo tienen `admin` y `owner`**: un `member`
puede rellenar campos pero no definirlos, ni siquiera dentro de un proyecto. No
es una decisión de esta fase sino el vocabulario heredado de Kaneo, y es el
mismo descubrimiento que la Fase 1 hizo con `task:assign`. Queda documentado en
las pruebas. Si definir campos tiene que estar al alcance de cualquier miembro,
se decide cambiando `packages/permissions`. Hoy ningún rol integrado separa
`project:update` de `workspace:manage_settings` —`admin` tiene los dos y
`member` ninguno—, así que el middleware que elige por fila solo se distingue
con un rol personalizado, que es como está probado.

Los agregados del árbol **no suben** los campos numéricos por la rama: sumar un
«Presupuesto» de todo el subárbol es una petición previsible y no está en esta
fase. La importación y exportación tampoco los conocen todavía: es Fase 5, que
además creará definiciones automáticamente al importar y por eso necesita que
la creación siga siendo una llamada normal de la API.
