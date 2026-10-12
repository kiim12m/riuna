CREATE TABLE "task_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"remind_at" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_reminder_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_reminder" ADD CONSTRAINT "task_reminder_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminder" ADD CONSTRAINT "task_reminder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taskReminder_remindAt_idx" ON "task_reminder" USING btree ("remind_at");