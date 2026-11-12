CREATE TABLE "vcs_webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"delivery_id" text NOT NULL,
	"project_id" text NOT NULL,
	"integration_id" text,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vcs_webhook_delivery" ADD CONSTRAINT "vcs_webhook_delivery_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vcs_webhook_delivery" ADD CONSTRAINT "vcs_webhook_delivery_integration_id_project_integration_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."project_integration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vcs_webhook_delivery_uq" ON "vcs_webhook_delivery" USING btree ("provider","delivery_id","project_id");--> statement-breakpoint
CREATE INDEX "vcs_webhook_delivery_due_idx" ON "vcs_webhook_delivery" USING btree ("next_attempt_at") WHERE next_attempt_at is not null;