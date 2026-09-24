'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';

import {
  assignTicket,
  createTicket,
  deleteTicket,
  setTicketStatus,
  updateTicket,
  type TicketActionResult,
} from '@/app/actions/tickets';
import type { IssueAssignee, IssueRow, TicketStatus } from '@/lib/issue-model';

type Patch =
  | { type: 'add'; issue: IssueRow }
  | { type: 'update'; id: string; changes: Partial<IssueRow> }
  | { type: 'remove'; id: string };

const TEMP_PREFIX = 'temp-';

export function isPendingIssue(issue: IssueRow) {
  return issue.id.startsWith(TEMP_PREFIX);
}

function applyPatch(issues: IssueRow[], patch: Patch): IssueRow[] {
  if (patch.type === 'add') return [patch.issue, ...issues];
  if (patch.type === 'remove') return issues.filter((i) => i.id !== patch.id);
  return issues.map((i) => (i.id === patch.id ? { ...i, ...patch.changes } : i));
}

export interface NewIssueInput {
  title: string;
  description: string;
  status: TicketStatus;
}

export interface IssueMutations {
  issues: IssueRow[];
  create: (
    input: NewIssueInput,
    callbacks: { onSuccess: () => void; onError: (message: string) => void },
  ) => void;
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
  ticketKey: string,
  serverIssues: IssueRow[],
): IssueMutations {
  const [issues, apply] = useOptimistic(serverIssues, applyPatch);
  const [, startTransition] = useTransition();

  function run(
    patch: Patch,
    action: () => Promise<TicketActionResult>,
    onSuccess?: () => void,
  ) {
    // A just-created issue has no server id yet; it becomes editable once confirmed.
    if (patch.type !== 'add' && patch.id.startsWith(TEMP_PREFIX)) return;
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
    create: (input, { onSuccess, onError }) => {
      const now = new Date();
      const placeholder: IssueRow = {
        id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
        key: `${ticketKey}-…`,
        number: 0,
        title: input.title.trim(),
        description: input.description.trim() || null,
        status: input.status,
        assignee: null,
        githubBranch: null,
        createdAt: now,
        updatedAt: now,
      };
      startTransition(async () => {
        apply({ type: 'add', issue: placeholder });
        try {
          const result = await createTicket({ projectId, ...input });
          if (!result.ok) {
            onError(
              result.error === 'Forbidden'
                ? 'You no longer have access to this project.'
                : result.error,
            );
            return;
          }
          onSuccess();
          toast.success(result.ticket ? `Created ${result.ticket.key}` : 'Issue created');
        } catch {
          onError('Something went wrong — the issue was not created.');
        }
      });
    },
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
