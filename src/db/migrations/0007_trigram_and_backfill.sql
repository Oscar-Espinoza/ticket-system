-- Trigram similarity for duplicate detection and triage suggestions (pg_trgm
-- ships with Neon). Kept out of schema.ts: drizzle-kit can't express it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_title_trgm_idx" ON "ticket" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
-- Time in status: best estimate of when each issue entered its current state.
UPDATE "ticket"
SET "state_changed_at" = coalesce("completed_at", "canceled_at", "started_at", "updated_at")
WHERE "state_changed_at" IS NULL;
