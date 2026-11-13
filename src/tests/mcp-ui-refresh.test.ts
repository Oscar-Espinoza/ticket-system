// Refreshing a card from the server (src/mcp-ui/lib/refresh.ts): which read to
// make for which view, when not to make it at all, and what an answer means.
// A host that reloads a chat shows the ORIGINAL tool result again, so the card
// asks again with a read; it must never repeat a write.
import { describe, expect, it, vi } from 'vitest';

import type { IssueDetail, IssueDetailView, IssueListView, McpStructuredContent, ProjectOverviewView } from '@/lib/server/mcp/contracts';
import { isStale, planRefresh, READ_TOOLS, refreshCall, runRefresh } from '../mcp-ui/lib/refresh';
import type { CallFn, ToolOutcome } from '../mcp-ui/lib/write.svelte';

const issue = (state = 'Todo'): IssueDetail =>
  ({ id: 'i1', key: 'WEB-3', title: 'Fix', state: { id: 's', name: state, type: 'unstarted', color: '#888888' }, comments: [] }) as unknown as IssueDetail;

const detail = (state = 'Todo', changes?: string[]): IssueDetailView => ({ view: 'issue-detail', issue: issue(state), ...(changes && { changes }) });
const list = (source: IssueListView['source'], titles = ['A']): IssueListView => ({
  view: 'issue-list',
  title: 'Issues',
  issues: titles.map((t, i) => ({ id: `i${i}`, key: `WEB-${i}`, title: t }) as never),
  nextCursor: null,
  source,
});
const overview = (mode: 'project' | 'cycle', cycleId: string | null): ProjectOverviewView =>
  ({
    view: 'project-overview',
    mode,
    project: { id: 'p1', key: 'WEB', name: 'Web', url: 'http://x' },
    countsByStateType: {},
    cycle: cycleId ? { id: cycleId } : null,
    issues: [],
  }) as unknown as ProjectOverviewView;

const ok = (content: McpStructuredContent): ToolOutcome => ({ ok: true, content, text: 'ok' });

describe('refreshCall: which read for which view', () => {
  it('re-reads an issue with get_issue, whichever tool produced it (never the write again)', () => {
    for (const content of [detail(), detail('Done', ['state: Todo → Done']), detail('Todo', ['comment added'])]) {
      expect(refreshCall(content)).toEqual({ tool: 'get_issue', args: { key: 'WEB-3' } });
    }
  });

  it('repeats a paged list with the arguments its source carries, without the cursor', () => {
    expect(refreshCall(list({ tool: 'list_issues', arguments: { project: 'WEB', state: 'started', limit: 10 } }))).toEqual({
      tool: 'list_issues',
      args: { project: 'WEB', state: 'started', limit: 10 },
    });
    expect(refreshCall(list({ tool: 'my_work', arguments: {} }))).toEqual({ tool: 'my_work', args: {} });
    expect(refreshCall(list({ tool: 'list_inbox', arguments: { unread_only: true, cursor: 'x' } }))).toEqual({ tool: 'list_inbox', args: { unread_only: true } });
  });

  it('skips a list it cannot safely repeat: no source (search), or a source naming any other tool', () => {
    expect(refreshCall(list(null))).toBeNull();
    expect(refreshCall(list(undefined))).toBeNull();
    expect(refreshCall(list({ tool: 'update_issue', arguments: { key: 'WEB-3', state: 'x' } } as never))).toBeNull();
  });

  it('reads an overview with get_project_overview, a cycle with get_cycle, projects with list_projects', () => {
    expect(refreshCall(overview('project', null))).toEqual({ tool: 'get_project_overview', args: { project: 'WEB' } });
    expect(refreshCall(overview('cycle', 'c1'))).toEqual({ tool: 'get_cycle', args: { project: 'WEB', cycle: 'c1' } });
    expect(refreshCall(overview('cycle', null))).toBeNull();
    expect(refreshCall({ view: 'project-list', projects: [] })).toEqual({ tool: 'list_projects', args: {} });
  });

  it('has nothing for metadata or no content, and only ever names a read tool', () => {
    expect(refreshCall({ view: 'project-metadata' } as McpStructuredContent)).toBeNull();
    expect(refreshCall(null)).toBeNull();
    for (const content of [detail(), list({ tool: 'my_work', arguments: {} }), overview('project', null), overview('cycle', 'c1'), { view: 'project-list', projects: [] } as McpStructuredContent]) {
      expect(READ_TOOLS.has(refreshCall(content)!.tool)).toBe(true);
    }
  });
});

describe('planRefresh: when not to ask', () => {
  const content = detail();
  it('asks when the host forwards tools and the user is not mid-edit', () => {
    expect(planRefresh(content, { canCallTools: true, holding: false })).not.toBeNull();
  });
  it('does not ask without server tools', () => {
    expect(planRefresh(content, { canCallTools: false, holding: false })).toBeNull();
  });
  it('does not ask while the user holds the card (a draft comment, a write in flight, more pages loaded)', () => {
    expect(planRefresh(content, { canCallTools: true, holding: true })).toBeNull();
  });
});

describe('isStale: an answer that arrives after the card moved on', () => {
  const started = { loadId: 3, writes: 1 };
  it('is fresh when nothing happened meanwhile', () => {
    expect(isStale(started, { loadId: 3, writes: 1, holds: 0 })).toBe(false);
  });
  it('is stale after a newer tool result, a write result, or when the user started a draft', () => {
    expect(isStale(started, { loadId: 4, writes: 1, holds: 0 })).toBe(true);
    expect(isStale(started, { loadId: 3, writes: 2, holds: 0 })).toBe(true);
    expect(isStale(started, { loadId: 3, writes: 1, holds: 1 })).toBe(true);
  });
});

describe('runRefresh: what the answer means', () => {
  const plan = { tool: 'get_issue', args: { key: 'WEB-3' } };
  const run = (current: McpStructuredContent, answer: ToolOutcome) => {
    const call = vi.fn<CallFn>(async () => answer);
    return { result: runRefresh(current, plan, call), call };
  };

  it('is unchanged when the server shows the same data (a write\'s "changes" line does not count)', async () => {
    await expect(run(detail('Todo', ['comment added']), ok(detail('Todo'))).result).resolves.toEqual({ kind: 'unchanged' });
  });

  // Live test 3 (2026-11-13): claude.ai showed "Updated to the latest." on an
  // unchanged card. The host hands the card a re-serialized copy of the result
  // (null fields dropped, keys reordered), and an older result has no viewerId.
  it('is unchanged for a re-serialized copy: reordered keys, dropped nulls, no viewerId', async () => {
    const shown = detail('Todo');
    const reserialized = JSON.parse(JSON.stringify(shown, (_k, v) => (v === null ? undefined : v)));
    reserialized.issue = Object.fromEntries(Object.entries(reserialized.issue).reverse());
    delete reserialized.issue.viewerId;
    const fresh = { ...detail('Todo'), issue: { ...detail('Todo').issue, viewerId: 'u-me' } };
    await expect(run(reserialized, ok(fresh)).result).resolves.toEqual({ kind: 'unchanged' });
  });

  it('is updated with the newer content', async () => {
    const newer = detail('Done');
    await expect(run(detail('Todo'), ok(newer)).result).resolves.toEqual({ kind: 'updated', content: newer });
    const { result, call } = run(list({ tool: 'my_work', arguments: {} }, ['A']), ok(list({ tool: 'my_work', arguments: {} }, ['A', 'B'])));
    await expect(result).resolves.toMatchObject({ kind: 'updated' });
    expect(call).toHaveBeenCalledWith('get_issue', { key: 'WEB-3' });
  });

  it('is gone when the server says the thing is not found, and shows its message', async () => {
    const answer: ToolOutcome = { ok: false, refused: true, content: null, text: 'Issue "WEB-3" not found. Issue keys look like WEB-123.' };
    await expect(run(detail(), answer).result).resolves.toEqual({ kind: 'gone', message: answer.text });
  });

  it('keeps the content on any other failure: server error, transport error, no answer, another kind of result', async () => {
    const failures: ToolOutcome[] = [
      { ok: false, refused: true, content: null, text: 'Something went wrong on the server. Try again in a moment.' },
      { ok: false, content: null, text: 'Too many requests: slow down and retry in 5 s.' },
      { ok: false, content: null, text: 'The host did not answer in time.', indeterminate: true },
      ok({ view: 'project-list', projects: [] }),
      ok({ ...detail(), issue: { ...issue(), id: 'other' } }),
      { ok: true, content: null, text: 'text only' },
    ];
    for (const answer of failures) {
      await expect(run(detail(), answer).result).resolves.toMatchObject({ kind: 'failed' });
    }
  });

  it('does not call anything that is not a read tool', async () => {
    const call = vi.fn<CallFn>(async () => ok(detail()));
    await expect(runRefresh(detail(), { tool: 'update_issue', args: { key: 'WEB-3', state: 'x' } }, call)).resolves.toMatchObject({ kind: 'failed' });
    expect(call).not.toHaveBeenCalled();
  });
});
