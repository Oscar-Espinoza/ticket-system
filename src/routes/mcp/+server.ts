// MCP server for Claude, ChatGPT and other AI assistants (docs/MCP.md). The
// handler lives in src/lib/server/mcp/http.ts; it authenticates by bearer
// token only, never the session cookie.

import { handleMcpPost, mcpMethodNotAllowed, mcpOptions } from '@/lib/server/mcp/http';
import type { RequestHandler } from './$types';

// Read by adapter-vercel (ignored by adapter-node).
export const config = { maxDuration: 60 };

export const POST: RequestHandler = ({ request }) => handleMcpPost(request);
export const GET: RequestHandler = () => mcpMethodNotAllowed();
export const DELETE: RequestHandler = () => mcpMethodNotAllowed();
export const OPTIONS: RequestHandler = () => mcpOptions();
