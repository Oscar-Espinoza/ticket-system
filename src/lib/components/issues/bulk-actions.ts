// Actions that apply to one issue or to a whole selection, shared by the
// context menu, the bulk bar and the label toggles.

import { copyIssueId, copyIssueLink, copyToClipboard } from '@/lib/components/productivity/issue-actions';
import { issueUrl } from '@/lib/issue-links';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from './use-issue-mutations.svelte';

/** One issue → `update`; several → one `bulkUpdate` (one server call, one undo). */
export function applyPatch(mutations: IssueMutations, issues: IssueRow[], patch: IssuePatch) {
  if (issues.length === 1) mutations.update(issues[0], patch);
  else if (issues.length > 1) mutations.bulkUpdate(issues, patch);
}

/** The value every issue shares, or undefined when they differ. */
export function commonValue<T>(issues: IssueRow[], get: (issue: IssueRow) => T): T | undefined {
  if (issues.length === 0) return undefined;
  const first = get(issues[0]);
  return issues.every((issue) => get(issue) === first) ? first : undefined;
}

export type Coverage = 'all' | 'some' | 'none';

export function labelCoverage(issues: IssueRow[], labelId: string): Coverage {
  const count = issues.filter((i) => i.labels.some((l) => l.id === labelId)).length;
  return count === 0 ? 'none' : count === issues.length ? 'all' : 'some';
}

/** Add the label to every issue, or remove it from every issue when all have it. */
export function toggleLabel(mutations: IssueMutations, issues: IssueRow[], labelId: string) {
  const all = labelCoverage(issues, labelId) === 'all';
  applyPatch(mutations, issues, all ? { removeLabelIds: [labelId] } : { addLabelIds: [labelId] });
}

/** Copy one issue's key or a comma-separated list. */
export function copyIds(issues: IssueRow[]) {
  if (issues.length === 1) return copyIssueId(issues[0]);
  return copyToClipboard(issues.map((i) => i.key).join(', '), `${issues.length} IDs`);
}

export function copyLinks(issues: IssueRow[]) {
  if (issues.length === 1) return copyIssueLink(issues[0]);
  return copyToClipboard(issues.map((i) => issueUrl(i.projectId, i.key)).join('\n'), `${issues.length} links`);
}
