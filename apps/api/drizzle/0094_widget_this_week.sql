-- "Vencen esta semana" pasa a contar la semana natural —de mañana al final de
-- la semana de quien mira— en vez de los siete dias moviles de `week`, que
-- contaba tareas del martes que viene que "Mi semana" no ensenaba (ADR 093).
--
-- Escrita a mano: no hay cambio de esquema, solo datos. Solo toca las tarjetas
-- sembradas que siguen con su titulo: el editor no ofrece `dueWindow`, asi que
-- una tarjeta con otro nombre que pida `week` la ha montado alguien a
-- proposito y conserva la ventana movil.
UPDATE "dashboard_widget"
SET "config" = jsonb_set("config", '{dueWindow}', '"thisWeek"')
WHERE "type" = 'count'
  AND "config"->>'dueWindow' = 'week'
  AND "title" = 'Vencen esta semana';
