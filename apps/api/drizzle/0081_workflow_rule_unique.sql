-- Completada a mano sobre lo que genero drizzle-kit: el indice unico no se
-- puede crear sin limpiar antes los duplicados que ya existan. `workflow_rule`
-- no tenia unicidad y su upsert leia y luego escribia, asi que dos guardados
-- simultaneos del mismo evento dejaban dos filas, y `resolveTargetStatus` se
-- quedaba con una cualquiera.
--
-- Mismo procedimiento que la 0051 con `external_link`: borrar conservando una
-- fila y despues imponer la restriccion. Se conserva la que se guardo la
-- ultima, que es la que la persona eligio por ultima vez; `ctid` solo desempata.

DELETE FROM "workflow_rule" a
USING "workflow_rule" b
WHERE a.project_id = b.project_id
  AND a.integration_type = b.integration_type
  AND a.event_type = b.event_type
  AND (a.updated_at, a.ctid) < (b.updated_at, b.ctid);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_rule_project_integration_event_unique" ON "workflow_rule" USING btree ("project_id","integration_type","event_type");
