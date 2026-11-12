// The MCP Apps view resource (docs/mcp/PLAN.md D7): one self-contained HTML
// bundle (src/mcp-ui, built by `npm run build:mcp-ui`) that Claude and ChatGPT
// render in a sandboxed iframe for the tools that carry `_meta.ui.resourceUri`.
//
// The HTML is a `?raw` import, so it is part of the server bundle and needs no
// filesystem access at runtime (Vercel functions, the Docker image). The URI
// carries a hash of the HTML because ChatGPT caches a resource by URI for up
// to an hour: a new bundle gets a new URI. The CSP lists no connect domains
// (the view makes no network request; every call goes through the host, which
// holds the token) and one resource domain, the app's own origin, for uploaded
// avatars; any other image falls back to initials.

import { createHash } from 'node:crypto';

import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

import { appUrl } from '@/lib/integrations/app-url';
import viewHtml from './ui/app.html?raw';

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
        // Uploaded avatars are served from the app's own origin.
        resourceDomains: [new URL(appUrl()).origin],
      },
      // The host draws the card border; the view paints only its own content.
      prefersBorder: true,
    },
  };
}

export function registerMcpUi(server: McpServer) {
  registerAppResource(
    server,
    'Ticket System views',
    UI_RESOURCE_URI,
    {
      description: 'Interactive issue lists, issue details, project overviews and cycle burndowns for Ticket System.',
      _meta: uiResourceMeta(),
    },
    async () => ({
      contents: [{ uri: UI_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: UI_HTML, _meta: uiResourceMeta() }],
    }),
  );
}
