// The MCP endpoint's public identifiers (docs/mcp/PLAN.md D2). `mcpUrl()` is
// the exact string people paste into Claude or ChatGPT; the protected-resource
// document's `resource`, the JWT audience Better Auth issues
// (`validAudiences` in src/lib/auth.ts) and the check in ./auth.ts all use it,
// so they agree byte for byte. Server-only, no imports of auth.ts (auth.ts
// imports this file).
//
// One place: the resource (`<app URL>/mcp`) comes from the app URL and the
// authorization server we advertise is Better Auth's base URL (the token
// issuer), and `mcpConfig()` refuses to serve when the two aren't the same
// site: clients would fetch metadata from one host for an issuer on another
// and fail in ways that are hard to trace.

import { appUrl, authBaseUrl } from '@/lib/integrations/app-url';

/** `<origin>/mcp`. */
export function mcpUrl(): string {
  return `${appUrl()}/mcp`;
}

/**
 * The authorization server `/mcp` advertises (RFC 9728 `authorization_servers`):
 * Better Auth's base URL, i.e. exactly the issuer its metadata and tokens
 * carry (RFC 8414 §3.3). With a sound configuration it is `<app URL>/api/auth`.
 */
export function mcpAuthorizationServer(): string {
  return authBaseUrl();
}

/** RFC 9728 metadata URL for the MCP resource (path-suffixed form). */
export function protectedResourceMetadataUrl(): string {
  return `${appUrl()}/.well-known/oauth-protected-resource/mcp`;
}

export type McpConfig = { ok: true } | { ok: false; error: string };

/** What unauthenticated callers see: the URLs may name internal hosts, so they stay in the log. */
export const MCP_MISCONFIGURED = 'MCP is not configured correctly on this server; the administrator can find the details in the server log.';

let reported: string | null = null;

/** `https://Tickets.example.com:443/api/auth/` → `https://tickets.example.com/api/auth`; null if not a URL. */
function normalized(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/**
 * Whether the app (where `/mcp` and its metadata live) and Better Auth (which
 * issues the tokens) share one URL, compared after normalising (letter case,
 * default port, trailing slash). When PUBLIC_APP_URL and BETTER_AUTH_URL point
 * at different places it logs the two URLs once and the MCP routes answer 500
 * with a generic message.
 */
export function mcpConfig(): McpConfig {
  const expected = `${appUrl()}/api/auth`;
  const issuer = authBaseUrl();
  const a = normalized(expected);
  if (a !== null && a === normalized(issuer)) return { ok: true };
  const detail =
    `MCP is misconfigured: the app URL (PUBLIC_APP_URL → ${expected}) and Better Auth's URL ` +
    `(BETTER_AUTH_URL → ${issuer}) differ. Set both to the same public URL.`;
  if (reported !== detail) {
    reported = detail;
    console.error(`[mcp] ${detail}`);
  }
  return { ok: false, error: MCP_MISCONFIGURED };
}

/** The OAuth scopes MCP tools use (D5). */
export const MCP_SCOPES = ['read', 'write'] as const;
