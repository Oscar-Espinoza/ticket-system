// Daily cron job stub — owned by D5. Flag SLA breaches (slaDueAt passed, issue still open) and notify.
// Must be idempotent (Vercel may retry) and never throw past its own try/catch.

export async function run(_now: Date): Promise<string> {
  return 'not implemented';
}
