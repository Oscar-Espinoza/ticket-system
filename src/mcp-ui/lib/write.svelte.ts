// A write from the issue view (update_issue, add_comment) and what happens when
// the answer is not a plain "saved" or "refused":
// - the server committed but could not load the details afterwards: it answers
//   with a success and text only (tools/write.ts `committed`), which is saved,
//   not "Not saved" (the user would post it again);
// - the host did not answer in time: the write may have run, so the view
//   asks the server (get_issue) whether it did before it allows another try.
//   `applied` says how to tell from the issue (a comment by the id the view
//   sent as `request_id`; a state or assignee that now has the wanted value);
//   if the check itself fails, the write stays "unconfirmed" and only "Check
//   again" is offered.
// The comment's `request_id` makes a resend of the same draft safe on the
// server as well (tools/write.ts add_comment).

import type { IssueDetail, McpStructuredContent } from '@/lib/server/mcp/contracts';

/** What `callTool` (app.svelte.ts) answers. */
export interface ToolOutcome {
  ok: boolean;
  content: McpStructuredContent | null;
  text: string;
  indeterminate?: boolean;
  /** The server answered with a tool error (as opposed to a transport failure or no answer). */
  refused?: boolean;
}
export type CallFn = (tool: string, args: Record<string, unknown>) => Promise<ToolOutcome>;

export interface WriteSpec {
  tool: 'update_issue' | 'add_comment';
  args: Record<string, unknown>;
  /** Shown while the call runs: "Posting…". */
  label: string;
  /** What was done, for the status line and the model: "comment added". */
  summary: string;
  /** Is the write visible in this issue? Used to settle an unconfirmed write. */
  applied: (issue: IssueDetail) => boolean;
  /** Called once the write is known to be saved (clear the draft). */
  onSaved?: () => void;
}

export interface WriterHooks {
  call: CallFn;
  issueKey: () => string;
  /** The issue as the server has it after a write (or a check). */
  onIssue: (issue: IssueDetail) => void;
  /** A change the user made, for the model's context (best effort). */
  onChange?: (issueKey: string, changes: string[]) => void;
}

export type Status = { kind: 'ok'; text: string } | { kind: 'error'; text: string; title?: string } | null;

const issueOf = (outcome: ToolOutcome): IssueDetail | null =>
  outcome.ok && outcome.content?.view === 'issue-detail' ? outcome.content.issue : null;

export class IssueWriter {
  busy = $state<string | null>(null);
  status = $state<Status>(null);
  /** A write that timed out and could not be checked yet: nothing else may be sent. */
  unconfirmed = $state<WriteSpec | null>(null);
  /** Counts every write, check and refresh: a refresh that finds the count moved on was overtaken and is dropped. */
  private step = 0;

  private hooks: WriterHooks;

  constructor(hooks: WriterHooks, initialStatus: Status = null) {
    this.hooks = hooks;
    this.status = initialStatus;
  }

  /** True when the write is saved. One write at a time; none while one is unconfirmed. */
  async write(spec: WriteSpec): Promise<boolean> {
    if (this.busy || this.unconfirmed) return false;
    this.busy = spec.label;
    this.status = null;
    this.step++;
    const key = this.hooks.issueKey();
    const outcome = await this.hooks.call(spec.tool, { key, ...spec.args });

    if (outcome.indeterminate) {
      this.unconfirmed = spec;
      return this.check();
    }
    if (!outcome.ok) {
      this.busy = null;
      this.status = { kind: 'error', text: outcome.text || 'The change was not saved.' };
      return false;
    }
    const issue = issueOf(outcome);
    if (issue) {
      const changes = outcome.content?.view === 'issue-detail' ? (outcome.content.changes ?? []) : [];
      this.hooks.onIssue(issue);
      this.saved(spec, changes);
      this.status = { kind: 'ok', text: changes.length ? `Done: ${changes.join('; ')}.` : 'No changes: already up to date.' };
      return true;
    }
    // Committed, but the server could not show the result: say so, then read the issue.
    this.saved(spec, [spec.summary]);
    this.status = { kind: 'ok', text: outcome.text || `${spec.summary}.` };
    void this.refresh(spec, this.step);
    return true;
  }

  /**
   * Settle an unconfirmed write: read the issue and see whether it is there.
   * Also what "Check again" runs.
   */
  async check(): Promise<boolean> {
    const spec = this.unconfirmed;
    if (!spec) return false;
    this.busy = 'Checking whether it was saved…';
    this.status = null;
    this.step++;
    const read = await this.hooks.call('get_issue', { key: this.hooks.issueKey() });
    const issue = issueOf(read);
    if (!issue) {
      this.busy = null;
      this.status = {
        kind: 'error',
        text: 'The host did not answer, and this could not be checked. It may have been saved; check again before sending it once more.',
      };
      return false;
    }
    this.unconfirmed = null;
    this.hooks.onIssue(issue);
    if (spec.applied(issue)) {
      this.saved(spec, [spec.summary]);
      this.status = { kind: 'ok', text: `Done: ${spec.summary}.` };
      return true;
    }
    this.busy = null;
    this.status = {
      kind: 'error',
      title: 'Not there yet',
      text: 'The host did not answer and the change is not there yet. It may still arrive; look again before you send it once more.',
    };
    return false;
  }

  /** After a result without details: show the issue as it is now, when it can be read. */
  private async refresh(spec: WriteSpec, started: number) {
    const issue = issueOf(await this.hooks.call('get_issue', { key: this.hooks.issueKey() }));
    // Another write or check started meanwhile: its answer is the newer one.
    if (!issue || started !== this.step) return;
    this.hooks.onIssue(issue);
    this.status = { kind: 'ok', text: `Done: ${spec.summary}.` };
  }

  private saved(spec: WriteSpec, changes: string[]) {
    this.busy = null;
    spec.onSaved?.();
    this.hooks.onChange?.(this.hooks.issueKey(), changes);
  }
}

/**
 * The request id to send `body` with. An id belongs to the exact text it was first sent with: the same text again
 * keeps it (a resend can't post twice), any other text gets a new one (the server answers an old id with the old comment).
 */
export function requestFor(sent: { id: string; body: string } | null, body: string): { id: string; body: string } {
  return sent && sent.body === body ? sent : { id: newRequestId(), body };
}

/** A fresh `request_id` for a comment draft (a v4 UUID; `randomUUID` only exists in secure contexts). */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
