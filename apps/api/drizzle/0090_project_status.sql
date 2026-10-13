CREATE TABLE "project_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"user_id" text,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "health" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "health_note" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "start_date" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "lead_user_id" text;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_activity_project_created_idx" ON "project_activity" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_health_valid" CHECK ("project"."health" IN ('not_started', 'on_track', 'at_risk', 'off_track', 'finished', 'cancelled'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_dates_ordered" CHECK ("project"."end_date" IS NULL OR "project"."start_date" IS NULL OR "project"."end_date" >= "project"."start_date");