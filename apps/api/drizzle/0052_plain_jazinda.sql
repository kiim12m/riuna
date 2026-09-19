-- Fase 6, rebanada 2: ciclos (sprints).
--
-- Tres cosas, en este orden y no en otro:
--   1. La tabla `cycle` y las dos columnas que `task` necesita.
--   2. El relleno de `completed_at` a partir de la actividad, ANTES de crear el
--      disparador, para que el relleno no compita con el.
--   3. El disparador que mantiene `completed_at` de aqui en adelante.
--
-- `completed_at` lo lleva la base de datos y no la aplicacion porque hay cinco
-- escritores de `status` en el dominio de tareas (update-task, update-task-status,
-- move-task, cascade-status, bulk-update-tasks) mas la importacion, los webhooks
-- de GitHub/Gitea y MCP. La Fase 4.5 ya encontro cuatro caminos que escribian
-- `assignee_id` sin tocar `task_assignee`; esto es lo mismo con nueve. Ver ADR 025.

CREATE TABLE "cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_status_valid" CHECK ("cycle"."status" IN ('planned', 'active', 'closed')),
	CONSTRAINT "cycle_dates_ordered" CHECK ("cycle"."end_date" >= "cycle"."start_date")
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "cycle_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "cycle_projectId_idx" ON "cycle" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cycle_projectId_startDate_idx" ON "cycle" USING btree ("project_id","start_date");--> statement-breakpoint
-- Un solo ciclo activo por proyecto. Indice parcial y no comprobacion en el
-- controlador: dos peticiones de "activar" a la vez pasarian las dos la
-- comprobacion previa, igual que los dos reparentados concurrentes de la
-- Fase 4.5 creaban un ciclo con las dos CHECK satisfechas.
CREATE UNIQUE INDEX "cycle_one_active_per_project" ON "cycle" USING btree ("project_id") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_cycleId_idx" ON "task" USING btree ("cycle_id");--> statement-breakpoint

-- Relleno de `completed_at` para las tareas que YA estan en una columna final.
--
-- La fecha buena sale de la actividad: la ultima transicion registrada hacia un
-- estado final del proyecto. Cuando no hay ninguna —una tarea creada
-- directamente en la columna final, o anterior al registro de actividad— se
-- recurre a `updated_at`, que es una aproximacion y esta declarada como tal.
--
-- Sin este relleno quedaria una fila terminada con `completed_at` nulo, y
-- cualquiera leeria eso como "no esta hecha", que es exactamente la
-- contradiccion que hay que evitar: la columna dice SI esta hecha, y esta
-- columna solo dice CUANDO.
WITH final_status AS (
	SELECT c."project_id", c."slug"
	FROM "column" c
	WHERE c."is_final"
	UNION ALL
	-- Respaldo heredado de Kaneo: un proyecto sin ninguna columna marcada como
	-- final sigue dando por terminado el slug `done`. Es la misma regla que
	-- `getFinalStatuses` aplica al leer.
	SELECT p."id", 'done'
	FROM "project" p
	WHERE NOT EXISTS (
		SELECT 1 FROM "column" c2 WHERE c2."project_id" = p."id" AND c2."is_final"
	)
),
done_tasks AS (
	SELECT t."id", t."updated_at"
	FROM "task" t
	JOIN final_status f ON f."project_id" = t."project_id" AND f."slug" = t."status"
),
last_completion AS (
	SELECT a."task_id", max(a."created_at") AS "at"
	FROM "activity" a
	JOIN "task" t ON t."id" = a."task_id"
	JOIN final_status f ON f."project_id" = t."project_id"
	                   AND f."slug" = a."event_data"->>'newStatus'
	WHERE a."type" = 'status_changed'
	GROUP BY a."task_id"
)
UPDATE "task" t
SET "completed_at" = COALESCE(lc."at", d."updated_at")
FROM done_tasks d
LEFT JOIN last_completion lc ON lc."task_id" = d."id"
WHERE t."id" = d."id";--> statement-breakpoint

-- El disparador. Solo trabaja cuando `status` o `project_id` cambian de verdad,
-- asi que un arrastre dentro de la misma columna o una edicion de titulo no
-- pagan la consulta.
CREATE OR REPLACE FUNCTION "task_set_completed_at"() RETURNS trigger AS $$
DECLARE
	"final" boolean;
BEGIN
	IF TG_OP = 'UPDATE'
		AND NEW."status" IS NOT DISTINCT FROM OLD."status"
		AND NEW."project_id" IS NOT DISTINCT FROM OLD."project_id" THEN
		RETURN NEW;
	END IF;

	SELECT
		EXISTS (
			SELECT 1 FROM "column" c
			WHERE c."project_id" = NEW."project_id"
			  AND c."slug" = NEW."status"
			  AND c."is_final"
		)
		OR (
			NEW."status" = 'done'
			AND NOT EXISTS (
				SELECT 1 FROM "column" c
				WHERE c."project_id" = NEW."project_id" AND c."is_final"
			)
		)
	INTO "final";

	IF "final" THEN
		-- Si quien escribe trae una fecha, se respeta: el disparador manda sobre
		-- el *si*, no sobre el *cuando*. Es lo que deja que la importacion
		-- restaure una fecha real en vez de estampar la de hoy.
		IF NEW."completed_at" IS NULL THEN
			NEW."completed_at" := now();
		END IF;
	ELSE
		NEW."completed_at" := NULL;
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "task_completed_at"
BEFORE INSERT OR UPDATE ON "task"
FOR EACH ROW EXECUTE FUNCTION "task_set_completed_at"();
