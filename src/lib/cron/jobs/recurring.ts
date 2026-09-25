// Daily cron job stub — owned by D5. Create due recurring issues (recurring_issue.nextRunAt <= now).
// Must be idempotent (Vercel may retry) and never throw past its own try/catch.

export async function run(_now: Date): Promise<string> {
  return 'not implemented';
}
