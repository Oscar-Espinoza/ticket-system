// Tool output: compact Markdown for the model and text-only hosts (`content`),
// and the typed objects from ./contracts.ts (`structuredContent`). Issue and
// comment text is user content: it is passed through as data, never as
// instructions (the server `instructions` say so), and truncated so a result
// stays well under the hosts' limits (Claude ~150k chars, Claude Code 25k
// tokens).

import type { CallToolResult } from '@modelcontextprotocol/server';

import { toDateString } from '@/lib/dates';
import { absoluteIssueUrl, appUrl } from '@/lib/integrations/app-url';
import { PRIORITY_LABEL, type IssueRow } from '@/lib/issue-model';
import type { TimelineComment } from '@/lib/timeline';
import type {
  CommentView,
  IssueSummary,
  McpStructuredContent,
  ProjectRef,
  StateRef,
} from './contracts';

const EXCERPT_MAX = 200;
const DESCRIPTION_MAX = 12_000;
const COMMENT_MAX = 2_000;

export function truncate(text: string | null | undefined, max: number): string | null {
  if (text == null) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export function projectRef(project: { id: string; key: string; name: string }): ProjectRef {
  return { id: project.id, key: project.key, name: project.name };
}

export function projectUrl(projectId: string): string {
  return `${appUrl()}/dashboard/projects/${projectId}`;
}

export function stateRef(state: { id: string; name: string; type: string; color: string }): StateRef {
  return { id: state.id, name: state.name, type: state.type, color: state.color };
}

export function summarizeIssue(issue: IssueRow, project: ProjectRef, snippet?: string | null): IssueSummary {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    project,
    state: stateRef(issue.state),
    priority: issue.priority,
    assignee: issue.assignee ? { id: issue.assignee.id, name: issue.assignee.name } : null,
    waitingOn: issue.waitingOn ? { id: issue.waitingOn.id, name: issue.waitingOn.name } : null,
    labels: issue.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    estimate: issue.estimate,
    dueDate: issue.dueDate,
    followUp: issue.followUp,
    updatedAt: issue.updatedAt.toISOString(),
    url: absoluteIssueUrl(issue.projectId, issue.key),
    excerpt: truncate(issue.description ? oneLine(issue.description) : null, EXCERPT_MAX),
    ...(snippet !== undefined && { snippet }),
  };
}

export function commentView(comment: TimelineComment): CommentView {
  return {
    id: comment.id,
    parentId: comment.parentId,
    author: comment.author ? { id: comment.author.id, name: comment.author.name } : null,
    body: truncate(comment.body, COMMENT_MAX) ?? '',
    createdAt: comment.createdAt.toISOString(),
  };
}

export const descriptionText = (text: string | null) => truncate(text, DESCRIPTION_MAX);

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/**
 * Whether a follow-up date has arrived, by the server's date (like the
 * follow-up notification and the `follow_up=overdue|today` filters).
 */
export const isFollowUpDue = (followUp: string, now = new Date()) => followUp <= toDateString(now);

/** `follow-up due 2026-11-10` once the date has arrived, `follow up 2026-11-20` before. */
const followUpText = (followUp: string) => (isFollowUpDue(followUp) ? `follow-up due ${followUp}` : `follow up ${followUp}`);

/** `- **WEB-12** Fix login — In Progress · High · Ana · waiting on Grace · due 2026-11-20 · follow up 2026-11-18 · bug` */
export function issueLine(issue: IssueSummary): string {
  const parts = [issue.state.name];
  if (issue.priority !== 'none') parts.push(PRIORITY_LABEL[issue.priority as keyof typeof PRIORITY_LABEL] ?? issue.priority);
  parts.push(issue.assignee ? issue.assignee.name : 'Unassigned');
  if (issue.waitingOn) parts.push(`waiting on ${issue.waitingOn.name}`);
  if (issue.dueDate) parts.push(`due ${issue.dueDate}`);
  if (issue.followUp) parts.push(followUpText(issue.followUp));
  if (issue.estimate != null) parts.push(`${issue.estimate} pt`);
  if (issue.labels.length) parts.push(issue.labels.map((l) => l.name).join(', '));
  let line = `- **${issue.key}** ${oneLine(issue.title)} — ${parts.join(' · ')}`;
  if (issue.snippet) line += `\n  > ${oneLine(issue.snippet)}`;
  return line;
}

/**
 * User-written text (descriptions, comment bodies) as a fenced block the text
 * can't close or escape: the fence is longer than any backtick run inside it,
 * so the model can tell where the data ends and our output resumes.
 */
export function userContentBlock(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}user-content\n${text}\n${fence}`;
}

export function issueListMarkdown(title: string, issues: IssueSummary[], nextCursor: string | null): string {
  if (issues.length === 0) return `${title}: no issues.`;
  const lines = [`${title} (${issues.length}${nextCursor ? ', more available' : ''}):`, ...issues.map(issueLine)];
  if (nextCursor) lines.push(`\nNext page: cursor "${nextCursor}".`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export function toolResult(text: string, structured: McpStructuredContent): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured as unknown as Record<string, unknown>,
  };
}

export function toolError(text: string, meta?: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true, ...(meta && { _meta: meta }) };
}

// Cursor = a non-negative offset, opaque to the model.
export function encodeOffset(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

export function decodeOffset(cursor: string | null | undefined): number | null {
  if (!cursor) return 0;
  const raw = Buffer.from(cursor, 'base64url').toString();
  const match = /^o:(\d{1,7})$/.exec(raw);
  return match ? Number(match[1]) : null;
}
