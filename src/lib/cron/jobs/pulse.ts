// Daily cron job stub — owned by D8. Post weekly Pulse (epic/project update digest) to subscribers' inboxes.
// Must be idempotent (Vercel may retry) and never throw past its own try/catch.

export async function run(_now: Date): Promise<string> {
  return 'not implemented';
}
