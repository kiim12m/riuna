-- El rol `member` pasa a poder asignar tareas (`task:assign`), cierre de la
-- deuda de la Fase 1: un miembro podia crear y editar tareas pero no
-- repartirlas, ni a una persona ni a un departamento.
--
-- Los roles por defecto viven como filas de `workspace_role` y la fila manda
-- sobre la definicion compilada, asi que cambiar `packages/permissions` solo
-- alcanza a los espacios nuevos. Aqui se actualizan los existentes, y solo los
-- que conservan el reparto de `task` con el que se sembraron: un admin que ya
-- lo haya editado en la pantalla de roles lo conserva. La comparacion es de
-- texto -`JSON.stringify` no deja espacios- para no fallar con una fila cuyo
-- JSON este mal formado, que la API tolera.
UPDATE "workspace_role"
SET "permission" = replace(
  "permission",
  '"task":["create","read","update"]',
  '"task":["create","read","update","assign"]'
)
WHERE "role" = 'member'
  AND position('"task":["create","read","update"]' in "permission") > 0;
