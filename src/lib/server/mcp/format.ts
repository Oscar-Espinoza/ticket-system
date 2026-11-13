// Tool output: compact Markdown for the model (`content`), complete on its own
// because clients that don't render views get only that (./ui.ts resultFor),
// and the typed objects from ./contracts.ts (`structuredContent`). Issue and
// comment text is user content: it is passed through as data, never as
// instructions (the server `instructions` say so), and truncated so a result
// stays well under the hosts' limits (Claude ~150k chars, Claude Code 25k
// tokens).

import type { CallToolResult } from '@modelcontextprotocol/server';

import { toDateString } from '@/lib/dates';
import { absoluteIssueUrl, appUrl } from '@/lib/integrations/app-url';
import { PRIORITY_LABEL, type IssueRow, type StateType } from '@/lib/issue-model';
import { isClosed } from '@/lib/workflow';
import type { TimelineComment } from '@/lib/timeline';
import type {
  CommentView,
  IssueSummary,
  McpStructuredContent,
  ProjectRef,
  StateRef,
  UserRef,
} from './contracts';

const EXCERPT_MAX = 200;
const DESCRIPTION_MAX = 12_000;
const COMMENT_MAX = 2_000;

export function truncate(text: string | null | undefined, max: number): string | null {
  if (text == null) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Longest run of backticks in `text`, counted in one pass (no spread over a match array of unbounded size). */
function longestBacktickRun(text: string): number {
  let longest = 0;
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    run = text.charCodeAt(i) === 96 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

/** Hard cap on one inline value (a title, a name, a snippet) in text results. */
export const INLINE_MAX = 300;
/** Hard cap on one block of user content in text results (descriptions are cut to 12,000 before this). */
const BLOCK_MAX = DESCRIPTION_MAX;

/**
 * Characters and forms that make text Markdown: emphasis, code, links, HTML,
 * headings, tables, escapes, and what GFM turns into links on its own (bare
 * URLs, `www.` hosts, email addresses), and text that would start a block
 * where it begins a line (`===`/`---` underlines, `-`/`+`/`1.` list markers).
 */
const MARKUP = /[`*_[\]<>#|~\\]|[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\S@\S|^\s*(?:[=+-]|\d+[.)](?:\s|$))/i;

/**
 * Short user-written text (a title, a person's name, a search snippet) inert
 * on one line: whitespace collapsed, cut to INLINE_MAX, and, when it contains
 * Markdown, inside a code span longer than any backtick run in it, so it can't
 * close the span, open a block or restyle our output. Plain text stays as it
 * is to keep list rows compact. Multi-line text (descriptions, comment bodies)
 * goes through userContentBlock instead.
 */
export function userContentInline(text: string): string {
  // Cut before any other work: a name can be hundreds of thousands of characters.
  const line = truncate(oneLine(text.slice(0, INLINE_MAX * 4)), INLINE_MAX) ?? '';
  if (!MARKUP.test(line)) return line;
  const fence = '`'.repeat(longestBacktickRun(line) + 1);
  // CommonMark drops one space on each side, so a leading or trailing backtick stays content.
  return `${fence} ${line} ${fence}`;
}

export function projectRef(project: { id: string; key: string; name: string }): ProjectRef {
  return { id: project.id, key: project.key, name: project.name };
}

export function projectUrl(projectId: string): string {
  return `${appUrl()}/dashboard/projects/${projectId}`;
}

/**
 * A person as the views see them: id and name. No avatar: the view draws
 * initials (an image URL is typed by the user, and the view's CSP allows no
 * image source, so none could load).
 */
export function userRef(user: { id: string; name: string }): UserRef {
  return { id: user.id, name: user.name };
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
    assignee: issue.assignee ? userRef(issue.assignee) : null,
    waitingOn: issue.waitingOn ? userRef(issue.waitingOn) : null,
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
    author: comment.author ? userRef(comment.author) : null,
    body: truncate(comment.body, COMMENT_MAX) ?? '',
    createdAt: comment.createdAt.toISOString(),
  };
}

export const descriptionText = (text: string | null) => truncate(text, DESCRIPTION_MAX);

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/**
 * Whether an issue's follow-up is due: an open issue whose date has arrived by
 * the server's date (like the follow-up notification, and the `overdue`
 * filter, which covers open issues only).
 */
export const isFollowUpDue = (issue: Pick<IssueSummary, 'followUp' | 'state'>, now = new Date()) =>
  issue.followUp != null && !isClosed(issue.state.type as StateType) && issue.followUp <= toDateString(now);

/** `follow-up due 2026-11-10` when due, `follow up 2026-11-20` otherwise. */
const followUpText = (issue: IssueSummary) => `${isFollowUpDue(issue) ? 'follow-up due' : 'follow up'} ${issue.followUp}`;

/** `- **WEB-12** Fix login — In Progress · High · Ana · waiting on Grace · due 2026-11-20 · follow up 2026-11-18 · bug · <url>` */
export function issueLine(issue: IssueSummary): string {
  const parts = [userContentInline(issue.state.name)];
  if (issue.priority !== 'none') parts.push(PRIORITY_LABEL[issue.priority as keyof typeof PRIORITY_LABEL] ?? issue.priority);
  parts.push(issue.assignee ? userContentInline(issue.assignee.name) : 'Unassigned');
  if (issue.waitingOn) parts.push(`waiting on ${userContentInline(issue.waitingOn.name)}`);
  if (issue.dueDate) parts.push(`due ${issue.dueDate}`);
  if (issue.followUp) parts.push(followUpText(issue));
  if (issue.estimate != null) parts.push(`${issue.estimate} pt`);
  if (issue.labels.length) parts.push(labelList(issue.labels));
  parts.push(issue.url);
  let line = `- **${issue.key}** ${userContentInline(issue.title)} — ${parts.join(' · ')}`;
  if (issue.snippet) line += `\n  > ${userContentInline(issue.snippet)}`;
  return line;
}

/** Label names (written by people) kept inert, comma-separated. */
export const labelList = (labels: { name: string }[]) => labels.map((l) => userContentInline(l.name)).join(', ');

/**
 * User-written text (descriptions, comment bodies) as a fenced block the text
 * can't close or escape: the fence is longer than any backtick run inside it,
 * so the model can tell where the data ends and our output resumes.
 */
export function userContentBlock(text: string): string {
  const body = truncate(text, BLOCK_MAX) ?? '';
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(body) + 1));
  return `${fence}user-content\n${body}\n${fence}`;
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
