'use client';

// Owner: B12. Stub slot rendered by IssueDetail — Who else is viewing this issue (avatars).

import type { IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';

export function HeaderPresence({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void issue;
  void mutations;
  return null;
}
