// Liveness probe for Docker/uptime checks: 200 once the server (and, when
// self-hosted, its migrations) is up.
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
  Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
