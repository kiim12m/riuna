-- La importacion de Gitea numeraba con `max + 1` sin tocar el contador del
-- proyecto: el siguiente `last_task_number + 1` podia chocar con una tarea suya.
UPDATE "project" SET "last_task_number" = GREATEST("last_task_number", COALESCE((SELECT MAX("number") FROM "task" WHERE "task"."project_id" = "project"."id"), 0));--> statement-breakpoint
-- Lo que guardan lleva en claro el token de Gitea y el secreto del webhook.
DELETE FROM "integration" WHERE "type" IN ('github', 'gitea');--> statement-breakpoint
DROP TABLE "external_link" CASCADE;--> statement-breakpoint
DROP TABLE "github_integration" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_rule" CASCADE;
