-- Interludio de productividad, sub-bloque 2.1 (ADR 054): el cierre del dia.
-- `review` es lo que el responsable de departamento podra ver; la valoracion
-- va en `review_private`, 1:1, y nunca se une desde fuera del modulo review/.
CREATE TABLE "review_private" (
	"review_id" text PRIMARY KEY NOT NULL,
	"impact" smallint,
	"energy" smallint,
	"note" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_private_impact_valid" CHECK ("review_private"."impact" IS NULL OR "review_private"."impact" BETWEEN 1 AND 4),
	CONSTRAINT "review_private_energy_valid" CHECK ("review_private"."energy" IS NULL OR "review_private"."energy" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"blockers" text,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_period_valid" CHECK ("review"."period" IN ('day', 'week'))
);
--> statement-breakpoint
ALTER TABLE "review_private" ADD CONSTRAINT "review_private_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "review_user_period_unique" ON "review" USING btree ("user_id","workspace_id","period","period_start");