CREATE TABLE "external_ref" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_ref_entity_type_valid" CHECK ("external_ref"."entity_type" IN ('task', 'epic', 'field_definition'))
);
--> statement-breakpoint
ALTER TABLE "external_ref" ADD CONSTRAINT "external_ref_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "external_ref_source_entity_external_unique" ON "external_ref" USING btree ("workspace_id","source","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "external_ref_entity_idx" ON "external_ref" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "external_ref_workspaceId_idx" ON "external_ref" USING btree ("workspace_id");--> statement-breakpoint
-- Reordenada a mano sobre lo que genero drizzle-kit, por un motivo:
-- el indice unico de `external_link` no se puede crear sin limpiar antes los
-- duplicados que ya existan. La tabla lleva desde la 0009 sin unicidad y sus
-- once puntos de escritura hacen leer-y-luego-escribir, asi que una
-- instalacion con un webhook concurrente a una importacion los tiene.
--
-- Es el mismo procedimiento que `0020_gitea_dedup_guards.sql` aplico a
-- `activity` y `label`: borrar por `ctid` conservando una fila, y despues
-- imponer la restriccion.
--
-- Se conserva la fila mas reciente (`ctid` mayor), que es la que las
-- importaciones posteriores han estado actualizando.

DELETE FROM "external_link" a
USING "external_link" b
WHERE a.ctid < b.ctid
  AND a.integration_id = b.integration_id
  AND a.resource_type = b.resource_type
  AND a.external_id = b.external_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "external_link_integration_resource_external_unique" ON "external_link" USING btree ("integration_id","resource_type","external_id");