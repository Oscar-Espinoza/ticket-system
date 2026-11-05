// Change token for live updates — the polling fallback of LiveUpdates (every
// ~5 s) when the SSE stream (`../stream`) isn't available. See getChangeToken.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../../_lib/options';

import { getChangeToken } from '@/lib/sync/change-token';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });

  const token = await getChangeToken(id, locals.user.id);
  // Non-members get the same 404 as a missing project (no id probing).
  if (token === null) return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  return Response.json({ token }, { headers: NO_STORE });
};

// Next answered OPTIONS automatically (204 + Allow); Kit would 405.
export const OPTIONS = allowOptions('GET');
