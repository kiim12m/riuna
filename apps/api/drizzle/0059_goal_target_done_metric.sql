-- Los resultados clave dejan de admitir `count` y `doneRatio` (ADR 032).
--
-- Escrita a mano: no hay cambio de esquema, solo datos. El periodo de un
-- objetivo es una ventana de cierre, asi que las dos metricas ya median lo mismo
-- que `doneCount`: pasarlas a `doneCount` no cambia la cifra que nadie estuviera
-- viendo, y deja la fila dentro de lo que la API vuelve a aceptar al editarla.
UPDATE "goal_target"
SET "config" = jsonb_set("config", '{metric}', '"doneCount"')
WHERE "config"->>'metric' IN ('count', 'doneRatio');
