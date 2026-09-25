// Daily cron job stub — owned by D11. Send daily/weekly email digests per user_profile.digestFrequency.
// Must be idempotent (Vercel may retry) and never throw past its own try/catch.

export async function run(_now: Date): Promise<string> {
  return 'not implemented';
}
