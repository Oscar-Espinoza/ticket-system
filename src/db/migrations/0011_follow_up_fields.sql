ALTER TABLE "ticket" ADD COLUMN "waiting_on_id" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "follow_up" date;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "follow_up_notified_on" date;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_waiting_on_id_user_id_fk" FOREIGN KEY ("waiting_on_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_waiting_on_idx" ON "ticket" USING btree ("waiting_on_id");--> statement-breakpoint
CREATE INDEX "ticket_follow_up_pending_idx" ON "ticket" USING btree ("follow_up") WHERE follow_up is not null and follow_up_notified_on is distinct from follow_up and deleted_at is null and archived_at is null;