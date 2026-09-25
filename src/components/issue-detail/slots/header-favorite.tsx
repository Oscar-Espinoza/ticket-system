'use client';

// Owner: B6. Star / unstar the issue from the detail header.

import { FavoriteButton } from '@/components/navigation/favorite-button';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { isPendingIssue } from '@/components/issues/use-issue-mutations';
import type { IssueRow } from '@/lib/issue-model';

export function HeaderFavorite({ issue }: { issue: IssueRow; mutations: IssueMutations }) {
  if (isPendingIssue(issue)) return null;
  // Keyed by id: switching issues in the pane must not show the previous star.
  return <FavoriteButton key={issue.id} targetType="issue" targetId={issue.id} />;
}
