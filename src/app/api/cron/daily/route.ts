// Vercel Cron entry point (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; anything else is rejected.

import { timingSafeEqual } from 'node:crypto';

import { runDailyJobs } from '@/lib/cron';

export const maxDuration = 60;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get('authorization'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results = await runDailyJobs();
  return Response.json({ ok: true, results });
}
