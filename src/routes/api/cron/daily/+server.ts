// Vercel Cron entry point (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; anything else is rejected.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../_lib/options';

import { runDailyJobs } from '@/lib/cron';
import { safeEqual } from '@/lib/server/secrets';

// Read by adapter-vercel (ignored by adapter-node).
export const config = { maxDuration: 60 };

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && safeEqual(header, `Bearer ${secret}`);
}

export const GET: RequestHandler = async ({ request }) => {
  if (!authorized(request.headers.get('authorization'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results = await runDailyJobs();
  return Response.json({ ok: true, results });
};

export const OPTIONS = allowOptions('GET');
