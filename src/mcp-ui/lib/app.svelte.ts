// The view's state: what the host sent (a tool result, the host context) and
// the calls back into the server. One module-level instance; the components
// read `view` and call the functions.

import type { CallToolResult } from '@modelcontextprotocol/server';

import type { McpStructuredContent, ProjectMetadataView } from '@/lib/server/mcp/contracts';
import { Host, type DisplayMode, type HostContext } from './host';
import { applyHostContext } from './theme';

export type Phase = 'loading' | 'ready' | 'error';

export interface ToolOutcome {
  ok: boolean;
  /** The structured result of a successful call. */
  content: McpStructuredContent | null;
  /** The text of the result, or the error message. */
  text: string;
}

const textOf = (result: CallToolResult): string =>
  (result.content ?? [])
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

const structuredOf = (result: CallToolResult): McpStructuredContent | null => {
  const value = result.structuredContent as { view?: unknown } | undefined;
  return value && typeof value.view === 'string' ? (value as unknown as McpStructuredContent) : null;
};

class ViewState {
  phase = $state<Phase>('loading');
  content = $state.raw<McpStructuredContent | null>(null);
  /** Error text, or the text of a result with no structured content. */
  message = $state('');
  context = $state.raw<HostContext>({});
  displayMode = $state<DisplayMode>('inline');
}

export const view = new ViewState();

function receive(result: CallToolResult) {
  const content = structuredOf(result);
  view.message = textOf(result);
  if (result.isError) {
    view.phase = 'error';
    view.content = null;
  } else {
    view.phase = 'ready';
    view.content = content;
  }
}

function setContext(context: HostContext) {
  view.context = context;
  if (context.displayMode) view.displayMode = context.displayMode;
  applyHostContext(context);
}

export const host = new Host({
  onToolResult: receive,
  onToolCancelled: () => {
    view.phase = 'error';
    view.message = 'The request was cancelled.';
  },
  onContext: setContext,
});

/** Connect to the host. A page opened outside a host (no parent) stays on the skeleton. */
export async function start() {
  if (window.parent === window) return;
  try {
    await host.connect();
  } catch {
    view.phase = 'error';
    view.message = 'This view could not connect to its host.';
  }
}

/** Call a tool of this server through the host and read the result. */
export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    const result = await host.callTool(name, args);
    return { ok: !result.isError, content: result.isError ? null : structuredOf(result), text: textOf(result) };
  } catch (error) {
    return { ok: false, content: null, text: error instanceof Error ? error.message : 'The request failed.' };
  }
}

// A plain cache, not reactive state.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const metadataCache = new Map<string, Promise<ProjectMetadataView | null>>();

/** States (and other valid values) of a project, once per project per view. */
export function projectMetadata(projectKey: string): Promise<ProjectMetadataView | null> {
  let entry = metadataCache.get(projectKey);
  if (!entry) {
    entry = callTool('get_project_metadata', { project: projectKey }).then((r) =>
      r.ok && r.content?.view === 'project-metadata' ? r.content : null,
    );
    metadataCache.set(projectKey, entry);
    void entry.then((meta) => meta ?? metadataCache.delete(projectKey));
  }
  return entry;
}

export async function toggleFullscreen() {
  const next: DisplayMode = view.displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
  const mode = await host.requestDisplayMode(next);
  if (mode) view.displayMode = mode;
}
