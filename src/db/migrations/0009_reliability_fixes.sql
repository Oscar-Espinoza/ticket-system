ALTER TABLE "activity" ADD COLUMN "webhook_pending_project_id" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "description_source" text;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD COLUMN "event_id" text;--> statement-breakpoint
CREATE INDEX "activity_webhook_pending_idx" ON "activity" USING btree ("created_at") WHERE webhook_pending_project_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_event_hook_uq" ON "webhook_delivery" USING btree ("event_id","webhook_id");