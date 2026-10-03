-- Interludio de productividad, sub-bloque 0.5 (ADR 050): el recordatorio de
-- vencimiento pasa a ser por asignado, y se rearma solo al cambiar la fecha.
--
-- Escrita a mano: no hay cambio de esquema que generar, solo datos y un
-- disparador.
--
-- 1. El registro de "ya avisado" llevaba solo el tipo -`configured_before` u
--    `overdue`- porque solo se avisaba al responsable principal. Ahora avisa a
--    cada persona de `task_assignee`, asi que el tipo lleva tambien a quien:
--    `configured_before:<userId>`, el mismo patron que `generic_webhook:<id>`
--    ya usaba para los webhooks de proyecto. Las filas existentes eran todas
--    del responsable principal: se le atribuyen a el. Las de tareas sin
--    responsable no avisaron a nadie y se quitan.
UPDATE "task_reminder_sent" AS "sent"
SET "reminder_type" = "sent"."reminder_type" || ':' || "task"."assignee_id"
FROM "task"
WHERE "sent"."task_id" = "task"."id"
  AND "sent"."reminder_type" IN ('configured_before', 'overdue')
  AND "task"."assignee_id" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "task_reminder_sent"
WHERE "reminder_type" IN ('configured_before', 'overdue');
--> statement-breakpoint
-- 2. Cambiar el vencimiento tiene que volver a avisar. Solo lo hacia
--    `update-task-due-date.ts`; el `PUT` completo de la tarea, la edicion en
--    bloque, la importacion, MCP y los webhooks cambian la fecha sin pasar
--    por ahi. Es la misma razon que la ADR 025 dio para `completed_at`:
--    muchos escritores, una sola regla en la base. Se borran todos los avisos
--    de la tarea -tambien los de webhook-, como ya hacia el controlador.
CREATE OR REPLACE FUNCTION "task_rearm_due_reminders"() RETURNS trigger AS $$
BEGIN
	DELETE FROM "task_reminder_sent" WHERE "task_id" = NEW."id";
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "task_rearm_due_reminders" ON "task";
--> statement-breakpoint
CREATE TRIGGER "task_rearm_due_reminders"
AFTER UPDATE OF "due_date" ON "task"
FOR EACH ROW
WHEN (OLD."due_date" IS DISTINCT FROM NEW."due_date")
EXECUTE FUNCTION "task_rearm_due_reminders"();
