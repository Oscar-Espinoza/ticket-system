'use client';

// Owner: B1. Activity history + comments (src/components/comments).

import { IssueActivity } from '@/components/comments';
import type { IssueRow } from '@/lib/issue-model';
import { isPendingIssue, type IssueMutations } from '@/components/issues/use-issue-mutations';

export function SectionActivity({ issue }: { issue: IssueRow; mutations: IssueMutations }) {
  // A just-created issue has no server id yet.
  if (isPendingIssue(issue)) return null;
  return <IssueActivity issue={issue} />;
}
