'use client';

// Owner: B6 (peek preview). Stub slot rendered once next to the issues view —
// e.g. hold Space on a focused row to peek; `onOpen` opens the detail pane.

import type { IssueRow } from '@/lib/issue-model';

export function ListOverlay({
  issues,
  onOpen,
}: {
  issues: IssueRow[];
  onOpen: (issue: IssueRow) => void;
}) {
  void issues;
  void onOpen;
  return null;
}
