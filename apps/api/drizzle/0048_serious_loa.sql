-- Fase 2: arbol de tareas y epicas.
--
-- La parte generada por drizzle-kit se ha reordenado a mano porque `path` es
-- NOT NULL y las dos CHECK que lo vigilan no pueden existir antes de que haya
-- algo que comprobar: primero se anaden las columnas, luego se convierten las
-- relaciones `subtask` en punteros de padre, luego se calculan los caminos, y
-- solo al final se cierran las restricciones.

CREATE TABLE "epic" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "task_epic" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"epic_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_epic_unique" UNIQUE("task_id","epic_id")
);
--> statement-breakpoint
ALTER TABLE "epic" ADD CONSTRAINT "epic_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_epic" ADD CONSTRAINT "task_epic_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_epic" ADD CONSTRAINT "task_epic_epic_id_epic_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epic"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "epic_projectId_idx" ON "epic" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "epic_projectId_position_idx" ON "epic" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "task_epic_taskId_idx" ON "task_epic" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_epic_epicId_idx" ON "task_epic" USING btree ("epic_id");--> statement-breakpoint

ALTER TABLE "project" ADD COLUMN "cascade_close" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cascade_archive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "max_task_depth" integer DEFAULT 5 NOT NULL;--> statement-breakpoint

ALTER TABLE "task" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "estimate" integer;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_id_task_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_parentId_idx" ON "task" USING btree ("parent_id");--> statement-breakpoint

-- Conversion de las relaciones `subtask` en punteros de padre.
--
-- Solo se convierten las que quedan dentro de un mismo proyecto: el arbol vive
-- dentro del proyecto (ADR 011). Y solo una por hija: la relacion permitia que
-- una tarea tuviera dos padres y un arbol no, asi que gana la mas antigua.
UPDATE "task" SET "parent_id" = ranked."parent_id"
FROM (
	SELECT
		r."target_task_id" AS child_id,
		r."source_task_id" AS parent_id,
		ROW_NUMBER() OVER (
			PARTITION BY r."target_task_id"
			ORDER BY r."created_at" ASC, r."id" ASC
		) AS rn
	FROM "task_relation" r
	JOIN "task" child ON child."id" = r."target_task_id"
	JOIN "task" parent ON parent."id" = r."source_task_id"
	WHERE r."relation_type" = 'subtask'
	  AND child."project_id" = parent."project_id"
	  AND child."id" <> parent."id"
) AS ranked
WHERE ranked.rn = 1 AND "task"."id" = ranked.child_id;--> statement-breakpoint

-- Un ciclo entre relaciones era posible (A subtarea de B y B subtarea de A);
-- un arbol no lo admite. Se desengancha todo nodo que pueda alcanzarse a si
-- mismo, que rompe el ciclo dejando esas tareas como raices.
UPDATE "task" SET "parent_id" = NULL
WHERE "id" IN (
	WITH RECURSIVE walk(start_id, node_id, hops) AS (
		SELECT t."id", t."parent_id", 1
		FROM "task" t
		WHERE t."parent_id" IS NOT NULL
		UNION ALL
		SELECT w.start_id, t."parent_id", w.hops + 1
		FROM walk w
		JOIN "task" t ON t."id" = w.node_id
		WHERE t."parent_id" IS NOT NULL AND w.hops < 64
	)
	SELECT DISTINCT start_id FROM walk WHERE node_id = start_id
);--> statement-breakpoint

-- Camino y profundidad de cada tarea, de las raices hacia abajo.
UPDATE "task" SET "path" = tree.path, "depth" = tree.depth
FROM (
	WITH RECURSIVE tree(id, path, depth) AS (
		SELECT t."id", '/' || t."id" || '/', 0
		FROM "task" t
		WHERE t."parent_id" IS NULL
		UNION ALL
		SELECT c."id", tree.path || c."id" || '/', tree.depth + 1
		FROM "task" c
		JOIN tree ON c."parent_id" = tree.id
	)
	SELECT id, path, depth FROM tree
) AS tree
WHERE "task"."id" = tree.id;--> statement-breakpoint

-- Las relaciones que si se convirtieron desaparecen: ya estan dichas en el
-- arbol y repetirlas seria tener dos verdades.
DELETE FROM "task_relation" r
USING "task" child
WHERE r."relation_type" = 'subtask'
  AND child."id" = r."target_task_id"
  AND child."parent_id" = r."source_task_id";--> statement-breakpoint

-- Las que no se convirtieron —entre proyectos, segundo padre, o parte de un
-- ciclo— no se tiran: bajan a `related`, que conserva el vinculo sin afirmar
-- una jerarquia. Antes se quitan las que ya tenian un `related` equivalente,
-- para no dejar la pareja duplicada.
DELETE FROM "task_relation" r
WHERE r."relation_type" = 'subtask'
  AND EXISTS (
	SELECT 1 FROM "task_relation" o
	WHERE o."relation_type" = 'related'
	  AND (
		(o."source_task_id" = r."source_task_id" AND o."target_task_id" = r."target_task_id")
		OR (o."source_task_id" = r."target_task_id" AND o."target_task_id" = r."source_task_id")
	  )
  );--> statement-breakpoint
UPDATE "task_relation" SET "relation_type" = 'related' WHERE "relation_type" = 'subtask';--> statement-breakpoint

ALTER TABLE "task" ALTER COLUMN "path" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "task_path_idx" ON "task" USING btree ("path" text_pattern_ops);--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_path_ends_with_id" CHECK ("task"."path" LIKE '%/' || "task"."id" || '/');--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_depth_matches_path" CHECK ("task"."depth" = length("task"."path") - length(replace("task"."path", '/', '')) - 2);
