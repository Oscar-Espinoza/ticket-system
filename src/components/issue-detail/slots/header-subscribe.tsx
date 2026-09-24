'use client';

// Owner: B1. Stub slot rendered by IssueDetail — Subscribe / unsubscribe (bell).

import type { IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';

export function HeaderSubscribe({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  void issue;
  void mutations;
  return null;
}
