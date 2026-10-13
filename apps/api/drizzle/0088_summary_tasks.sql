ALTER TABLE "project" ADD COLUMN "weighted_progress" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "auto_dates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Los padres sin fechas propias pasan a fechas automaticas (ADR 083): hoy ya
-- ensenan las de sus hijas como «heredadas».
UPDATE "task" AS p SET "auto_dates" = true
WHERE p."start_date" IS NULL
  AND p."due_date" IS NULL
  AND EXISTS (SELECT 1 FROM "task" c WHERE c."parent_id" = p."id");--> statement-breakpoint
-- Y toman las de su rama: el inicio mas temprano y el fin mas tardio de sus
-- descendientes no archivados. Los ancestros de una tarea son los segmentos
-- de su propio path, asi que se cruza por igualdad de ids, nunca por prefijo.
UPDATE "task" AS p
SET "start_date" = span.start_date, "due_date" = span.due_date
FROM (
  SELECT
    ancestor.id AS id,
    MIN(COALESCE(d."start_date", d."due_date")) AS start_date,
    MAX(COALESCE(d."due_date", d."start_date")) AS due_date
  FROM "task" d
  CROSS JOIN LATERAL unnest(
    string_to_array(trim(both '/' from d."path"), '/')
  ) AS ancestor(id)
  WHERE d."id" <> ancestor.id AND d."status" <> 'archived'
  GROUP BY ancestor.id
) AS span
WHERE p."id" = span.id AND p."auto_dates" = true;
