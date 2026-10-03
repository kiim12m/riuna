-- Interludio de productividad, sub-bloque 5.1 (ADR 060): ausencias por
-- persona, sin motivo, y festivos del espacio. Un dia no disponible vale 0 de
-- capacidad. Solo crea tablas: no toca datos existentes.
CREATE TABLE "user_time_off" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"starts_on" timestamp NOT NULL,
	"ends_on" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_time_off_range_valid" CHECK ("user_time_off"."ends_on" >= "user_time_off"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "workspace_holiday" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"day" timestamp NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_time_off" ADD CONSTRAINT "user_time_off_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_time_off" ADD CONSTRAINT "user_time_off_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_holiday" ADD CONSTRAINT "workspace_holiday_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "user_time_off_user_workspace_starts_idx" ON "user_time_off" USING btree ("user_id","workspace_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_holiday_workspace_day" ON "workspace_holiday" USING btree ("workspace_id","day");