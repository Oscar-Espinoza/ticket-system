'use client';

// Slot — owned by D6. Customer requests linked to this issue (add/remove, importance).

import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

export function SectionCustomers(_props: { issue: IssueRow; mutations: IssueMutations }) {
  return null;
}
