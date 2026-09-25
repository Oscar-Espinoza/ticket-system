'use client';

// Linear-style command dialog for one property of one issue, opened by the
// per-issue shortcuts and the palette. Anchored centre-top like the palette.

import {
  AssigneeOptions,
  DueDateOptions,
  EstimateOptions,
  LabelOptions,
  PriorityOptions,
  StateOptions,
} from '@/components/issue-pickers';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { IssueRow } from '@/lib/issue-model';

export type IssueCommand = 'status' | 'priority' | 'assignee' | 'labels' | 'estimate' | 'dueDate';

const TITLES: Record<IssueCommand, string> = {
  status: 'Change status',
  priority: 'Set priority',
  assignee: 'Assign to',
  labels: 'Change labels',
  estimate: 'Set estimate',
  dueDate: 'Set due date',
};

export function IssueCommandDialog({
  command,
  issue,
  mutations,
  onClose,
}: {
  command: IssueCommand | null;
  /** Latest (optimistic) version of the target issue. */
  issue: IssueRow | null;
  mutations: IssueMutations;
  onClose: () => void;
}) {
  const open = command !== null && issue !== null;
  const done = () => onClose();

  let body: React.ReactNode = null;
  if (open) {
    const update = (patch: Parameters<IssueMutations['update']>[1]) => mutations.update(issue, patch);
    switch (command) {
      case 'status':
        body = (
          <StateOptions
            value={issue.stateId}
            onSelect={(stateId) => {
              update({ stateId });
              done();
            }}
          />
        );
        break;
      case 'priority':
        body = (
          <PriorityOptions
            value={issue.priority}
            onSelect={(priority) => {
              update({ priority });
              done();
            }}
          />
        );
        break;
      case 'assignee':
        body = (
          <AssigneeOptions
            value={issue.assignee?.id ?? null}
            onSelect={(assigneeId) => {
              update({ assigneeId });
              done();
            }}
          />
        );
        break;
      case 'labels':
        // Multi-select: stays open, each toggle saves (Esc closes).
        body = (
          <LabelOptions
            value={issue.labels.map((l) => l.id)}
            onChange={(labelIds) => update({ labelIds })}
          />
        );
        break;
      case 'estimate':
        body = (
          <EstimateOptions
            value={issue.estimate}
            onSelect={(estimate) => {
              update({ estimate });
              done();
            }}
          />
        );
        break;
      case 'dueDate':
        body = (
          <DueDateOptions
            value={issue.dueDate}
            onSelect={(dueDate) => {
              update({ dueDate });
              done();
            }}
          />
        );
        break;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] max-h-[70vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {open && (
          <>
            <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono">{issue.key}</span>
              <span className="truncate">{issue.title}</span>
            </div>
            <DialogTitle className="sr-only">
              {TITLES[command]} — {issue.key}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Type to filter, Enter to apply, Esc to close.
            </DialogDescription>
            <div className="min-h-0 overflow-y-auto">{body}</div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
