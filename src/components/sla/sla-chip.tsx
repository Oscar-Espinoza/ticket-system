'use client';

// Stub — owned by D5. Compact SLA indicator for list rows, board cards and the
// table (time left / breached), rendered by D8's views when the "sla" display
// property is on. Returns null when the issue has no SLA.

import type { IssueRow } from '@/lib/issue-model';

export function SlaChip(_props: { issue: IssueRow; className?: string }) {
  return null;
}
