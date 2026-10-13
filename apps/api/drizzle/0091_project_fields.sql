ALTER TABLE "view" DROP CONSTRAINT "view_type_valid";--> statement-breakpoint
DROP INDEX "field_definition_workspace_key_unique";--> statement-breakpoint
ALTER TABLE "field_definition" ADD COLUMN "entity" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "field_definition_workspace_key_unique" ON "field_definition" USING btree ("workspace_id","entity","key") WHERE project_id IS NULL;--> statement-breakpoint
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_entity_valid" CHECK ("field_definition"."entity" = 'task' OR ("field_definition"."entity" = 'project' AND "field_definition"."project_id" IS NULL));--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_type_valid" CHECK ("view"."type" IN ('table', 'board', 'list', 'calendar', 'gantt', 'portfolio'));