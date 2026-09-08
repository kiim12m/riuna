-- Fase 7: la regla de "esta columna es final" pasa a vivir una sola vez.
--
-- Escrita a mano: no hay cambio de esquema que generar, solo dos funciones.
--
-- El disparador `task_set_completed_at` corta por lo sano cuando `status` no
-- cambia, que es lo correcto —un arrastre dentro de la misma columna no tiene
-- que pagar una consulta— pero deja sin efecto la reparacion que la ADR 025
-- prescribia para cuando se marca o desmarca una columna como final:
-- `UPDATE task SET status = status` no cambia `status`, asi que el disparador
-- se salta el recalculo y `completed_at` se queda como estaba.
--
-- En vez de escribir la regla por cuarta vez en el controlador, se extrae a
-- `task_status_is_final`, que ahora usan **los dos**: el disparador por fila y
-- la reparacion por proyecto.
CREATE OR REPLACE FUNCTION "task_status_is_final"(
	"p_project_id" text,
	"p_status" text
) RETURNS boolean AS $$
	SELECT
		EXISTS (
			SELECT 1 FROM "column" c
			WHERE c."project_id" = "p_project_id"
			  AND c."slug" = "p_status"
			  AND c."is_final"
		)
		-- El respaldo heredado: un proyecto sin ninguna columna final sigue
		-- entendiendo el slug `done`, que es lo que Kaneo daba por terminado
		-- antes de que las columnas fueran configurables.
		OR (
			"p_status" = 'done'
			AND NOT EXISTS (
				SELECT 1 FROM "column" c
				WHERE c."project_id" = "p_project_id" AND c."is_final"
			)
		);
$$ LANGUAGE sql STABLE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "task_set_completed_at"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND NEW."status" IS NOT DISTINCT FROM OLD."status"
		AND NEW."project_id" IS NOT DISTINCT FROM OLD."project_id" THEN
		RETURN NEW;
	END IF;

	IF "task_status_is_final"(NEW."project_id", NEW."status") THEN
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
$$ LANGUAGE plpgsql;
