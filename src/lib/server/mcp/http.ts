// The `/mcp` HTTP endpoint (docs/mcp/PLAN.md D1/D2, "Auth and HTTP details").
// Stateless Streamable HTTP: no sessions, a fresh McpServer per request, JSON
// responses. 2025-era clients (Claude, ChatGPT, Claude Code today) are served
// by the SDK's web-standard Streamable HTTP transport; 2026-07-28 clients by
// the SDK's per-request handler. Bearer tokens only (./auth.ts), never the
// session cookie, which is what makes CORS `*` safe here.
//
// One JSON-RPC message per POST: batches (a JSON array) were dropped from the
// protocol in 2025-06-18 and none of the clients we serve send them, so an
// array is refused before any tool runs instead of fanning out into many
// tool calls under one request.

import {
  createMcpHandler,
  isJsonContentType,
  isLegacyRequest,
  readRequestBody,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
} from '@modelcontextprotocol/server';

import type { McpCredential } from './contracts';
import { authenticateMcpRequest } from './auth';
import { createMcpServer } from './server';
import { mcpConfig } from './urls';

/** Tool inputs are at most a few tens of KB; the SDK's own default is 4 MiB. */
const MAX_BODY_BYTES = 1024 * 1024;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id, mcp-method, mcp-name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const jsonRpcError = (status: number, code: number, message: string, headers?: Record<string, string>) =>
  Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status, headers });

export const mcpOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** GET (SSE stream) and DELETE (session end) need sessions, which this server doesn't keep. */
export const mcpMethodNotAllowed = () =>
  withCors(jsonRpcError(405, -32000, 'Method not allowed.', { Allow: 'POST, OPTIONS' }));

type WithCredential = AuthInfo & { extra: { credential: McpCredential } };

// 2026-07-28 requests: the factory runs once per request with this request's credential.
const modern = createMcpHandler(
  ({ authInfo }) => createMcpServer((authInfo as WithCredential).extra.credential),
  { legacy: 'reject', onerror: (err) => console.error('[mcp]', err) },
);

async function serveLegacy(request: Request, credential: McpCredential, parsedBody: unknown): Promise<Response> {
  const server = createMcpServer(credential);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

/** The body as one JSON-RPC message, or the error response to send instead. */
async function readMessage(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const read = await readRequestBody(request, MAX_BODY_BYTES);
  if (read.tooLarge) return { ok: false, response: jsonRpcError(413, -32000, 'Request body too large.') };
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return { ok: false, response: jsonRpcError(400, -32700, 'Parse error: invalid JSON.') };
  }
  if (Array.isArray(body)) {
    return { ok: false, response: jsonRpcError(400, -32600, 'Batch requests are not supported: send one JSON-RPC message per request.') };
  }
  return { ok: true, body };
}

export async function handleMcpPost(request: Request): Promise<Response> {
  try {
    const config = mcpConfig();
    if (!config.ok) return withCors(jsonRpcError(500, -32603, config.error));
    const auth = await authenticateMcpRequest(request);
    if (!auth.ok) return withCors(auth.response);
    if (!isJsonContentType(request.headers.get('content-type'))) {
      return withCors(jsonRpcError(415, -32000, 'Content-Type must be application/json.'));
    }
    const message = await readMessage(request);
    if (!message.ok) return withCors(message.response);
    const parsedBody = message.body;
    const { credential } = auth;
    if (await isLegacyRequest(request, parsedBody)) return withCors(await serveLegacy(request, credential, parsedBody));
    const authInfo: WithCredential = {
      token: '',
      clientId: credential.clientId ?? 'api_key',
      scopes: [...credential.scopes],
      extra: { credential },
    };
    return withCors(await modern.fetch(request, { authInfo, parsedBody }));
  } catch (err) {
    console.error('[mcp] request failed', err);
    return withCors(jsonRpcError(500, -32603, 'Internal server error.'));
  }
}
