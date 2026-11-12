// Dynamic Client Registration policy (docs/mcp/PLAN.md D3). Better Auth's
// `/oauth2/register` is open to unauthenticated callers so Claude and ChatGPT
// can register themselves; this policy, run from the `hooks.before` in
// src/lib/auth.ts, narrows what such a client may be:
//   - redirect URIs only on the allowlist (the vendors' callbacks, loopback for
//     Claude Code / MCP Inspector, MCP_EXTRA_REDIRECT_URIS);
//   - public clients only (`token_endpoint_auth_method: none`, PKCE);
//   - authorization code + refresh token grants only;
//   - scopes within the provider's list, client names capped.
// After registration the client is marked `metadata.registration = 'dynamic'`,
// which the consent screen flags and the daily cleanup
// (src/lib/cron/jobs/oauth-dcr-cleanup.ts) keys on. No imports of auth.ts
// (auth.ts imports this file).

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { oauthClients } from '@/db/schema';
import { OAUTH_APP_SCOPES } from '@/lib/oauth-model';

export const CLIENT_NAME_MAX = 100;
const REDIRECT_URIS_MAX = 10;
export const DYNAMIC_REGISTRATION = 'dynamic';

const FIXED_REDIRECTS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
]);
const CHATGPT_CALLBACK = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const ALLOWED_GRANTS = new Set(['authorization_code', 'refresh_token']);
const ALLOWED_SCOPES = new Set<string>(OAUTH_APP_SCOPES);

function extraRedirects(): Set<string> {
  return new Set(
    (process.env.MCP_EXTRA_REDIRECT_URIS ?? '')
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

/** Whether a dynamically registered client may use this redirect URI. */
export function isAllowedRedirect(uri: string): boolean {
  if (FIXED_REDIRECTS.has(uri) || CHATGPT_CALLBACK.test(uri) || extraRedirects().has(uri)) return true;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  // Loopback: any port and path, plain http, no credentials or fragment.
  return (
    url.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.hash &&
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
 * (public client, marked dynamic). A missing `token_endpoint_auth_method`
 * becomes `none`; an explicit confidential method is refused.
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
  if (method !== undefined && method !== 'none') {
    return reject('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") may register.');
  }
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
