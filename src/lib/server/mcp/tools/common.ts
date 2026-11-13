// One way to declare an MCP tool (docs/mcp/PLAN.md → Tool catalogue rules):
// explicit annotations (title + all three hints), the OAuth scope it needs
// (D5: `read` or `write`), ChatGPT's invocation status strings, and the scope
// check itself, so no tool can forget it. A write tool called with a read-only
// token answers a tool error carrying `_meta["mcp/www_authenticate"]` (the
// `insufficient_scope` challenge ChatGPT turns into its re-link prompt).
// Write tools are audited here when refused or failed (../audit.ts); their
// successful calls are audited by the tool itself, which knows the issue.
// Every result leaves through ../ui.ts resultFor, which drops
// `structuredContent` for clients that don't render views.

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';

import type { ApiScope } from '@/lib/api-auth';
import type { McpCredential } from '../contracts';
import { auditRefusal, refusalOf, type Refusal } from '../audit';
import { toolError } from '../format';
import { resultFor, UI_TOOL_META } from '../ui';
import { protectedResourceMetadataUrl } from '../urls';

export interface McpTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  /** Write tools only: true when the call overwrites existing data (hosts confirm it). */
  destructive?: boolean;
  /** Same arguments, same effect (only meaningful for writes). */
  idempotent?: boolean;
  input: S;
  /** True when the result has an MCP Apps view (src/mcp-ui): the tool points at the view resource. */
  view?: boolean;
  /** ChatGPT status lines, ≤ 64 characters. */
  invoking: string;
  invoked: string;
  run: (args: z.infer<S>, credential: McpCredential) => Promise<CallToolResult>;
}

export const defineTool = <S extends z.ZodObject>(tool: McpTool<S>): McpTool<S> => tool;

export function insufficientScope(scope: ApiScope): CallToolResult {
  const description = `This connection can't ${scope === 'write' ? 'make changes' : 'read data'}: reconnect and grant the "${scope}" permission.`;
  return toolError(description, {
    'mcp/www_authenticate': [
      `Bearer resource_metadata="${protectedResourceMetadataUrl()}", error="insufficient_scope", scope="${scope}", error_description="${description.replace(/"/g, "'")}"`,
    ],
  });
}

export function registerMcpTool(server: McpServer, credential: McpCredential, tool: McpTool) {
  const write = tool.scope === 'write';
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: {
        title: tool.title,
        readOnlyHint: !write,
        destructiveHint: write ? tool.destructive === true : false,
        idempotentHint: write ? tool.idempotent === true : true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: [{ type: 'oauth2', scopes: [tool.scope] }],
        'openai/toolInvocation/invoking': tool.invoking,
        'openai/toolInvocation/invoked': tool.invoked,
        ...(tool.view && UI_TOOL_META),
      },
    },
    async (args: unknown) => {
      const refuse = async (result: CallToolResult, refusal: Refusal) => {
        if (write) await auditRefusal(credential, tool.name, (args ?? {}) as Record<string, unknown>, refusal);
        return result;
      };
      if (!credential.scopes.has(tool.scope)) {
        return refuse(insufficientScope(tool.scope), { outcome: 'denied', reason: 'insufficient_scope' });
      }
      let result: CallToolResult;
      try {
        result = await tool.run(args as never, credential);
      } catch (err) {
        console.error(`[mcp] ${tool.name} failed`, err);
        return refuse(toolError('Something went wrong on the server. Try again in a moment.'), {
          outcome: 'failed',
          reason: 'server_error',
        });
      }
      if (result.isError) return refuse(result, refusalOf(result));
      return resultFor(result, credential, server.server.getClientCapabilities());
    },
  );
}
