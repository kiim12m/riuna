-- Fase 4: vistas guardadas.
--
-- Tabla nueva y nada mas: no toca ninguna existente, asi que aplicarla a una
-- instalacion con datos es instantaneo y no bloquea nada.
--
-- `created_by` cascadea al borrar la cuenta: una vista sin dueno no la puede
-- editar nadie, y conservarla solo dejaria basura compartida que nadie
-- reclama.

CREATE TABLE "view" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'table' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "view_type_valid" CHECK ("view"."type" IN ('table', 'board', 'list', 'calendar', 'gantt'))
);
--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "view" ADD CONSTRAINT "view_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "view_workspaceId_idx" ON "view" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "view_projectId_idx" ON "view" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "view_createdBy_idx" ON "view" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "view_workspace_shared_idx" ON "view" USING btree ("workspace_id","is_shared");