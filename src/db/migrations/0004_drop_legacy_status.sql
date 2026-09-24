ALTER TABLE "ticket" ALTER COLUMN "state_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."ticket_status";