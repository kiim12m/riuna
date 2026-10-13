ALTER TABLE "project" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_parent_id_project_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_parent_id_idx" ON "project" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_not_own_parent" CHECK ("project"."parent_id" <> "project"."id");