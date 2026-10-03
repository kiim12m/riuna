-- Interludio de productividad, sub-bloque 5.2 (ADR 059): el responsable de un
-- departamento. Todas las filas existentes quedan en `false`: nadie ve nada
-- nuevo hasta que se marque a alguien.
ALTER TABLE "team_member" ADD COLUMN "is_lead" boolean DEFAULT false NOT NULL;