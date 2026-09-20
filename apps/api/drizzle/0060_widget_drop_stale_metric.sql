-- Los paneles de tipo `count` y `breakdown` dejan de admitir `sumLogged`: esa
-- metrica solo tiene sentido en la tendencia, y el resto la ignoraba.
--
-- Escrita a mano: no hay cambio de esquema, solo datos. Las filas guardadas
-- antes de la validacion devolvian un error por tarjeta; quitarles la metrica
-- las deja contando tareas, que es lo que ya hacian de hecho, y conservan tipo,
-- agrupacion y titulo.
UPDATE "dashboard_widget"
SET "config" = "config" - 'metric'
WHERE "type" IN ('count', 'breakdown') AND "config"->>'metric' = 'sumLogged';
