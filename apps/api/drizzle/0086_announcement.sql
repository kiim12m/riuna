CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"pinned_until" timestamp,
	"notified" boolean DEFAULT false NOT NULL,
	"author_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_workspace_created_idx" ON "announcement" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "announcement_project_created_idx" ON "announcement" USING btree ("project_id","created_at");