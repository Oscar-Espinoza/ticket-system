// The issue-detail payload shared by get_issue and the write tools: the issue,
// its newest comments, sub-issues, relations, cycle and epic. Everything is
// read within the issue's own project (listIssueRelations only returns
// relations inside it), which ./access.ts already cleared.

import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { cycles, epics, tickets } from '@/db/schema';
import { loadIssueTimeline } from '@/lib/comments';
import type { IssueRow } from '@/lib/issue-model';
import { listIssueRelations } from '@/lib/relations';
import { getTicketById, queryIssues } from '@/lib/tickets';
import type { McpProject } from '../access';
import type { IssueDetail } from '../contracts';
import { commentView, descriptionText, projectRef, stateRef, summarizeIssue, truncate, userContentBlock } from '../format';

export const COMMENTS_DEFAULT = 5;
export const COMMENTS_MAX = 20;
const SUB_ISSUES_MAX = 50;

export async function issueDetail(
  issue: IssueRow,
  project: McpProject,
  commentLimit = COMMENTS_DEFAULT,
): Promise<IssueDetail> {
  const [timeline, relations, subIssues, parent, cycleRow, epicRow] = await Promise.all([
    loadIssueTimeline(issue.projectId, issue.id),
    listIssueRelations(issue.projectId, issue.id),
    queryIssues(and(eq(tickets.projectId, issue.projectId), eq(tickets.parentId, issue.id), isNull(tickets.deletedAt)), {
      orderBy: [asc(tickets.ticketNumber)],
      limit: SUB_ISSUES_MAX,
    }),
    issue.parentId ? getTicketById(issue.projectId, issue.parentId) : null,
    issue.cycleId
      ? db
          .select({ id: cycles.id, number: cycles.number, name: cycles.name })
          .from(cycles)
          .where(and(eq(cycles.id, issue.cycleId), eq(cycles.projectId, issue.projectId)))
          .limit(1)
      : [],
    issue.epicId
      ? db
          .select({ id: epics.id, name: epics.name })
          .from(epics)
          .where(and(eq(epics.id, issue.epicId), eq(epics.projectId, issue.projectId)))
          .limit(1)
      : [],
  ]);

  const comments = timeline.comments;
  const ref = (row: IssueRow) => ({ id: row.id, key: row.key, title: row.title, state: stateRef(row.state) });
  return {
    ...summarizeIssue(issue, projectRef(project)),
    description: descriptionText(issue.description),
    creator: issue.creator ? { id: issue.creator.id, name: issue.creator.name } : null,
    cycle: cycleRow[0] ?? null,
    epic: epicRow[0] ?? null,
    parent: parent && !parent.deletedAt ? { id: parent.id, key: parent.key, title: parent.title } : null,
    subIssues: subIssues.map(ref),
    relations: relations.map((r) => ({ kind: r.kind, issue: ref(r.issue) })),
    comments: comments.slice(Math.max(0, comments.length - commentLimit)).map(commentView),
    commentCount: comments.length,
    archivedAt: issue.archivedAt?.toISOString() ?? null,
    deletedAt: issue.deletedAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
  };
}

const RELATION_TEXT: Record<string, string> = {
  blocks: 'blocks',
  blocked_by: 'blocked by',
  related: 'related to',
  duplicate_of: 'duplicate of',
  duplicated_by: 'duplicated by',
};

export function issueDetailMarkdown(detail: IssueDetail, changes?: string[]): string {
  const lines: string[] = [];
  if (changes?.length) lines.push(`Updated ${detail.key}: ${changes.join('; ')}.`, '');
  lines.push(`# ${detail.key}: ${detail.title}`);
  const facts = [
    `State: ${detail.state.name}`,
    `Priority: ${detail.priority}`,
    `Assignee: ${detail.assignee?.name ?? 'Unassigned'}`,
  ];
  if (detail.labels.length) facts.push(`Labels: ${detail.labels.map((l) => l.name).join(', ')}`);
  if (detail.estimate != null) facts.push(`Estimate: ${detail.estimate}`);
  if (detail.dueDate) facts.push(`Due: ${detail.dueDate}`);
  if (detail.cycle) facts.push(`Cycle: ${detail.cycle.number}${detail.cycle.name ? ` (${detail.cycle.name})` : ''}`);
  if (detail.epic) facts.push(`Epic: ${detail.epic.name}`);
  if (detail.parent) facts.push(`Parent: ${detail.parent.key}`);
  if (detail.archivedAt) facts.push('Archived');
  if (detail.deletedAt) facts.push('In trash');
  lines.push(facts.join(' · '), `Project: ${detail.project.name} (${detail.project.key}) · ${detail.url}`);
  lines.push('', detail.description?.trim() ? `Description:\n${userContentBlock(detail.description)}` : '_No description._');
  if (detail.subIssues.length) {
    lines.push('', '## Sub-issues', ...detail.subIssues.map((s) => `- **${s.key}** ${s.title} — ${s.state.name}`));
  }
  if (detail.relations.length) {
    lines.push(
      '',
      '## Relations',
      ...detail.relations.map((r) => `- ${RELATION_TEXT[r.kind] ?? r.kind} **${r.issue.key}** ${r.issue.title} — ${r.issue.state.name}`),
    );
  }
  if (detail.commentCount) {
    const shown = detail.comments.length;
    lines.push('', `## Comments (${shown === detail.commentCount ? shown : `last ${shown} of ${detail.commentCount}`})`);
    for (const c of detail.comments) {
      lines.push(`**${c.author?.name ?? 'Deleted user'}** (${c.createdAt.slice(0, 10)}):`, userContentBlock(truncate(c.body, 600) ?? ''));
    }
  }
  return lines.join('\n');
}
