// The MCP Apps view resource (docs/mcp/PLAN.md D7): one self-contained HTML
// bundle (src/mcp-ui, built by `npm run build:mcp-ui`) that Claude and ChatGPT
// render in a sandboxed iframe for the tools that carry `_meta.ui.resourceUri`.
//
// The HTML is a `?raw` import, so it is part of the server bundle and needs no
// filesystem access at runtime (Vercel functions, the Docker image). The URI
// carries a hash of the HTML because ChatGPT caches a resource by URI for up
// to an hour: a new bundle gets a new URI. The CSP lists no connect domains
// (the view makes no network request; every call goes through the host, which
// holds the token) and no resource domain: the view loads no image, font or
// script (avatars are initials).

import { createHash } from 'node:crypto';

import type { CallToolResult, ClientCapabilities, McpServer } from '@modelcontextprotocol/server';

import type { McpCredential } from './contracts';
import viewHtml from './ui/app.html?raw';

// Three constants of the MCP Apps spec (2026-01-26) and the one-line
// `registerResource` call of `registerAppResource`, copied from
// @modelcontextprotocol/ext-apps 2.0.4 instead of depending on it at runtime:
// the package pulls in the MCP client, eventsource and pkce-challenge for
// them. It stays a devDependency so src/tests/mcp-ui-model.test.ts can fail
// when a newer version changes either value.
/** The legacy flat tool-metadata key hosts that predate `_meta.ui` read. */
export const RESOURCE_URI_META_KEY = 'ui/resourceUri';
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
/** The client capability extension a host declares MCP Apps support under. */
export const EXTENSION_ID = 'io.modelcontextprotocol/ui';

/** `ui://ticket-system/app.<hash of the HTML>.html` */
export function uiResourceUri(html: string): string {
  return `ui://ticket-system/app.${createHash('sha256').update(html).digest('hex').slice(0, 12)}.html`;
}

export const UI_HTML: string = viewHtml;
export const UI_RESOURCE_URI = uiResourceUri(UI_HTML);

/** The tool metadata that points a tool at the view (current key and the legacy flat key older hosts read). */
export const UI_TOOL_META = {
  ui: { resourceUri: UI_RESOURCE_URI },
  [RESOURCE_URI_META_KEY]: UI_RESOURCE_URI,
} as const;

/** Resource metadata for `resources/read` (hosts read the CSP from the content item). */
export function uiResourceMeta() {
  return {
    ui: {
      csp: {
        // The view calls no network API: no fetch, XHR or WebSocket target is allowed.
        connectDomains: [] as string[],
        resourceDomains: [] as string[],
      },
      // The host draws the card border; the view paints only its own content.
      prefersBorder: true,
    },
  };
}

export function registerMcpUi(server: McpServer) {
  server.registerResource(
    'Ticket System views',
    UI_RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: 'Interactive issue lists, issue details, project overviews and cycle burndowns for Ticket System.',
      _meta: uiResourceMeta(),
    },
    async () => ({
      contents: [{ uri: UI_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: UI_HTML, _meta: uiResourceMeta() }],
    }),
  );
}

/**
 * Whether the client says it renders our views: its capabilities carry the
 * MCP Apps extension with our MIME type. Only 2026-07-28 requests carry
 * capabilities (`_meta`, on every request); on 2025-era requests a stateless
 * server never sees them outside `initialize`, so this is undefined there.
 */
export function declaresViews(capabilities: ClientCapabilities | undefined): boolean {
  const ui = (capabilities?.extensions as Record<string, unknown> | undefined)?.[EXTENSION_ID];
  const mimeTypes = ui && typeof ui === 'object' ? (ui as { mimeTypes?: unknown }).mimeTypes : undefined;
  return Array.isArray(mimeTypes) && mimeTypes.includes(RESOURCE_MIME_TYPE);
}

/**
 * The one rule for the shape of a tool result. Hosts that render views get it
 * whole: the Markdown `content` and the `structuredContent` the view draws.
 * Every other client gets the Markdown alone, because some (Claude Code)
 * hand the model `structuredContent` instead of the text whenever it is
 * present, which loses the fencing of user-written text and costs more
 * tokens. A host renders views when its OAuth client is a known view host
 * (credential.viewHost, from its redirect URIs) or when the request declares
 * the MCP Apps extension. Unknown clients get text: the text is complete on
 * its own. Tools declare no `outputSchema`, so a result without
 * `structuredContent` is valid for every client.
 */
export function resultFor(
  result: CallToolResult,
  credential: McpCredential,
  capabilities: ClientCapabilities | undefined,
): CallToolResult {
  if (result.structuredContent === undefined || credential.viewHost || declaresViews(capabilities)) return result;
  const { structuredContent: _views, ...text } = result;
  return text;
}
