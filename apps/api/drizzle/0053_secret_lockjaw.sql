-- Fase 6, rebanada 3: tareas recurrentes.
--
-- `template` y `cadence` van sin valor por defecto a proposito. Una plantilla
-- sin titulo o una cadencia sin frecuencia no son un estado inicial valido, son
-- una fila rota; y con `DEFAULT '{}'` la CHECK de la frecuencia no comprobaria
-- nada, porque `'{}'::jsonb->>'frequency'` es NULL y una CHECK **pasa** con
-- NULL. De ahi el `IS NOT NULL` explicito.
--
-- La tabla es nueva, asi que anadir columnas NOT NULL sin defecto no afecta a
-- ninguna instalacion con datos. `task.recurrence_id` si es nullable.
--
-- El indice de vencimiento es parcial (`WHERE active`): una recurrencia apagada
-- no la mira el planificador y no tiene por que ocupar el indice.

CREATE TABLE "task_recurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"created_by" text,
	"template" jsonb NOT NULL,
	"cadence" jsonb NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"ends_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_recurrence_frequency_valid" CHECK ("task_recurrence"."cadence"->>'frequency' IS NOT NULL AND "task_recurrence"."cadence"->>'frequency' IN ('daily', 'weekly', 'monthly'))
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "recurrence_id" text;--> statement-breakpoint
ALTER TABLE "task_recurrence" ADD CONSTRAINT "task_recurrence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_recurrence" ADD CONSTRAINT "task_recurrence_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_recurrence_projectId_idx" ON "task_recurrence" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_recurrence_due_idx" ON "task_recurrence" USING btree ("next_run_at") WHERE active;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_recurrence_id_task_recurrence_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."task_recurrence"("id") ON DELETE set null ON UPDATE cascade;