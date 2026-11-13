// A write from the issue view (src/mcp-ui/lib/write.svelte.ts): one at a time,
// a refusal keeps the draft, a committed write whose details could not be
// loaded is still "saved", and a write the host never answered cannot be sent
// again until the issue has been read to see whether it happened.
import { describe, expect, it, vi } from 'vitest';

import type { IssueDetail } from '@/lib/server/mcp/contracts';
import { IssueWriter, newRequestId, requestFor, type CallFn, type ToolOutcome, type WriteSpec } from '../mcp-ui/lib/write.svelte';

const issueWith = (comments: string[] = []) =>
  ({ id: 'i1', key: 'WEB-3', comments: comments.map((id) => ({ id, body: 'x' })), assignee: null, state: { id: 's1' } }) as unknown as IssueDetail;

const detail = (issue: IssueDetail, changes: string[] = ['comment added']): ToolOutcome => ({
  ok: true,
  text: 'Comment added',
  content: { view: 'issue-detail', issue, changes },
});
const textOnly = (text: string): ToolOutcome => ({ ok: true, text, content: null });
const refused = (text: string): ToolOutcome => ({ ok: false, text, content: null });
const noAnswer: ToolOutcome = { ok: false, text: 'The host did not answer in time.', content: null, indeterminate: true };

function setup(answers: ToolOutcome[]) {
  const queue = [...answers];
  const call = vi.fn<CallFn>(async () => queue.shift() ?? refused('unexpected call'));
  const onIssue = vi.fn();
  const onChange = vi.fn();
  const writer = new IssueWriter({ call, issueKey: () => 'WEB-3', onIssue, onChange });
  return { writer, call, onIssue, onChange };
}

const commentSpec = (requestId = 'req-1', onSaved = vi.fn()): WriteSpec => ({
  tool: 'add_comment',
  args: { body: 'hello', request_id: requestId },
  label: 'Posting…',
  summary: 'comment added',
  applied: (issue) => issue.comments.some((c) => c.id === requestId),
  onSaved,
});

describe('IssueWriter', () => {
  it('sends one write at a time', async () => {
    let finish!: (value: ToolOutcome) => void;
    const pending = new Promise<ToolOutcome>((resolve) => (finish = resolve));
    const { writer, call } = setup([]);
    call.mockReturnValueOnce(pending);
    const first = writer.write(commentSpec());
    expect(writer.busy).toBe('Posting…');
    await expect(writer.write(commentSpec('req-2'))).resolves.toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
    finish(detail(issueWith(['req-1'])));
    await expect(first).resolves.toBe(true);
    expect(writer.busy).toBeNull();
  });

  it('keeps the draft when the server refuses', async () => {
    const onSaved = vi.fn();
    const { writer, onIssue } = setup([refused('Your connection is read-only.')]);
    await expect(writer.write(commentSpec('req-1', onSaved))).resolves.toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onIssue).not.toHaveBeenCalled();
    expect(writer.status).toEqual({ kind: 'error', text: 'Your connection is read-only.' });
    expect(writer.unconfirmed).toBeNull();
  });

  it('shows a saved write as saved when the server committed but sent no details, then refreshes through get_issue', async () => {
    const onSaved = vi.fn();
    const after = issueWith(['req-1']);
    let finishRefresh!: (value: ToolOutcome) => void;
    const { writer, call, onIssue, onChange } = setup([]);
    // The write answers with text only; then the refresh (get_issue) is held back by the test.
    call.mockResolvedValueOnce(textOnly('Comment added to WEB-3 (issue id i1). The details could not be shown here.'));
    call.mockReturnValueOnce(new Promise<ToolOutcome>((resolve) => (finishRefresh = resolve)));

    await expect(writer.write(commentSpec('req-1', onSaved))).resolves.toBe(true);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(writer.busy).toBeNull();
    expect(writer.status).toEqual({ kind: 'ok', text: expect.stringContaining('Comment added to WEB-3') });
    expect(onChange).toHaveBeenCalledWith('WEB-3', ['comment added']);
    expect(onIssue).not.toHaveBeenCalled(); // no issue yet

    finishRefresh(detail(after));
    await vi.waitFor(() => expect(onIssue).toHaveBeenCalledExactlyOnceWith(after));
    expect(call.mock.calls[1]).toEqual(['get_issue', { key: 'WEB-3' }]);
    expect(writer.status).toEqual({ kind: 'ok', text: 'Done: comment added.' });
  });

  it('still says saved, and passes no issue on, when the refresh fails too', async () => {
    const { writer, onIssue } = setup([textOnly('Comment added to WEB-3.'), refused('boom')]);
    await expect(writer.write(commentSpec())).resolves.toBe(true);
    await vi.waitFor(() => expect(writer.status?.kind).toBe('ok'));
    expect(onIssue).not.toHaveBeenCalled();
    expect(writer.status?.text).toBe('Comment added to WEB-3.');
  });

  it('after a timeout reads the issue, treats a comment that is there as saved and clears the draft', async () => {
    const onSaved = vi.fn();
    const after = issueWith(['req-1']);
    const { writer, call, onIssue } = setup([noAnswer, detail(after, [])]);
    await expect(writer.write(commentSpec('req-1', onSaved))).resolves.toBe(true);
    expect(call.mock.calls.map((c) => c[0])).toEqual(['add_comment', 'get_issue']);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onIssue).toHaveBeenCalledWith(after);
    expect(writer.unconfirmed).toBeNull();
    expect(writer.busy).toBeNull();
  });

  it('after a timeout where the comment is not there, keeps the draft and allows sending it again', async () => {
    const onSaved = vi.fn();
    const { writer, call } = setup([noAnswer, detail(issueWith([]), []), detail(issueWith(['req-1']))]);
    await expect(writer.write(commentSpec('req-1', onSaved))).resolves.toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(writer.unconfirmed).toBeNull();
    expect(writer.status?.kind).toBe('error');
    // The resend carries the same request_id, so the server can't post it twice.
    await expect(writer.write(commentSpec('req-1', onSaved))).resolves.toBe(true);
    expect(call.mock.calls[2]).toEqual(['add_comment', { key: 'WEB-3', body: 'hello', request_id: 'req-1' }]);
  });

  it('cannot send anything while a timed-out write could not be checked, until a check settles it', async () => {
    const onSaved = vi.fn();
    const { writer, call } = setup([noAnswer, noAnswer, detail(issueWith(['req-1']), [])]);
    await expect(writer.write(commentSpec('req-1', onSaved))).resolves.toBe(false);
    expect(writer.unconfirmed).not.toBeNull();
    await expect(writer.write(commentSpec('req-2'))).resolves.toBe(false);
    expect(call).toHaveBeenCalledTimes(2); // add_comment, get_issue: the second write was never sent
    expect(writer.status?.kind).toBe('error'); // the check itself timed out
    await expect(writer.check()).resolves.toBe(true);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(writer.unconfirmed).toBeNull();
  });

  it('settles an unconfirmed field change by its value, not by a comment id', async () => {
    const stateSpec: WriteSpec = {
      tool: 'update_issue',
      args: { state: 's2' },
      label: 'Moving…',
      summary: 'state changed',
      applied: (issue) => issue.state.id === 's2',
    };
    const moved = { ...issueWith(), state: { id: 's2' } } as unknown as IssueDetail;
    const { writer } = setup([noAnswer, detail(moved, [])]);
    await expect(writer.write(stateSpec)).resolves.toBe(true);
  });
});

describe('newRequestId', () => {
  it('makes a v4 UUID, also where randomUUID is missing', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(255) });
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.unstubAllGlobals();
  });
});

describe('requestFor', () => {
  it('keeps the id for the same text and mints a new one once the draft was edited after a send', () => {
    const first = requestFor(null, 'A');
    expect(requestFor(first, 'A').id).toBe(first.id);
    expect(requestFor(first, 'B').id).not.toBe(first.id);
  });
});
