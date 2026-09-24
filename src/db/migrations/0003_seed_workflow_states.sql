-- Seed the default workflow states for every existing project, then map each
-- ticket's legacy `status` onto its project's matching state. Keep this list in
-- sync with DEFAULT_WORKFLOW_STATES in src/lib/workflow.ts.
INSERT INTO "workflow_state" ("id", "project_id", "name", "type", "color", "position", "created_at")
SELECT gen_random_uuid()::text, p."id", s."name", s."type"::"workflow_state_type", s."color", s."position", now()
FROM "project" p
CROSS JOIN (VALUES
  ('Triage',      'triage',    '#fc7840', -1),
  ('Backlog',     'backlog',   '#9da1a8',  0),
  ('Todo',        'unstarted', '#747981',  1),
  ('In Progress', 'started',   '#e5a100',  2),
  ('In Review',   'started',   '#3b82f6',  3),
  ('Done',        'completed', '#5e6ad2',  4),
  ('Canceled',    'canceled',  '#9da1a8',  5),
  ('Duplicate',   'canceled',  '#9da1a8',  6)
) AS s("name", "type", "color", "position")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "ticket" t
SET "state_id" = ws."id"
FROM "workflow_state" ws
WHERE ws."project_id" = t."project_id"
  AND ws."name" = CASE t."status"
    WHEN 'backlog' THEN 'Backlog'
    WHEN 'todo' THEN 'Todo'
    WHEN 'in_progress' THEN 'In Progress'
    WHEN 'in_review' THEN 'In Review'
    WHEN 'done' THEN 'Done'
  END;
--> statement-breakpoint
UPDATE "ticket" SET "completed_at" = "updated_at" WHERE "status" = 'done' AND "completed_at" IS NULL;
--> statement-breakpoint
UPDATE "ticket" SET "started_at" = "updated_at" WHERE "status" IN ('in_progress', 'in_review') AND "started_at" IS NULL;
--> statement-breakpoint
UPDATE "ticket" SET "sort_order" = "ticket_number";
--> statement-breakpoint
-- Full-text issue search (kept out of schema.ts: drizzle-kit can't express it).
CREATE INDEX IF NOT EXISTS "ticket_search_idx" ON "ticket"
  USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_search_idx" ON "comment"
  USING gin (to_tsvector('english', "body"));
