ALTER TABLE "dashboard_widget" DROP CONSTRAINT "dashboard_widget_type_valid";--> statement-breakpoint
ALTER TABLE "dashboard" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD COLUMN "goal_id" text;--> statement-breakpoint
ALTER TABLE "goal" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "dashboard_workspace_shared_idx" ON "dashboard" USING btree ("workspace_id","is_shared");--> statement-breakpoint
CREATE INDEX "goal_workspace_shared_idx" ON "goal" USING btree ("workspace_id","is_shared");--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_type_valid" CHECK ("dashboard_widget"."type" IN ('count', 'breakdown', 'trend', 'time', 'epic_progress', 'table', 'inbox', 'goal'));