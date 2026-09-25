'use client';

// Triage inbox: issues in a triage state (newest first) with the issue preview.
// Keyboard: j/k (↑/↓) move, 1 accept, 2 duplicate, 3 decline, a apply suggestions.

import { useEffect, useEffectEvent, useState, useTransition } from 'react';
import { CheckCircle2, Copy, Inbox, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import {
  acceptTriageIssue,
  declineTriageIssue,
  markTriageDuplicate,
  type TriageActionResult,
} from '@/app/actions/triage';
import { IssueDetailPane, useIsDesktop } from '@/components/issue-detail/issue-detail-pane';
import { LabelChips, relativeTime } from '@/components/issues/issue-properties';
import { useIssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { AcceptDialog, DeclineDialog, DuplicateDialog, type AcceptChoice } from './triage-dialogs';
import { TriageSuggestions } from './triage-suggestions';

type DialogKind = 'accept' | 'decline' | 'duplicate' | null;

const isTriage = (issue: IssueRow) =>
  !issue.archivedAt && !issue.deletedAt && issue.state.type === 'triage';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-1 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

export function TriageView({
  issues,
  candidates,
}: {
  /** Triage issues, newest first. */
  issues: IssueRow[];
  /** Every active issue of the project (duplicate search). */
  candidates: IssueRow[];
}) {
  const canWrite = useProjectPermission('write');
  const desktop = useIsDesktop();
  const mutations = useIssueMutations(issues, { include: isTriage });
  // Issues handled here disappear at once; the revalidated props confirm it.
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const list = mutations.issues.filter((issue) => !handled.has(issue.id));
  // undefined = default (first issue on desktop), null = preview closed.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, startTransition] = useTransition();

  // Desktop previews the first issue by default; mobile opens a sheet on tap.
  const explicit = selectedId ? list.find((issue) => issue.id === selectedId) : undefined;
  const selected = explicit ?? (selectedId !== null && desktop ? (list[0] ?? null) : null);
  const index = selected ? list.indexOf(selected) : -1;

  const focusRow = (id: string) =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-triage-row="${id}"]`)?.focus(),
    );
  const select = (issue: IssueRow | undefined) => {
    if (!issue) return;
    setSelectedId(issue.id);
    focusRow(issue.id);
  };

  const run = (issue: IssueRow, action: () => Promise<TriageActionResult>, success: string) => {
    const next = list[index + 1] ?? list[index - 1];
    startTransition(async () => {
      let result: TriageActionResult;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: 'Something went wrong — nothing was changed.' };
      }
      if (!result.ok) {
        toast.error(result.error === 'Forbidden' ? "You don't have permission to triage." : result.error);
        return;
      }
      setDialog(null);
      setHandled((prev) => new Set(prev).add(issue.id));
      if (result.warning) toast.warning(result.warning);
      else toast.success(success);
      if (next) select(next);
      else setSelectedId(undefined);
    });
  };

  const accept = (issue: IssueRow, choice: AcceptChoice) =>
    run(
      issue,
      () =>
        acceptTriageIssue({
          projectId: issue.projectId,
          id: issue.id,
          stateId: choice.stateId,
          priority: choice.priority,
          assigneeId: choice.assigneeId,
        }),
      `Accepted ${issue.key}`,
    );
  const decline = (issue: IssueRow, reason: string) =>
    run(
      issue,
      () => declineTriageIssue({ projectId: issue.projectId, id: issue.id, reason }),
      `Declined ${issue.key}`,
    );
  const duplicate = (issue: IssueRow, original: { id: string; key: string }) =>
    run(
      issue,
      () => markTriageDuplicate({ projectId: issue.projectId, id: issue.id, originalId: original.id }),
      `Marked ${issue.key} as a duplicate of ${original.key}`,
    );

  const onKey = useEffectEvent((key: string) => {
    if (key === 'j') select(list[Math.min(list.length - 1, index + 1)] ?? list[0]);
    else if (key === 'k') select(list[Math.max(0, index - 1)]);
    else if (selected && canWrite && !pending) {
      if (key === '1') setDialog('accept');
      else if (key === '2') setDialog('duplicate');
      else if (key === '3') setDialog('decline');
    }
  });
  const hasIssues = list.length > 0;

  useEffect(() => {
    if (!hasIssues) return;
    const key = (k: string, description: string) => ({
      key: k,
      scope: 'Triage',
      description,
      handler: () => onKey(k),
    });
    return registerHotkeys([
      key('j', 'Next issue'),
      key('k', 'Previous issue'),
      key('1', 'Accept'),
      key('2', 'Mark as duplicate'),
      key('3', 'Decline'),
    ]);
  }, [hasIssues]);

  if (!hasIssues) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="Triage is clear"
        description="New issues from the intake form, the API and people outside the project land here for review."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {list.length} {list.length === 1 ? 'issue' : 'issues'} to triage
        </p>
        {canWrite && selected && (
          <div className="ml-auto flex items-center gap-1.5" aria-label={`Triage ${selected.key}`} role="group">
            <Button size="sm" onClick={() => setDialog('accept')} disabled={pending}>
              <CheckCircle2 />
              Accept
              <Kbd>1</Kbd>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('duplicate')} disabled={pending}>
              <Copy />
              Duplicate
              <Kbd>2</Kbd>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('decline')} disabled={pending}>
              <XCircle />
              Decline
              <Kbd>3</Kbd>
            </Button>
          </div>
        )}
      </div>

      {canWrite && selected && (
        <TriageSuggestions
          issue={selected}
          mutations={mutations}
          pending={pending}
          onDuplicate={(original) => duplicate(selected, original)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <ul aria-label="Triage issues" className="flex min-w-0 flex-1 flex-col self-start">
          {list.map((issue) => (
            <li key={issue.id}>
              <div
                role="button"
                tabIndex={0}
                data-triage-row={issue.id}
                aria-current={issue.id === selected?.id ? 'true' : undefined}
                aria-label={`${issue.key} ${issue.title}`}
                onClick={() => setSelectedId(issue.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(issue.id);
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const i = list.indexOf(issue) + (e.key === 'ArrowDown' ? 1 : -1);
                    select(list[Math.max(0, Math.min(list.length - 1, i))]);
                  }
                }}
                className={cn(
                  'flex h-10 cursor-default items-center gap-3 rounded-md px-2 text-sm outline-none',
                  'hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
                  issue.id === selected?.id && 'bg-muted',
                )}
              >
                <PriorityIcon priority={issue.priority} size={14} />
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
                <StateIcon state={issue.state} size={14} />
                <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                <LabelChips labels={issue.labels} max={2} className="hidden md:flex" />
                {issue.creator ? (
                  <Avatar name={issue.creator.name} src={issue.creator.image} size={20} />
                ) : (
                  <span className="text-xs text-muted-foreground">External</span>
                )}
                <span
                  className="w-20 shrink-0 text-right text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  {relativeTime(issue.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {selected && (
          <IssueDetailPane
            issue={selected}
            mutations={mutations}
            onClose={() => {
              setSelectedId(null);
              if (desktop) focusRow(selected.id);
            }}
          />
        )}
      </div>

      {selected && canWrite && (
        <>
          <AcceptDialog
            issue={selected}
            open={dialog === 'accept'}
            onOpenChange={(open) => setDialog(open ? 'accept' : null)}
            pending={pending}
            onAccept={(choice) => accept(selected, choice)}
          />
          <DeclineDialog
            key={selected.id}
            issue={selected}
            open={dialog === 'decline'}
            onOpenChange={(open) => setDialog(open ? 'decline' : null)}
            pending={pending}
            onDecline={(reason) => decline(selected, reason)}
          />
          <DuplicateDialog
            issue={selected}
            candidates={candidates.filter((c) => c.id !== selected.id)}
            open={dialog === 'duplicate'}
            onOpenChange={(open) => setDialog(open ? 'duplicate' : null)}
            onPick={(original) => duplicate(selected, original)}
          />
        </>
      )}
    </div>
  );
}
