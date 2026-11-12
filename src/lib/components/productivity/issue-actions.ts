// Small issue actions shared by the shortcuts, the palette and the `…` menu.

import { copyToClipboard } from '@/lib/components/clipboard';
import { issueUrl } from '@/lib/issue-links';
import type { CreateIssueInput, IssueRow } from '@/lib/issue-model';

export const copyIssueId = (issue: IssueRow) => copyToClipboard(issue.key, issue.key);

export const copyIssueLink = (issue: IssueRow) =>
  copyToClipboard(issueUrl(issue.projectId, issue.key), 'link');

export const copyIssueMarkdown = (issue: IssueRow) =>
  copyToClipboard(
    `[${issue.key}: ${issue.title.replace(/[[\]]/g, '\\$&')}](${issueUrl(issue.projectId, issue.key)})`,
    'markdown link',
  );

/** Everything needed to recreate `issue` as a new one (same text + properties). */
export function duplicateInput(issue: IssueRow): CreateIssueInput {
  return {
    title: issue.title,
    description: issue.description,
    stateId: issue.stateId,
    priority: issue.priority,
    estimate: issue.estimate,
    dueDate: issue.dueDate,
    followUp: issue.followUp,
    assigneeId: issue.assignee?.id ?? null,
    waitingOnId: issue.waitingOn?.id ?? null,
    labelIds: issue.labels.map((l) => l.id),
    parentId: issue.parentId,
    cycleId: issue.cycleId,
    epicId: issue.epicId,
    milestoneId: issue.milestoneId,
  };
}
