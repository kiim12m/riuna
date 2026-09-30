CREATE TABLE "user_work_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"work_start_minute" smallint DEFAULT 540 NOT NULL,
	"work_end_minute" smallint DEFAULT 1020 NOT NULL,
	"lunch_enabled" boolean DEFAULT false NOT NULL,
	"lunch_start_minute" smallint,
	"lunch_end_minute" smallint,
	"work_days" smallint DEFAULT 62 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_work_schedule_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_work_schedule_minutes_valid" CHECK ("user_work_schedule"."work_start_minute" BETWEEN 0 AND 1439 AND "user_work_schedule"."work_end_minute" BETWEEN 1 AND 1440 AND "user_work_schedule"."work_end_minute" > "user_work_schedule"."work_start_minute"),
	CONSTRAINT "user_work_schedule_lunch_valid" CHECK (NOT "user_work_schedule"."lunch_enabled" OR (
        "user_work_schedule"."lunch_start_minute" IS NOT NULL AND "user_work_schedule"."lunch_end_minute" IS NOT NULL
        AND "user_work_schedule"."lunch_start_minute" BETWEEN 0 AND 1439
        AND "user_work_schedule"."lunch_end_minute" BETWEEN 1 AND 1440
        AND "user_work_schedule"."lunch_end_minute" > "user_work_schedule"."lunch_start_minute"
      )),
	CONSTRAINT "user_work_schedule_work_days_valid" CHECK ("user_work_schedule"."work_days" BETWEEN 0 AND 127)
);
--> statement-breakpoint
ALTER TABLE "user_work_schedule" ADD CONSTRAINT "user_work_schedule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;