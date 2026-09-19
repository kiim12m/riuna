-- Fase 3: campos personalizados.
--
-- Generada por drizzle-kit y revisada a mano. Dos notas sobre instalaciones
-- que ya tienen datos:
--
-- 1. `custom_fields` entra NOT NULL con DEFAULT. Desde Postgres 11 eso no
--    reescribe la tabla —el valor por defecto se guarda en el catalogo y las
--    filas viejas lo resuelven al leerlas—, asi que anadirlo a una tabla con
--    tareas de verdad es instantaneo.
-- 2. El indice GIN se crea sin CONCURRENTLY porque el migrador corre dentro
--    de una transaccion y CONCURRENTLY no puede. Bloquea escrituras en `task`
--    mientras se construye; con el tamano de una instancia interna es un
--    parpadeo, pero conviene saberlo antes de lanzarlo sobre 50.000 tareas.

CREATE TABLE "field_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "field_definition_type_valid" CHECK ("field_definition"."type" IN ('text', 'number', 'currency', 'select', 'multi_select', 'date', 'checkbox', 'user', 'url', 'relation'))
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "field_definition_workspaceId_idx" ON "field_definition" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "field_definition_projectId_idx" ON "field_definition" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_definition_workspace_key_unique" ON "field_definition" USING btree ("workspace_id","key") WHERE project_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "field_definition_project_key_unique" ON "field_definition" USING btree ("project_id","key") WHERE project_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "task_custom_fields_idx" ON "task" USING gin ("custom_fields");