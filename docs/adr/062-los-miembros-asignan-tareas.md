# ADR 062 — Los miembros pueden asignar tareas

**Fecha:** 2026-10-03 · **Estado:** aceptada

**Contexto.** El rol `member` heredado de Kaneo tenía
`task: ["create", "read", "update"]`: podía crear y editar tareas, pero no
repartirlas, ni a una persona ni a un departamento. La Fase 1 lo encontró al
escribir las pruebas de integración y lo dejó documentado como hallazgo. Riuna
existe para repartir trabajo entre departamentos, y en una instancia de decenas
de personas sin permisos finos eso es trabajo de cualquiera, no de un
administrador.

**Decisión.**

- **`member` gana `task:assign`** en `packages/permissions`. Definir campos
  personalizados **no** cambia: sigue pidiendo `project:update`, que solo tienen
  `admin` y `owner`, porque define la estructura del proyecto y no su día a día.
- **Una migración de datos (0078) lo lleva a los espacios que ya existen.** Los
  roles por defecto viven como filas de `workspace_role` y la fila manda sobre
  la definición compilada, así que cambiar el paquete solo alcanza a los espacios
  nuevos. La migración añade `assign` **solo** a las filas `member` que conservan
  el reparto con el que se sembraron; un administrador que ya lo había editado en
  la pantalla de roles lo conserva tal cual. Compara texto y no JSON para no
  fallar con una fila mal formada, que la API tolera.

**Consecuencias.**

- **Un administrador que dejó el reparto por defecto sin tocar no puede
  distinguirse de uno que lo escribió igual a propósito**: el rol queda con
  `assign`. Si hace falta quitarlo, se hace desde la pantalla de roles.
- **Las pruebas que fijaban el 403 del miembro cambian de sujeto.** El `viewer`
  conserva la prueba de «quien no puede repartir». La puerta de `task:assign`
  dentro de una actualización completa y de la edición en bloque se vigila ahora
  con un rol propio que edita pero no reparte, porque con `viewer` fallaría antes,
  en `task:update`.
- **El paquete `@riuna/permissions` se consume desde `dist`**: tras cambiar el
  rol hay que reconstruirlo (`pnpm --filter @riuna/permissions build`) antes de
  ejecutar las pruebas de la API.
