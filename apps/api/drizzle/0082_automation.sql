CREATE TABLE "automation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"task_id" text,
	"trigger_type" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurrence" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "automation_run_status_valid" CHECK ("automation_run"."status" IN ('ok', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "automation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"team_id" text,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paused_reason" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_automation_id_automation_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "automation_run_automation_started_idx" ON "automation_run" USING btree ("automation_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "automation_run_taskId_idx" ON "automation_run" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "automation_active_trigger_idx" ON "automation" USING btree ("workspace_id","trigger_type") WHERE "automation"."enabled" AND "automation"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "automation_workspaceId_idx" ON "automation" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "automation_projectId_idx" ON "automation" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "automation_teamId_idx" ON "automation" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "automation_createdBy_idx" ON "automation" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "automation_updatedBy_idx" ON "automation" USING btree ("updated_by");