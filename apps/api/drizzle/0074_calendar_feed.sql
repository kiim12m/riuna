-- Interludio de productividad, sub-bloque 4.1 (ADR 057): el enlace del
-- calendario de una persona en un espacio. Solo se guarda el sha256 del token.
-- Solo crea la tabla: no toca datos existentes.
CREATE TABLE "calendar_feed" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_feed_workspace_user" ON "calendar_feed" USING btree ("workspace_id","user_id");