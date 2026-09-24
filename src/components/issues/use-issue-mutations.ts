'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';

import {
  assignTicket,
  deleteTicket,
  setTicketStatus,
  updateTicket,
  type TicketActionResult,
} from '@/app/actions/tickets';
import type { IssueAssignee, IssueRow, TicketStatus } from '@/lib/issue-model';

type Patch =
  | { type: 'update'; id: string; changes: Partial<IssueRow> }
  | { type: 'remove'; id: string };

function applyPatch(issues: IssueRow[], patch: Patch): IssueRow[] {
  if (patch.type === 'remove') return issues.filter((i) => i.id !== patch.id);
  return issues.map((i) => (i.id === patch.id ? { ...i, ...patch.changes } : i));
}

export interface IssueMutations {
  issues: IssueRow[];
  setStatus: (issue: IssueRow, status: TicketStatus) => void;
  assign: (issue: IssueRow, assignee: IssueAssignee | null) => void;
  update: (
    issue: IssueRow,
    changes: { title?: string; description?: string | null },
  ) => void;
  remove: (issue: IssueRow, onDone?: () => void) => void;
}

// Optimistic state reverts to the server props when the transition settles: on
// success the action's revalidation already carries the new data, on failure
// the UI rolls back and we toast.
export function useIssueMutations(
  projectId: string,
  serverIssues: IssueRow[],
): IssueMutations {
  const [issues, apply] = useOptimistic(serverIssues, applyPatch);
  const [, startTransition] = useTransition();

  function run(
    patch: Patch,
    action: () => Promise<TicketActionResult>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      apply(patch);
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(
            result.error === 'Forbidden'
              ? 'You no longer have access to this project.'
              : result.error,
          );
        } else {
          onSuccess?.();
        }
      } catch {
        toast.error('Something went wrong — the change was not saved.');
      }
    });
  }

  return {
    issues,
    setStatus: (issue, status) => {
      if (issue.status === status) return;
      run({ type: 'update', id: issue.id, changes: { status } }, () =>
        setTicketStatus({ projectId, id: issue.id, status }),
      );
    },
    assign: (issue, assignee) => {
      if ((issue.assignee?.id ?? null) === (assignee?.id ?? null)) return;
      run({ type: 'update', id: issue.id, changes: { assignee } }, () =>
        assignTicket({ projectId, id: issue.id, assigneeId: assignee?.id ?? null }),
      );
    },
    update: (issue, changes) => {
      run({ type: 'update', id: issue.id, changes }, () =>
        updateTicket({ projectId, id: issue.id, ...changes }),
      );
    },
    remove: (issue, onDone) => {
      run(
        { type: 'remove', id: issue.id },
        () => deleteTicket({ projectId, id: issue.id }),
        () => {
          toast.success(`Deleted ${issue.key}`);
          onDone?.();
        },
      );
    },
  };
}
