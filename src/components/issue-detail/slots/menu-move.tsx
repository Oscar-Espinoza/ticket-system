'use client';

// Slot — owned by D4. "Move to project…" item(s) inside the issue … menu (render DropdownMenuItem elements).

import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

export function MenuMove(_props: { issue: IssueRow; mutations: IssueMutations }) {
  return null;
}
