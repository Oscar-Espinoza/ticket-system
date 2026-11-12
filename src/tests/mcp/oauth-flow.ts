// The connector sign-in flow, driven in-process through Better Auth's handler
// exactly as Claude / ChatGPT drive it over HTTP: dynamic registration,
// PKCE authorization with `resource=<origin>/mcp`, consent, token, refresh.
import { createHash, randomBytes } from 'node:crypto';

import { auth } from '@/lib/auth';
import { mcpUrl } from '@/lib/server/mcp/urls';

export const AUTH_ORIGIN = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin;
const API = `${AUTH_ORIGIN}/api/auth`;
export const LOOPBACK_REDIRECT = 'http://localhost:7777/callback';

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

export async function authRequest(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set('origin', AUTH_ORIGIN);
  if (init.cookie) headers.set('cookie', init.cookie);
  return auth.handler(new Request(`${API}${path}`, { ...init, headers }));
}

export async function signUp(label: string): Promise<{ cookie: string; userId: string; email: string }> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@mcp.test`;
  const res = await authRequest('/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery-staple', name: label }),
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie: cookieHeader(res), userId: body.user.id, email };
}

export async function register(body: Record<string, unknown>) {
  return authRequest('/oauth2/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function registerPublicClient(redirect = LOOPBACK_REDIRECT): Promise<string> {
  const res = await register({
    client_name: 'Claude Code',
    redirect_uris: [redirect],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client_id: string }).client_id;
}

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
}

const tokenRequest = (params: Record<string, string>) =>
  authRequest('/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

/** Authorization code + PKCE (+ consent) → tokens. */
export async function authorize(
  cookie: string,
  clientId: string,
  scope = 'offline_access read write',
  resource: string | null = mcpUrl(),
): Promise<Tokens> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: LOOPBACK_REDIRECT,
    scope,
    state: 'xyz',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(resource && { resource }),
  });
  const start = await authRequest(`/oauth2/authorize?${query}`, { cookie, redirect: 'manual' });
  let callback = new URL(start.headers.get('location') ?? '', AUTH_ORIGIN);
  // First time: the consent page; once consent exists the code comes straight back.
  if (callback.pathname === '/oauth/consent') {
    const consent = await authRequest('/oauth2/consent', {
      method: 'POST',
      cookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accept: true, oauth_query: callback.search.slice(1) }),
    });
    const answer = (await consent.json()) as { url?: string; redirect_uri?: string };
    callback = new URL(answer.url ?? answer.redirect_uri ?? '');
  }
  const code = callback.searchParams.get('code');
  if (!code) throw new Error(`no code in ${callback}`);
  const res = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: LOOPBACK_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
    ...(resource && { resource }),
  });
  if (!res.ok) throw new Error(`token failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Tokens;
}

export async function refresh(clientId: string, refreshToken: string, resource: string | null = mcpUrl()) {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    ...(resource && { resource }),
  });
}
