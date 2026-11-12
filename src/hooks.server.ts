// Server hooks: self-hosted startup, CSRF, Better Auth session + /api/auth/*,
// the /dashboard sign-in guard, gzip, and the density boot snippet.
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/env';
import { isAuthPath } from 'better-auth/svelte-kit';
import { auth, CLIENT_IP_HEADER } from '@/lib/auth';
import { DENSITY_BOOT_SCRIPT, DENSITY_CSS } from '@/lib/density';
import { warnIfBehindUnconfiguredProxy } from '@/lib/server/proxy-warning';

// Awaited before the first request is served (adapter-node: before listen).
// Self-hosted: apply migrations and schedule the daily jobs.
export const init: ServerInit = async () => {
  if (building || process.env.SELF_HOSTED !== 'true') return;
  const { boot } = await import('@/lib/selfhost/boot');
  await boot();
};

// SvelteKit's built-in origin check is off (vite.config.ts: trustedOrigins
// ['*']) because it would reject these legitimate cross-site posts that carry
// no Origin header: SAML ACS, OAuth token/introspect/revoke, Slack callbacks,
// and token-authenticated API calls.
// Everything else gets the same check Kit would do.
const CSRF_EXEMPT = [
  /^\/api\/auth\/sso\/saml2\/(callback|sp\/acs)(\/|$)/,
  /^\/api\/auth\/oauth2\/(token|introspect|revoke)$/,
  /^\/api\/slack\//,
  // Bearer-token / signature / CRON_SECRET routes — never cookie-authenticated,
  // so a cross-site form post can't ride a session (curl -X DELETE, -d bodies).
  /^\/api\/v1\//,
  /^\/api\/graphql$/,
  /^\/api\/webhooks\//,
  /^\/api\/cron\//,
  // MCP: bearer token only, never the session cookie (src/lib/server/mcp/http.ts).
  /^\/mcp$/,
];
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

const csrf: Handle = ({ event, resolve }) => {
  const { request, url } = event;
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (
    !dev &&
    MUTATING.includes(request.method) &&
    (!type || FORM_TYPES.includes(type)) &&
    request.headers.get('origin') !== url.origin &&
    !CSRF_EXEMPT.some((re) => re.test(url.pathname))
  ) {
    return new Response('Cross-site form submissions are forbidden', { status: 403 });
  }
  return resolve(event);
};

/**
 * The request Better Auth sees: CLIENT_IP_HEADER (its rate-limit key) is
 * always the address SvelteKit resolved, never a value the caller sent.
 * adapter-node: the socket peer, or ADDRESS_HEADER / XFF_DEPTH when an admin
 * sets them behind a proxy; adapter-vercel: Vercel's x-forwarded-for.
 */
function withClientIp(event: Parameters<Handle>[0]['event']): Request {
  const headers = new Headers(event.request.headers);
  headers.delete(CLIENT_IP_HEADER);
  try {
    const address = event.getClientAddress();
    if (address) {
      headers.set(CLIENT_IP_HEADER, address);
      if (!dev) warnIfBehindUnconfiguredProxy(address);
    }
  } catch {
    // No resolvable address (e.g. ADDRESS_HEADER set but missing): Better Auth
    // falls back to one shared bucket, which is stricter, not looser.
  }
  return new Request(event.request, { headers });
}

const session: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.session = null;
  if (building) return resolve(event);
  // Answers /api/auth/* before routing.
  if (isAuthPath(event.url.toString(), auth.options)) return auth.handler(withClientIp(event));
  const s = await auth.api.getSession({ headers: event.request.headers });
  event.locals.user = s?.user ?? null;
  event.locals.session = s?.session ?? null;
  return resolve(event);
};

// Signed-out requests under /dashboard go to /login before any load runs. A
// layout load does not protect its pages' __data.json requests (they run in
// parallel), so data requests are covered here too: SvelteKit turns a 30x
// answer from handle into a JSON redirect for them. Remote functions answer
// 'Not authenticated' themselves.
const dashboardGuard: Handle = ({ event, resolve }) => {
  const { pathname } = event.url;
  const dashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  if (dashboard && !event.locals.user && !event.isRemoteRequest) {
    return new Response(null, { status: 303, headers: { location: '/login' } });
  }
  return resolve(event);
};

// Fills the %density.*% placeholders in src/app.html.
const density: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) =>
      html
        .replace('%density.script%', () => DENSITY_BOOT_SCRIPT)
        .replace('%density.css%', () => DENSITY_CSS),
  });

// adapter-node doesn't compress SSR/JSON responses (only prebuilt static
// files). Compress text responses here unless
// running on Vercel (its edge compresses) or the client doesn't accept gzip.
// Event streams are left alone so SSE events aren't held in the compressor.
const COMPRESSIBLE = /^(text\/html|text\/plain|text\/csv|application\/json|application\/javascript|image\/svg\+xml)/;
const compress: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (dev || process.env.VERCEL || event.request.method === 'HEAD' || !response.body) return response;
  const type = response.headers.get('content-type') ?? '';
  if (!COMPRESSIBLE.test(type) || response.headers.has('content-encoding')) return response;
  if (!/\bgzip\b/.test(event.request.headers.get('accept-encoding') ?? '')) return response;
  const length = Number(response.headers.get('content-length') ?? NaN);
  if (length < 1024) return response;
  const headers = new Headers(response.headers);
  headers.set('content-encoding', 'gzip');
  headers.delete('content-length');
  headers.append('vary', 'Accept-Encoding');
  return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const handle = sequence(compress, csrf, session, dashboardGuard, density);

export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind === 'unknown') {
    console.error(`[error] ${event.request.method} ${event.url.pathname}`, error);
    return { message: 'Internal Error', status: 500 };
  }
  return undefined;
};
