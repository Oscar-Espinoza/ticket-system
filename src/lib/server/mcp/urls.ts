// The MCP endpoint's public identifiers (docs/mcp/PLAN.md D2). `mcpUrl()` is
// the exact string people paste into Claude or ChatGPT; the protected-resource
// document's `resource`, the JWT audience Better Auth issues
// (`validAudiences` in src/lib/auth.ts) and the check in ./auth.ts all use it,
// so they agree byte for byte. Server-only, no imports of auth.ts (auth.ts
// imports this file).
//
// One source: the resource (`<app URL>/mcp`) and the authorization server we
// advertise (`<app URL>/api/auth`) both come from the app URL, and
// `mcpConfig()` refuses to serve when Better Auth's own base URL (the token
// issuer) is somewhere else: clients would fetch metadata whose issuer doesn't
// match and fail in ways that are hard to trace.

import { appUrl, authBaseUrl } from '@/lib/integrations/app-url';

/** `<origin>/mcp`. */
export function mcpUrl(): string {
  return `${appUrl()}/mcp`;
}

/** The authorization server `/mcp` advertises (RFC 9728 `authorization_servers`). */
export function mcpAuthorizationServer(): string {
  return `${appUrl()}/api/auth`;
}

/** RFC 9728 metadata URL for the MCP resource (path-suffixed form). */
export function protectedResourceMetadataUrl(): string {
  return `${appUrl()}/.well-known/oauth-protected-resource/mcp`;
}

export type McpConfig = { ok: true } | { ok: false; error: string };

let reported = false;

/**
 * Whether the advertised authorization server is the one that issues tokens
 * (Better Auth's base URL). When PUBLIC_APP_URL and BETTER_AUTH_URL point at
 * different places it logs one clear error and the MCP routes answer 500 with
 * the same message.
 */
export function mcpConfig(): McpConfig {
  const advertised = mcpAuthorizationServer();
  const issuer = authBaseUrl();
  if (advertised === issuer) return { ok: true };
  const error =
    `MCP is misconfigured: the app URL (PUBLIC_APP_URL → ${advertised}) and Better Auth's URL ` +
    `(BETTER_AUTH_URL → ${issuer}) differ. Set both to the same public URL.`;
  if (!reported) {
    reported = true;
    console.error(`[mcp] ${error}`);
  }
  return { ok: false, error };
}

/** The OAuth scopes MCP tools use (D5). */
export const MCP_SCOPES = ['read', 'write'] as const;
