CREATE TABLE "personal_plan_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"planned_date" timestamp NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_plan_entry" ADD CONSTRAINT "personal_plan_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "personal_plan_entry" ADD CONSTRAINT "personal_plan_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "personal_plan_entry" ADD CONSTRAINT "personal_plan_entry_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_plan_entry_user_task" ON "personal_plan_entry" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE INDEX "personal_plan_entry_user_date_idx" ON "personal_plan_entry" USING btree ("user_id","planned_date");