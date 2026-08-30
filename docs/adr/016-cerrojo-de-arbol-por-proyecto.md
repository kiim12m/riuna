# ADR 016 — Cerrojo de árbol por proyecto

**Estado:** aceptada · **Fecha:** 2026-08-30

## Contexto

`parent_id` manda y `path`/`depth` son su forma materializada
([ADR 011](011-arbol-de-tareas-y-epicas.md)). Dos `CHECK` de la base vigilan que
cada fila sea coherente **consigo misma**: `path` acaba en su propio id y
`depth` cuadra con `path`. Ninguna vigila que el bosque lo sea.

Los cuatro escritores del árbol —crear, reparentar, borrar y mover de
proyecto— leían el estado, decidían, y escribían, con la lectura **fuera** de
su transacción. La auditoría de la Fase 4.5 encontró que eso deja pasar dos
cosas, y una se reprodujo de forma determinista:

- **Ciclo.** `PUT /task/A/parent {B}` y `PUT /task/B/parent {A}` a la vez.
  Ambas validan contra la foto anterior, ambas pasan `rejectReparent`, y como
  tocan filas distintas no compiten por ningún bloqueo: las dos confirman.
  Resultado: `A→B→A`, las dos `CHECK` satisfechas, ninguna con `parent_id`
  nulo. `treeScope=roots` las excluye y `buildTaskTree` no las encuentra, así
  que **las dos ramas desaparecen de la vista sin error**. Es exactamente el
  defecto que la ADR 011 cita como motivo para retirar la relación `subtask`,
  reintroducido bajo concurrencia.
- **Divergencia `path` ↔ `parent_id`.** Reparentar una hija mientras se mueve
  su ancestro: el `UPDATE ... WHERE path LIKE` se reevalúa contra la versión
  nueva y no casa nada, mientras que el `UPDATE ... WHERE id` sí. La tarea
  queda como raíz por `parent_id` y dentro de otra rama por `path`.

## Decisión

Un **`pg_advisory_xact_lock(1148, hashtext(project_id))`** al principio de la
transacción de los cuatro escritores, con las lecturas del árbol **dentro**.

1. **Un cerrojo por proyecto, no `FOR UPDATE` por fila.** Cuatro controladores
   con órdenes de bloqueo distintos son de donde salen los interbloqueos: `A`
   luego `B` en uno y `B` luego `A` en otro es el mismo entrelazado que produce
   el ciclo, convertido en un abrazo mortal. El cerrojo consultivo se toma
   siempre con la misma clave y en el mismo momento.
2. **Las lecturas van después.** Tomarlo y seguir usando una lectura anterior
   no sirve de nada: es el arreglo entero, no el cerrojo por sí solo.
3. **Las lecturas no se bloquean.** Solo compiten entre sí las escrituras de
   árbol del mismo proyecto, que son gestos humanos —arrastrar, sangrar,
   mover—, no tráfico.
4. **Un predicado de `path` redundante** en la segunda sentencia de
   `updateTaskParent`, que con el cerrojo no puede fallar. Está a propósito: si
   alguien añade un escritor de árbol que no lo tome, convierte una corrupción
   silenciosa en cero filas afectadas y un 409.

El 1148 es el espacio de nombres de este cerrojo. El 1524 es el de la
ordenación de proyectos (`createProject`, `reorderProjects`) y el 2051 el de
las migraciones de arranque.

## Consecuencia

El ciclo concurrente ya no ocurre, y hay una prueba de integración que lo
lanza en paralelo y comprueba que una de las dos peticiones pierde
(`tests/api-integration/task-tree-concurrency.test.ts`). Contra el código
anterior, **las dos devolvían 200**.

El coste es que dos personas reorganizando el mismo proyecto a la vez se
serializan. Con decenas de personas y varios departamentos —la escala que el
plan declara— eso no se nota; si algún día se notara, el siguiente paso es
acotar el cerrojo a la rama en vez de al proyecto, que es más fino y bastante
más difícil de razonar.

La segunda carrera —la divergencia `path` ↔ `parent_id`— **no se reprodujo de
forma determinista** en el banco de pruebas. El cerrojo la cierra por
construcción, pero conviene saber que ese caso está cerrado por razonamiento y
no por reproducción, al contrario que el ciclo.
