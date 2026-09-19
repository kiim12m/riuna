CREATE TABLE "dashboard" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_widget" (
	"id" text PRIMARY KEY NOT NULL,
	"dashboard_id" text NOT NULL,
	"project_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"span" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_widget_type_valid" CHECK ("dashboard_widget"."type" IN ('count', 'breakdown', 'trend', 'time', 'epic_progress', 'table', 'inbox')),
	CONSTRAINT "dashboard_widget_span_valid" CHECK ("dashboard_widget"."span" BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "dashboard_workspace_creator_idx" ON "dashboard" USING btree ("workspace_id","created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_one_default_per_person" ON "dashboard" USING btree ("workspace_id","created_by") WHERE is_default;--> statement-breakpoint
CREATE INDEX "dashboard_widget_dashboardId_idx" ON "dashboard_widget" USING btree ("dashboard_id");