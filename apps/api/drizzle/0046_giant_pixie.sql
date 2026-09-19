CREATE TABLE "task_assignee" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignee_unique" UNIQUE("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taskAssignee_taskId_idx" ON "task_assignee" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "taskAssignee_userId_idx" ON "task_assignee" USING btree ("user_id");--> statement-breakpoint
-- Relleno: el responsable actual de cada tarea pasa a ser tambien su primer
-- asignado, para que la tabla nueva sea la fuente completa desde el principio
-- y no haya que unirla con task.assignee_id al leer.
INSERT INTO "task_assignee" ("id", "task_id", "user_id", "created_at")
SELECT gen_random_uuid()::text, "id", "assignee_id", now()
FROM "task"
WHERE "assignee_id" IS NOT NULL
ON CONFLICT DO NOTHING;