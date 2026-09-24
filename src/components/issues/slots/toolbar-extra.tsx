'use client';

// Owner: B6. Stub slot rendered at the end of the issues toolbar (before
// "New issue") — e.g. "Save view". `issues` = the currently listed issues.

import type { IssueRow } from '@/lib/issue-model';

export function ToolbarExtra({ issues }: { issues: IssueRow[] }) {
  void issues;
  return null;
}
