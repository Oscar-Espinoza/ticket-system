// Dynamic Client Registration policy (docs/mcp/PLAN.md D3). Better Auth's
// `/oauth2/register` is open to unauthenticated callers so Claude and ChatGPT
// can register themselves; this policy, run from the `hooks.before` in
// src/lib/auth.ts, narrows what such a client may be:
//   - redirect URIs only on the allowlist (the vendors' callbacks, loopback for
//     Claude Code / MCP Inspector, MCP_EXTRA_REDIRECT_URIS, MCP_VIEW_REDIRECT_URIS);
//   - public clients only (`token_endpoint_auth_method: none`, PKCE): a
//     request for `client_secret_basic` / `client_secret_post` (claude.ai sends
//     `client_secret_post`) is registered as public instead, as RFC 7591
//     §3.2.1 allows; the response says `none` and the client follows it;
//   - authorization code + refresh token grants only;
//   - scopes within the provider's list, client names capped;
//   - homepage / logo / terms / policy URLs absolute https or absent
//     (invalidClientUri, the rule every client write path shares), and no
//     post-logout redirects.
// After registration the client is marked `metadata.registration = 'dynamic'`,
// which the consent screen flags and the daily cleanup
// (src/lib/cron/jobs/oauth-dcr-cleanup.ts) keys on. No imports of auth.ts
// (auth.ts imports this file).

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { oauthClients } from '@/db/schema';
import { invalidClientUri, OAUTH_APP_SCOPES } from '@/lib/oauth-model';

export const CLIENT_NAME_MAX = 100;
const REDIRECT_URIS_MAX = 10;
export const DYNAMIC_REGISTRATION = 'dynamic';

// The vendors' callbacks. Both hosts render MCP Apps views (cards), so a
// client whose redirect URIs are all of these is a view host (rendersViews below).
const FIXED_REDIRECTS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
]);
const CHATGPT_CALLBACK = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const ALLOWED_GRANTS = new Set(['authorization_code', 'refresh_token']);
const ALLOWED_SCOPES = new Set<string>(OAUTH_APP_SCOPES);
// Confidential methods we answer with a public client (RFC 7591 §3.2.1). Any
// other method (private_key_jwt, …) is refused.
const DOWNGRADED_AUTH_METHODS = new Set(['client_secret_basic', 'client_secret_post']);

const envList = (value: string | undefined) =>
  (value ?? '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

/** Callbacks of other hosts that render MCP Apps views; each is also allowed for registration. */
function viewRedirects(): Set<string> {
  return new Set(envList(process.env.MCP_VIEW_REDIRECT_URIS));
}

function extraRedirects(): Set<string> {
  return new Set([...envList(process.env.MCP_EXTRA_REDIRECT_URIS), ...viewRedirects()]);
}

/**
 * Whether an OAuth client is a host that renders MCP Apps views (cards):
 * every redirect URI it registered is the claude.ai or ChatGPT callback or
 * listed in MCP_VIEW_REDIRECT_URIS. A token can only reach a client through one
 * of its redirect URIs (PKCE, exact match), so this tells which host holds
 * the token without trusting anything the request says. Loopback clients
 * (Claude Code, MCP Inspector) and any client with one other URI are not.
 */
export function rendersViews(redirectUris: readonly string[] | null | undefined): boolean {
  if (!redirectUris?.length) return false;
  const extra = viewRedirects();
  return redirectUris.every((uri) => FIXED_REDIRECTS.has(uri) || CHATGPT_CALLBACK.test(uri) || extra.has(uri));
}

/**
 * Whether a dynamically registered client may use this redirect URI. It must
 * be in canonical form first (what the URL parser prints back), so the string
 * we match is the URL a browser would follow: `http://localhost\@evil/cb`
 * and similar parser tricks are refused before any pattern runs. A loopback
 * URI may also leave out the path (`http://127.0.0.1:1234`).
 */
export function isAllowedRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  const canonical = url.href === uri;
  // The one exception: a loopback URI with no path (`http://localhost:1234`)
  // prints back with a trailing slash. It is the same URL, so the loopback
  // rule below accepts it too.
  const barePath = !canonical && url.pathname === '/' && url.href === `${uri}/`;
  if (!canonical && !barePath) return false;
  if (canonical && (FIXED_REDIRECTS.has(uri) || CHATGPT_CALLBACK.test(uri) || extraRedirects().has(uri))) return true;
  // Loopback: any port and path (or none), plain http, no credentials or
  // fragment (not even an empty `#`, which url.hash doesn't show; RFC 6749 §3.1.2).
  return (
    url.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !uri.includes('#') &&
    uri.startsWith(`http://${url.hostname}`)
  );
}

export type RegistrationVerdict =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: 'invalid_redirect_uri' | 'invalid_client_metadata'; description: string };

const reject = (
  error: 'invalid_redirect_uri' | 'invalid_client_metadata',
  description: string,
): RegistrationVerdict => ({ ok: false, error, description });

/**
 * Checks an RFC 7591 registration body; on success returns the body to register
 * (public client, marked dynamic). A missing `token_endpoint_auth_method`, or
 * `client_secret_basic` / `client_secret_post`, becomes `none`; any other
 * method, and type "web", is refused.
 */
export function checkDynamicRegistration(input: unknown): RegistrationVerdict {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  const redirects = body.redirect_uris;
  if (!Array.isArray(redirects) || redirects.length === 0 || redirects.length > REDIRECT_URIS_MAX) {
    return reject('invalid_redirect_uri', `Register 1–${REDIRECT_URIS_MAX} redirect URIs.`);
  }
  for (const uri of redirects) {
    if (typeof uri !== 'string' || !isAllowedRedirect(uri)) {
      return reject('invalid_redirect_uri', 'This redirect URI is not allowed for dynamic registration.');
    }
  }

  const method = body.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none' && !(typeof method === 'string' && DOWNGRADED_AUTH_METHODS.has(method))) {
    return reject('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") may register.');
  }
  // Type "web" is refused rather than dropped: Better Auth merges this verdict
  // into the request body, so a hook can't remove a field.
  if (body.type !== undefined && body.type !== 'native' && body.type !== 'user-agent-based') {
    return reject('invalid_client_metadata', 'Only public clients may register.');
  }

  const grants = body.grant_types;
  if (grants !== undefined) {
    if (!Array.isArray(grants) || grants.some((g) => typeof g !== 'string' || !ALLOWED_GRANTS.has(g))) {
      return reject('invalid_client_metadata', 'Only the authorization_code and refresh_token grants are allowed.');
    }
  }
  const responses = body.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || responses.some((r) => r !== 'code'))) {
    return reject('invalid_client_metadata', 'Only the "code" response type is allowed.');
  }

  if (body.scope !== undefined) {
    if (typeof body.scope !== 'string') return reject('invalid_client_metadata', 'scope must be a string.');
    const unknown = body.scope.split(' ').filter((s) => s && !ALLOWED_SCOPES.has(s));
    if (unknown.length) return reject('invalid_client_metadata', `Unknown scope: ${unknown.join(' ')}.`);
  }

  const name = body.client_name;
  if (name !== undefined && (typeof name !== 'string' || name.length > CLIENT_NAME_MAX)) {
    return reject('invalid_client_metadata', `client_name must be at most ${CLIENT_NAME_MAX} characters.`);
  }

  const badUri = invalidClientUri(body);
  if (badUri) return reject('invalid_client_metadata', `${badUri} must be an absolute https URL.`);
  if (body.post_logout_redirect_uris !== undefined) {
    return reject('invalid_client_metadata', 'post_logout_redirect_uris is not allowed for dynamic registration.');
  }

  return { ok: true, body: { ...body, token_endpoint_auth_method: 'none' } };
}

/**
 * Marks a just-registered client as dynamic (run from the register endpoint's
 * `hooks.after`: the endpoint's body schema drops unknown fields, so the mark
 * can't travel in the request).
 */
export async function markDynamicClient(clientId: unknown): Promise<void> {
  if (typeof clientId !== 'string' || !clientId) return;
  await db
    .update(oauthClients)
    .set({ metadata: { registration: DYNAMIC_REGISTRATION } })
    .where(eq(oauthClients.clientId, clientId));
}

/** Whether a stored client was created through dynamic registration. */
export function isDynamicClient(metadata: unknown): boolean {
  let value = metadata;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return !!value && typeof value === 'object' && (value as { registration?: unknown }).registration === DYNAMIC_REGISTRATION;
}
