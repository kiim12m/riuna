-- La Bandeja pasa a llamarse «Personal» y a salir en lo alto de «Proyectos»
-- (ADR 051, actualizada el 2026-10-03). Renombra las que ya existen con el
-- nombre que les puso la API -no las que alguien haya renombrado a mano- y
-- cambia su clave de BAN a PER. Solo los proyectos que aun tienen dueño: uno
-- liberado ya es un proyecto normal y conserva su nombre.
UPDATE "project"
SET "name" = 'Personal' || substr("name", length('Bandeja') + 1)
WHERE "owner_user_id" IS NOT NULL
  AND ("name" = 'Bandeja' OR "name" LIKE 'Bandeja de %');
--> statement-breakpoint
UPDATE "project"
SET "slug" = 'PER'
WHERE "owner_user_id" IS NOT NULL AND "slug" = 'BAN';
--> statement-breakpoint
UPDATE "project"
SET "icon" = 'UserRound'
WHERE "owner_user_id" IS NOT NULL AND "icon" = 'Inbox';
