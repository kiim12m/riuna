CREATE TABLE "schedule_block" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"planned_date" timestamp,
	"cadence" jsonb,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_block_kind_valid" CHECK ("schedule_block"."kind" IN ('fixed', 'break')),
	CONSTRAINT "schedule_block_minutes_valid" CHECK ("schedule_block"."start_minute" BETWEEN 0 AND 1439 AND "schedule_block"."end_minute" BETWEEN 1 AND 1440 AND "schedule_block"."end_minute" > "schedule_block"."start_minute"),
	CONSTRAINT "schedule_block_date_xor_cadence" CHECK (("schedule_block"."planned_date" IS NOT NULL) != ("schedule_block"."cadence" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "personal_plan_entry" ADD COLUMN "start_minute" smallint;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "schedule_block" ADD CONSTRAINT "schedule_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "schedule_block_user_date_idx" ON "schedule_block" USING btree ("user_id","planned_date");--> statement-breakpoint
ALTER TABLE "personal_plan_entry" ADD CONSTRAINT "personal_plan_entry_start_minute_valid" CHECK ("personal_plan_entry"."start_minute" IS NULL OR "personal_plan_entry"."start_minute" BETWEEN 0 AND 1439);