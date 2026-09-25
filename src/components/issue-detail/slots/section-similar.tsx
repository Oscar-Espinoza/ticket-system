'use client';

// Slot — owned by D9. Possible duplicates / similar issues (trigram similarity) + "Mark as duplicate".

import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

export function SectionSimilar(_props: { issue: IssueRow; mutations: IssueMutations }) {
  return null;
}
