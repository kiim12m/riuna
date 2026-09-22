DROP INDEX "time_entry_userId_idx";--> statement-breakpoint
CREATE INDEX "time_entry_userId_startTime_idx" ON "time_entry" USING btree ("user_id","start_time");