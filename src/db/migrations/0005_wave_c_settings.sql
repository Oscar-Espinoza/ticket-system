CREATE TABLE "workspace_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by_id" text,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "workspace_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cycle_start_weekday" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cycle_auto_rollover" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "slack_events" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_invitation_workspace_idx" ON "workspace_invitation" USING btree ("workspace_id");