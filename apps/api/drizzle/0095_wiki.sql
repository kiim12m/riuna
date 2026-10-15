CREATE TABLE "wiki_link" (
	"page_id" text NOT NULL,
	"task_id" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "wiki_link_page_id_task_id_source_pk" PRIMARY KEY("page_id","task_id","source"),
	CONSTRAINT "wiki_link_source_valid" CHECK ("wiki_link"."source" IN ('page', 'task'))
);
--> statement-breakpoint
CREATE TABLE "wiki_page" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"parent_id" text,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_version" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"author_id" text,
	"note" text,
	"restored_from" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "wiki_page_id" text;--> statement-breakpoint
ALTER TABLE "wiki_link" ADD CONSTRAINT "wiki_link_page_id_wiki_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_link" ADD CONSTRAINT "wiki_link_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_parent_id_wiki_page_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wiki_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_version" ADD CONSTRAINT "wiki_page_version_page_id_wiki_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_version" ADD CONSTRAINT "wiki_page_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_link_taskId_idx" ON "wiki_link" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "wiki_page_workspaceId_idx" ON "wiki_page" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "wiki_page_projectId_idx" ON "wiki_page" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "wiki_page_parentId_idx" ON "wiki_page" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_version_page_version_unique" ON "wiki_page_version" USING btree ("page_id","version");--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_wiki_page_id_wiki_page_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_wikiPageId_idx" ON "asset" USING btree ("wiki_page_id");