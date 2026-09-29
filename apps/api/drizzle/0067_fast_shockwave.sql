-- Un cronometro por persona (ADR 044). Antes de imponer el indice unico hay
-- que cerrar las entradas abiertas duplicadas que ya pueda haber en una
-- instalacion existente: cada una se cierra en el `start_time` de la
-- siguiente entrada abierta del mismo usuario, que es lo que habria hecho la
-- regla nueva si hubiera estado activa desde siempre. La ultima entrada
-- abierta de cada persona se deja tal cual -sigue "en marcha".
--
-- Escrita a mano: el `CREATE UNIQUE INDEX` es lo unico que genera el
-- esquema; el `UPDATE` previo es una migracion de datos, mismo caso que la
-- 0059 y la 0066.
WITH "ranked_open_entries" AS (
  SELECT
    "id",
    "user_id",
    LEAD("start_time") OVER (
      PARTITION BY "user_id"
      ORDER BY "start_time"
    ) AS "next_start_time"
  FROM "time_entry"
  WHERE "end_time" IS NULL AND "user_id" IS NOT NULL
)
UPDATE "time_entry"
SET "end_time" = "ranked_open_entries"."next_start_time",
    "duration" = EXTRACT(
      EPOCH FROM ("ranked_open_entries"."next_start_time" - "time_entry"."start_time")
    )::integer
FROM "ranked_open_entries"
WHERE "time_entry"."id" = "ranked_open_entries"."id"
  AND "ranked_open_entries"."next_start_time" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_one_running_per_user" ON "time_entry" USING btree ("user_id") WHERE end_time IS NULL;
