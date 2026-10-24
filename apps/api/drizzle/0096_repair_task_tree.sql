-- Auditoria 1.2. El borrado en lote dejaba que la FK pusiera `parent_id` a NULL
-- en las hijas sin tocar su `path` ni su `depth`, ni los de su rama. Se
-- recalculan los dos desde `parent_id`, que es el que manda, y solo se
-- escriben las filas que no coinciden: en una base sana no cambia nada.
WITH RECURSIVE "tree" AS (
	SELECT "id", '/' || "id" || '/' AS "path", 0 AS "depth"
	FROM "task"
	WHERE "parent_id" IS NULL
	UNION ALL
	SELECT "child"."id", "tree"."path" || "child"."id" || '/', "tree"."depth" + 1
	FROM "task" AS "child"
	INNER JOIN "tree" ON "child"."parent_id" = "tree"."id"
)
UPDATE "task"
SET "path" = "tree"."path", "depth" = "tree"."depth"
FROM "tree"
WHERE "task"."id" = "tree"."id"
	AND ("task"."path" IS DISTINCT FROM "tree"."path" OR "task"."depth" IS DISTINCT FROM "tree"."depth");
