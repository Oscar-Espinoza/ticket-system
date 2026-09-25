'use client';

// Right-click menu for list rows, board cards and table rows. One menu wraps
// the whole view (not one per row): the capture handler works out which issue
// was clicked — or the whole selection when that issue is part of it — and
// lets the native browser menu through anywhere else.

import { useState, type MouseEvent, type PointerEvent, type ReactElement } from 'react';
import {
  Archive,
  CalendarDays,
  Check,
  CircleDashed,
  ExternalLink,
  Link2,
  Minus,
  SignalHigh,
  Tag,
  Trash2,
  UserRound,
  X,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';

import { copyIssueId, copyIssueLink } from '@/components/productivity/issue-actions';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Avatar, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { addDays, formatDueDate, toDateString } from '@/lib/dates';
import { formatHotkey } from '@/lib/hotkeys';
import { issuePath, issueUrl } from '@/lib/issue-links';
import { PRIORITY_LABEL, type IssuePatch, type IssueRow, type Priority } from '@/lib/issue-model';
import { ISSUE_ITEM, useIssueSelection } from './selection';
import { isPendingIssue, type IssueMutations } from './use-issue-mutations';

// Same order as the priority picker (Linear: none, urgent … low).
const PRIORITY_MENU: Priority[] = ['none', 'urgent', 'high', 'medium', 'low'];

// ---------------------------------------------------------------- shared helpers

/** One issue → `update`; several → one `bulkUpdate` (one server call, one undo). */
export function applyPatch(mutations: IssueMutations, issues: IssueRow[], patch: IssuePatch) {
  if (issues.length === 1) mutations.update(issues[0], patch);
  else if (issues.length > 1) mutations.bulkUpdate(issues, patch);
}

/** The value every issue shares, or undefined when they differ. */
export function commonValue<T>(issues: IssueRow[], get: (issue: IssueRow) => T): T | undefined {
  if (issues.length === 0) return undefined;
  const first = get(issues[0]);
  return issues.every((issue) => get(issue) === first) ? first : undefined;
}

export type Coverage = 'all' | 'some' | 'none';

export function labelCoverage(issues: IssueRow[], labelId: string): Coverage {
  const count = issues.filter((i) => i.labels.some((l) => l.id === labelId)).length;
  return count === 0 ? 'none' : count === issues.length ? 'all' : 'some';
}

/** Add the label to every issue, or remove it from every issue when all have it. */
export function toggleLabel(mutations: IssueMutations, issues: IssueRow[], labelId: string) {
  const all = labelCoverage(issues, labelId) === 'all';
  applyPatch(mutations, issues, all ? { removeLabelIds: [labelId] } : { addLabelIds: [labelId] });
}

export function CoverageMark({ coverage }: { coverage: Coverage }) {
  if (coverage === 'all') return <Check className="ml-auto size-3.5" aria-hidden="true" />;
  if (coverage === 'some') return <Minus className="ml-auto size-3.5" aria-hidden="true" />;
  return null;
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Could not copy to the clipboard.');
  }
}

/** Copy one issue's key (B10 helper) or a comma-separated list. */
export function copyIds(issues: IssueRow[]) {
  if (issues.length === 1) return copyIssueId(issues[0]);
  return copyText(issues.map((i) => i.key).join(', '), `${issues.length} IDs`);
}

export function copyLinks(issues: IssueRow[]) {
  if (issues.length === 1) return copyIssueLink(issues[0]);
  return copyText(
    issues.map((i) => issueUrl(i.projectId, i.key)).join('\n'),
    `${issues.length} links`,
  );
}

/** Confirm before moving one or many issues to the trash (restorable). */
export function ConfirmTrashDialog({
  issues,
  onOpenChange,
  onConfirm,
}: {
  /** Open while non-empty. */
  issues: IssueRow[];
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const one = issues.length === 1 ? issues[0] : null;
  return (
    <AlertDialog open={issues.length > 0} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {one ? `Move ${one.key} to trash?` : `Move ${issues.length} issues to trash?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {one ? `${one.title} — you` : 'You'} can restore {one ? 'it' : 'them'} from the trash.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Move to trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function dueOptions(today = new Date()) {
  // End of week = the coming Friday (today when it's Friday), like the due date picker.
  const friday = addDays(today, (5 - today.getDay() + 7) % 7);
  return [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'End of this week', date: friday },
    { label: 'In one week', date: addDays(today, 7) },
    { label: 'In two weeks', date: addDays(today, 14) },
  ].map((option) => ({ label: option.label, value: toDateString(option.date) }));
}

const mark = (on: boolean) =>
  on ? <Check className="ml-auto size-3.5" aria-hidden="true" /> : null;

// ---------------------------------------------------------------- menu

export function IssueContextMenu({
  issues,
  mutations,
  children,
}: {
  /** The issues the view lists (optimistic), so checkmarks follow edits live. */
  issues: IssueRow[];
  mutations: IssueMutations;
  /** The view wrapper; must accept a ref and event props (asChild trigger). */
  children: ReactElement;
}) {
  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const selection = useIssueSelection();
  const [target, setTarget] = useState<{ clicked: string; ids: string[] } | null>(null);
  const [trash, setTrash] = useState<IssueRow[]>([]);

  /** The clicked issue (+ the selection when it's part of it), or null off an issue. */
  const targetOf = (event: MouseEvent<HTMLElement>) => {
    const item =
      event.target instanceof Element ? event.target.closest<HTMLElement>(ISSUE_ITEM) : null;
    const id = item?.dataset.issueRow ?? item?.dataset.boardCard;
    const issue = id ? issues.find((i) => i.id === id) : undefined;
    if (!item || !issue || isPendingIssue(issue) || !event.currentTarget.contains(item))
      return null;
    const selected = selection.get();
    return { clicked: issue.id, ids: selected.has(issue.id) ? [...selected] : [issue.id] };
  };

  const onContextMenuCapture = (event: MouseEvent<HTMLElement>) => {
    const next = targetOf(event);
    // Not on an issue: keep the browser's own menu (Radix never sees the event).
    if (!next) event.stopPropagation();
    else setTarget(next);
  };

  // Touch long-press opens the menu without a contextmenu event on some browsers.
  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') setTarget(targetOf(event));
  };

  const ids = new Set(target?.ids);
  const targets = issues.filter((i) => ids.has(i.id));
  const clicked = issues.find((i) => i.id === target?.clicked) ?? null;
  const apply = (patch: IssuePatch) => applyPatch(mutations, targets, patch);

  const members = [
    ...data.members.filter((m) => m.id === data.viewer.id),
    ...data.members.filter((m) => m.id !== data.viewer.id),
  ];
  const stateId = commonValue(targets, (i) => i.stateId);
  const priority = commonValue(targets, (i) => i.priority);
  const assigneeId = commonValue(targets, (i) => i.assignee?.id ?? null);
  const dueDate = commonValue(targets, (i) => i.dueDate);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          asChild
          className="select-auto"
          onContextMenuCapture={onContextMenuCapture}
          onPointerDownCapture={onPointerDownCapture}
        >
          {children}
        </ContextMenuTrigger>
        {targets.length > 0 && (
          <ContextMenuContent className="w-56">
            <ContextMenuLabel className="truncate text-xs text-muted-foreground">
              {targets.length === 1
                ? `${targets[0].key} ${targets[0].title}`
                : `${targets.length} issues`}
            </ContextMenuLabel>
            <ContextMenuSeparator />
            {canWrite && (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <CircleDashed className="text-muted-foreground" />
                    Status
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="max-h-80 w-52 overflow-y-auto">
                    {data.states.map((state) => (
                      <ContextMenuItem key={state.id} onSelect={() => apply({ stateId: state.id })}>
                        <StateIcon state={state} size={14} />
                        <span className="truncate">{state.name}</span>
                        {mark(stateId === state.id)}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <SignalHigh className="text-muted-foreground" />
                    Priority
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-44">
                    {PRIORITY_MENU.map((p) => (
                      <ContextMenuItem key={p} onSelect={() => apply({ priority: p })}>
                        <PriorityIcon priority={p} size={14} />
                        {PRIORITY_LABEL[p]}
                        {mark(priority === p)}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <UserRound className="text-muted-foreground" />
                    Assignee
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                    <ContextMenuItem onSelect={() => apply({ assigneeId: null })}>
                      <UserRound className="text-muted-foreground" />
                      No assignee
                      {mark(assigneeId === null)}
                    </ContextMenuItem>
                    {members.map((member) => (
                      <ContextMenuItem
                        key={member.id}
                        onSelect={() => apply({ assigneeId: member.id })}
                      >
                        <Avatar name={member.name} src={member.image} size={20} />
                        <span className="truncate">{member.name}</span>
                        {member.id === data.viewer.id && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                        {mark(assigneeId === member.id)}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                {data.labels.length > 0 && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <Tag className="text-muted-foreground" />
                      Labels
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="max-h-80 w-52 overflow-y-auto">
                      {data.labels.map((label) => (
                        <ContextMenuItem
                          key={label.id}
                          // Stay open: toggling several labels is the common case.
                          onSelect={(event) => {
                            event.preventDefault();
                            toggleLabel(mutations, targets, label.id);
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: label.color }}
                          />
                          <span className="truncate">{label.name}</span>
                          <CoverageMark coverage={labelCoverage(targets, label.id)} />
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                )}

                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <CalendarDays className="text-muted-foreground" />
                    Due date
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-56">
                    {dueOptions().map((option) => (
                      <ContextMenuItem
                        key={option.label}
                        onSelect={() => apply({ dueDate: option.value })}
                      >
                        <CalendarDays className="text-muted-foreground" />
                        {option.label}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDueDate(option.value)}
                        </span>
                      </ContextMenuItem>
                    ))}
                    {dueDate !== null && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => apply({ dueDate: null })}>
                          <X className="text-muted-foreground" />
                          Remove due date
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
              </>
            )}

            <ContextMenuItem onSelect={() => void copyIds(targets)}>
              <Hash className="text-muted-foreground" />
              {targets.length === 1 ? 'Copy ID' : 'Copy IDs'}
              {targets.length === 1 && (
                <ContextMenuShortcut>{formatHotkey({ mod: true, key: '.' })}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void copyLinks(targets)}>
              <Link2 className="text-muted-foreground" />
              {targets.length === 1 ? 'Copy link' : 'Copy links'}
            </ContextMenuItem>
            {clicked && (
              <ContextMenuItem
                onSelect={() =>
                  window.open(issuePath(clicked.projectId, clicked.key), '_blank', 'noopener')
                }
              >
                <ExternalLink className="text-muted-foreground" />
                Open in new tab
              </ContextMenuItem>
            )}

            {canWrite && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => {
                    mutations.archiveMany(targets);
                    if (targets.length > 1) selection.clear();
                  }}
                >
                  <Archive className="text-muted-foreground" />
                  Archive
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => setTrash(targets)}>
                  <Trash2 />
                  Move to trash…
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        )}
      </ContextMenu>

      <ConfirmTrashDialog
        issues={trash}
        onOpenChange={(open) => !open && setTrash([])}
        onConfirm={() => {
          mutations.removeMany(trash);
          if (trash.length > 1) selection.clear();
          setTrash([]);
        }}
      />
    </>
  );
}
