-- Interludio de productividad, sub-bloque 1.1 (ADR 051): la Bandeja es un
-- proyecto con dueno, uno por persona y espacio, oculto en las listas de
-- proyectos pero no privado.
ALTER TABLE "project" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_one_inbox_per_member" ON "project" USING btree ("workspace_id","owner_user_id") WHERE owner_user_id IS NOT NULL;--> statement-breakpoint
-- Escrito a mano: si la persona sale del espacio, su Bandeja pasa a ser un
-- proyecto normal, igual que al borrarla (`ON DELETE SET NULL`). Si no, sus
-- tareas quedarian en un proyecto que ya no sale en ninguna lista. Salir del
-- espacio tiene varios caminos -quitar a un miembro, abandonarlo, borrar la
-- cuenta-, asi que la regla vive en la base, la misma razon que la ADR 025.
CREATE OR REPLACE FUNCTION "workspace_member_release_inbox"() RETURNS trigger AS $$
BEGIN
	UPDATE "project" SET "owner_user_id" = NULL
	WHERE "workspace_id" = OLD."workspace_id" AND "owner_user_id" = OLD."user_id";
	RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_member_release_inbox" ON "workspace_member";
--> statement-breakpoint
CREATE TRIGGER "workspace_member_release_inbox"
AFTER DELETE ON "workspace_member"
FOR EACH ROW
EXECUTE FUNCTION "workspace_member_release_inbox"();
--> statement-breakpoint
-- Escrito a mano: el widget de notificaciones del panel se llamaba "Bandeja",
-- el mismo nombre que ahora tiene el proyecto de captura. Solo se renombran
-- los que conservan el titulo de partida; uno que alguien ya cambio, no.
UPDATE "dashboard_widget" SET "title" = 'Notificaciones'
WHERE "type" = 'inbox' AND "title" = 'Bandeja';
