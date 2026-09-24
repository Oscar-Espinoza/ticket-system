'use client';

// Owner: Wave C (bulk select + multi-edit). Stub slot rendered at the bottom of
// the issues view. Reuse the issue-pickers' …Options lists and
// mutations.bulkUpdate(issues, patch).

import type { IssueRow } from '@/lib/issue-model';
import type { IssueMutations } from '../use-issue-mutations';

export function BulkBar({ issues, mutations }: { issues: IssueRow[]; mutations: IssueMutations }) {
  void issues;
  void mutations;
  return null;
}
