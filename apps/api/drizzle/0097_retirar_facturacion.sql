DELETE FROM "job_status" WHERE "job" IN ('seat-reconciliation', 'trial-reminders');--> statement-breakpoint
DROP TABLE "billing_event" CASCADE;--> statement-breakpoint
DROP TABLE "billing_reminder_sent" CASCADE;--> statement-breakpoint
DROP TABLE "trial_grant" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_billing" CASCADE;
