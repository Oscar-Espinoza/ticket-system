'use client';

// Slot — owned by B10 (per-issue keyboard shortcuts, palette issue commands,
// draft resume). Rendered by IssuesView and the issue permalink page.

import type { IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';

export function IssueShortcuts(_props: {
  issues: IssueRow[];
  mutations: IssueMutations;
  /** The issue open in the detail pane / permalink page, if any. */
  selectedIssue: IssueRow | null;
}) {
  return null;
}
