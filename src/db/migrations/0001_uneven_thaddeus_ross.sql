-- Idempotent: this constraint was first applied with `drizzle-kit push`, so the
-- migration journal never recorded it.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_member_project_id_user_id_unique'
  ) THEN
    ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_user_id_unique" UNIQUE("project_id","user_id");
  END IF;
END $$;
