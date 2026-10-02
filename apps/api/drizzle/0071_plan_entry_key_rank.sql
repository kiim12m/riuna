-- Interludio de productividad, sub-bloque 1.3 (ADR 053): las imprescindibles
-- del dia. Como mucho tres por persona, espacio y dia, y lo impone la base.
ALTER TABLE "personal_plan_entry" ADD COLUMN "key_rank" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_plan_entry_key_rank_per_day" ON "personal_plan_entry" USING btree ("user_id","workspace_id","planned_date","key_rank") WHERE key_rank IS NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_plan_entry" ADD CONSTRAINT "personal_plan_entry_key_rank_valid" CHECK ("personal_plan_entry"."key_rank" IS NULL OR "personal_plan_entry"."key_rank" BETWEEN 1 AND 3);--> statement-breakpoint
-- Escrito a mano: ser imprescindible es de un dia. Mover la entrada a otro dia
-- la deja normal, venga de donde venga el cambio -el Planificador, el
-- Cronograma, el plan en bloque, MCP-. Antes de escribir, para que el indice
-- unico no choque con una imprescindible que ya ocupe ese puesto en el dia de
-- destino.
CREATE OR REPLACE FUNCTION "personal_plan_entry_clear_key_rank"() RETURNS trigger AS $$
BEGIN
	NEW."key_rank" := NULL;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "personal_plan_entry_clear_key_rank" ON "personal_plan_entry";
--> statement-breakpoint
CREATE TRIGGER "personal_plan_entry_clear_key_rank"
BEFORE UPDATE OF "planned_date" ON "personal_plan_entry"
FOR EACH ROW
WHEN (OLD."planned_date" IS DISTINCT FROM NEW."planned_date")
EXECUTE FUNCTION "personal_plan_entry_clear_key_rank"();
