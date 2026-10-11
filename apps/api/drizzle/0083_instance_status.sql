CREATE TABLE "instance_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"message" text NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "job_status" (
	"job" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp NOT NULL,
	"last_finished_at" timestamp NOT NULL,
	"last_status" text NOT NULL,
	"last_duration_ms" integer NOT NULL,
	"last_success_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "instance_alert_one_open_per_key" ON "instance_alert" USING btree ("key") WHERE resolved_at IS NULL;