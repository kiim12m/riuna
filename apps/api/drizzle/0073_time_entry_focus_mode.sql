-- Interludio de productividad, sub-bloque 3.2 (ADR 056): las sesiones del modo
-- foco son entradas de tiempo reales con su modo. Se filtra: el cierre del dia
-- cuenta las sesiones.
ALTER TABLE "time_entry" ADD COLUMN "focus_mode" text;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_focus_mode_valid" CHECK ("time_entry"."focus_mode" IS NULL OR "time_entry"."focus_mode" IN ('pomodoro', 'flowtime', 'countdown'));