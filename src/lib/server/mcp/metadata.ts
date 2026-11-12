// RFC 9728 protected-resource metadata for `/mcp` (docs/mcp/PLAN.md → Auth and
// HTTP details). Served at both /.well-known/oauth-protected-resource and its
// path-suffixed form /.well-known/oauth-protected-resource/mcp, with CORS `*`.

import { appUrl } from '@/lib/integrations/app-url';
import { tokenIssuer } from './auth';
import { MCP_SCOPES, mcpConfig, mcpUrl } from './urls';

export async function protectedResourceMetadata() {
  return {
    resource: mcpUrl(),
    // Better Auth's own base URL, the issuer of its tokens.
    authorization_servers: [await tokenIssuer()],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Ticket System',
    resource_documentation: `${appUrl()}/dashboard/settings/oauth-apps`,
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
  'Access-Control-Max-Age': '86400',
};

export async function protectedResourceResponse(): Promise<Response> {
  const config = mcpConfig();
  if (!config.ok) {
    return Response.json({ error: 'server_error', error_description: config.error }, { status: 500, headers: CORS });
  }
  return Response.json(await protectedResourceMetadata(), { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } });
}

export const metadataOptions = () => new Response(null, { status: 204, headers: CORS });
