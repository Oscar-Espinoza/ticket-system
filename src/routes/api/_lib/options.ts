// OPTIONS answer for route handlers: 204, no body, and an `Allow` header
// listing the exported methods (+ HEAD with GET, + OPTIONS), sorted.
// SvelteKit answers a missing OPTIONS with 405, so each +server.ts exports
// `OPTIONS = allowOptions(...)` with the methods it implements.
// (Not a route: files in src/routes without a `+` prefix are ignored.)

import type { RequestHandler } from '@sveltejs/kit';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function allowOptions(...methods: Method[]): RequestHandler {
  const all = new Set<string>([...methods, 'OPTIONS']);
  if (all.has('GET')) all.add('HEAD');
  const allow = [...all].sort().join(', ');
  return () => new Response(null, { status: 204, headers: { Allow: allow } });
}
