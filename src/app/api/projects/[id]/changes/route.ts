// Change token for live updates — the polling fallback of LiveUpdates (every
// ~5 s) when the SSE stream (`../stream`) isn't available. See getChangeToken.

import { getSession } from '@/lib/session';
import { getChangeToken } from '@/lib/sync/change-token';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([ctx.params, getSession()]);
  if (!session?.user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });

  const token = await getChangeToken(id, session.user.id);
  // Non-members get the same 404 as a missing project (no id probing).
  if (token === null) return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  return Response.json({ token }, { headers: NO_STORE });
}
