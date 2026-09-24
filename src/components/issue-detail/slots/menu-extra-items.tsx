'use client';

// Owner: B10. Stub slot rendered inside IssueDetail's `…` DropdownMenuContent,
// between the copy items and Archive / Move to trash. Return
// <DropdownMenuItem>s (and separators) — e.g. Duplicate, Save as template.

import type { IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';

export function MenuExtraItems({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void issue;
  void mutations;
  return null;
}
