// The MCP endpoint's public identifiers (docs/mcp/PLAN.md D2). `mcpUrl()` is
// the exact string people paste into Claude or ChatGPT; the protected-resource
// document's `resource`, the JWT audience Better Auth issues
// (`validAudiences` in src/lib/auth.ts) and the check in ./auth.ts all use it,
// so they agree byte for byte. Server-only, no imports of auth.ts (auth.ts
// imports this file).

import { appUrl } from '@/lib/integrations/app-url';

/** `<origin>/mcp`. */
export function mcpUrl(): string {
  return `${appUrl()}/mcp`;
}

/** RFC 9728 metadata URL for the MCP resource (path-suffixed form). */
export function protectedResourceMetadataUrl(): string {
  return `${appUrl()}/.well-known/oauth-protected-resource/mcp`;
}

/** The OAuth scopes MCP tools use (D5). */
export const MCP_SCOPES = ['read', 'write'] as const;
