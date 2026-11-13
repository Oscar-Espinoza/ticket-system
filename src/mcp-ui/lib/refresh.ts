// Refreshing a card from the server (docs/mcp/PLAN.md "As built → Views").
//
// A host that reloads a chat renders each card again from the ORIGINAL tool
// result, so whatever changed since (in the card or elsewhere) is gone. After
// the card shows that result it asks the server again, with a READ tool, and
// shows the newer answer. Pure functions, no DOM and no Svelte: what to call
// for which view, whether to call at all, and what an answer means. The timing
// (once per load, when visible, staggered) lives in app.svelte.ts.
//
// Never a write: the tool to call is derived from the view, from a fixed list of
// read tools; a result that names any other tool is not refreshed.

import type { McpStructuredContent } from '@/lib/server/mcp/contracts';
import type { CallFn } from './write.svelte';

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** The only tools a refresh may call: all read-only. */
export const READ_TOOLS: ReadonlySet<string> = new Set([
  'get_issue',
  'list_issues',
  'my_work',
  'list_inbox',
  'get_project_overview',
  'get_cycle',
  'list_projects',
]);

/** The tools a paged list names as its `source` (contracts.ts `PageSource`). */
const LIST_SOURCES: ReadonlySet<string> = new Set(['list_issues', 'my_work', 'list_inbox']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The read that re-creates this result, or null when there is none: a list that
 * carries no `source` (search results), a source that names a tool outside the
 * list above, or a view that is never shown as a card (project metadata).
 * Issue results (also those of create_issue, update_issue and add_comment) are
 * re-read with get_issue, never by running the write again.
 */
export function refreshCall(content: McpStructuredContent | null): ToolCall | null {
  if (!content) return null;
  switch (content.view) {
    case 'issue-detail':
      return { tool: 'get_issue', args: { key: content.issue.key } };
    case 'issue-list': {
      const source = content.source;
      if (!source || !LIST_SOURCES.has(source.tool) || !isRecord(source.arguments)) return null;
      const { cursor: _cursor, ...args } = source.arguments;
      return { tool: source.tool, args };
    }
    case 'project-overview':
      if (content.mode === 'cycle') {
        return content.cycle ? { tool: 'get_cycle', args: { project: content.project.key, cycle: content.cycle.id } } : null;
      }
      return { tool: 'get_project_overview', args: { project: content.project.key } };
    case 'project-list':
      return { tool: 'list_projects', args: {} };
    default:
      return null;
  }
}

export interface RefreshContext {
  /** The host forwards tool calls (`hostCapabilities.serverTools`). */
  canCallTools: boolean;
  /** The user is in the middle of something in a card: a draft comment, a write in flight, extra pages loaded. */
  holding: boolean;
}

/** The call to make now, or null: no tool forwarding, the user is editing, or the view has no read. */
export function planRefresh(content: McpStructuredContent | null, context: RefreshContext): ToolCall | null {
  if (!context.canCallTools || context.holding) return null;
  return refreshCall(content);
}

/** What was true when a refresh started, and what is true when its answer arrives. */
export interface RefreshMoment {
  /** Which delivered tool result the card shows (a newer one replaces it). */
  loadId: number;
  /** Write results the user has seen so far. */
  writes: number;
  /** Things the user is doing that a refresh must not disturb. */
  holds: number;
}

/**
 * The answer is older than what the user sees: another tool result was
 * delivered, a write result came in (the refresh read may predate it), or the
 * user started a draft or loaded more rows while the call was out.
 */
export function isStale(started: Pick<RefreshMoment, 'loadId' | 'writes'>, now: RefreshMoment): boolean {
  return now.loadId !== started.loadId || now.writes !== started.writes || now.holds > 0;
}

export type RefreshResult =
  /** Same as shown: change nothing, say nothing. */
  | { kind: 'unchanged' }
  | { kind: 'updated'; content: McpStructuredContent }
  /** The server says it does not exist (or is not reachable) any more: show that, not stale data. */
  | { kind: 'gone'; message: string }
  /** Could not ask or got no usable answer: keep what is shown. */
  | { kind: 'failed'; message: string };

/** What the view shows: for an issue, the issue (a write's `changes` line is a message, not data). */
const shownPart = (content: McpStructuredContent) => (content.view === 'issue-detail' ? content.issue : content);

/**
 * Fields that are not shown: who the answer was read for. A result made before
 * it existed has none, so it must not make an unchanged card look updated.
 */
const NOT_SHOWN = new Set(['viewerId']);

/**
 * The data with key order and empty fields (null or absent) made irrelevant:
 * hosts hand the card a re-serialized copy of the original result (claude.ai
 * drops null fields and may reorder keys), which is the same data.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v === null || v === undefined || NOT_SHOWN.has(key)) continue;
    out[key] = canonical(v);
  }
  return out;
}

const sameData = (a: McpStructuredContent, b: McpStructuredContent) =>
  JSON.stringify(canonical(shownPart(a))) === JSON.stringify(canonical(shownPart(b)));

/** Is `next` the same kind of result as `current` (an issue list for a list, the same issue for an issue)? */
function sameKind(current: McpStructuredContent, next: McpStructuredContent): boolean {
  if (current.view !== next.view) return false;
  if (current.view === 'issue-detail' && next.view === 'issue-detail') return current.issue.id === next.issue.id;
  if (current.view === 'issue-list' && next.view === 'issue-list') return ('notifications' in current) === ('notifications' in next);
  if (current.view === 'project-overview' && next.view === 'project-overview') return current.project.id === next.project.id;
  return true;
}

/** "Issue "X" not found" and "Project "X" not found": the server's answer for a missing or unreachable thing (access.ts). */
const NOT_FOUND = /\bnot found\b/i;

/** Make the planned call and say what the answer means for the card on screen. */
export async function runRefresh(current: McpStructuredContent, plan: ToolCall, call: CallFn): Promise<RefreshResult> {
  if (!READ_TOOLS.has(plan.tool)) return { kind: 'failed', message: 'Not a read tool.' };
  const outcome = await call(plan.tool, plan.args);
  if (!outcome.ok) {
    if (outcome.refused && NOT_FOUND.test(outcome.text)) return { kind: 'gone', message: outcome.text };
    return { kind: 'failed', message: outcome.text || 'Could not refresh.' };
  }
  const next = outcome.content;
  if (!next || !sameKind(current, next)) return { kind: 'failed', message: 'The server answered with something else.' };
  return sameData(current, next) ? { kind: 'unchanged' } : { kind: 'updated', content: next };
}
