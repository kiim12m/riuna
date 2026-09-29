ALTER TABLE "dashboard_widget" DROP CONSTRAINT "dashboard_widget_type_valid";--> statement-breakpoint
ALTER TABLE "dashboard_widget" DROP CONSTRAINT "dashboard_widget_span_valid";--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD COLUMN "row_span" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_row_span_valid" CHECK ("dashboard_widget"."row_span" BETWEEN 1 AND 6);--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_type_valid" CHECK ("dashboard_widget"."type" IN ('count', 'breakdown', 'trend', 'time', 'epic_progress', 'table', 'inbox', 'goal', 'week'));--> statement-breakpoint
ALTER TABLE "dashboard_widget" ADD CONSTRAINT "dashboard_widget_span_valid" CHECK ("dashboard_widget"."span" BETWEEN 1 AND 12);