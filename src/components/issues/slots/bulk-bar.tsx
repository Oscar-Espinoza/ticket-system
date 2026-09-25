'use client';

// Owner: Wave C (C1). Floating action bar for the multi-selection: every edit,
// label toggle, archive and trash is one mutation call (one server call, one
// undo entry).

import { useEffect, useEffectEvent, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Archive,
  Box,
  CalendarDays,
  CircleDashed,
  Hash,
  Minus,
  RefreshCcw,
  SignalHigh,
  Tag,
  Trash2,
  Triangle,
  UserRound,
  X,
} from 'lucide-react';

import { CyclePicker } from '@/components/cycles/cycle-picker';
import { EpicPicker } from '@/components/epics/epic-pickers';
import {
  AssigneePicker,
  DueDateOptions,
  EstimatePicker,
  PickerPopover,
  PriorityPicker,
  StatePicker,
  keywordFilter,
} from '@/components/issue-pickers';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { registerHotkeys } from '@/lib/hotkeys';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import {
  ConfirmTrashDialog,
  applyPatch,
  commonValue,
  copyIds,
  labelCoverage,
  toggleLabel,
} from '../issue-context-menu';
import { hasOpenLayer, isEditableTarget, useIssueSelection, useSelectedIds } from '../selection';
import type { IssueMutations } from '../use-issue-mutations';

// Matches no epic: the epic picker shows nothing checked when values differ.
const MIXED = '__mixed';

function BarButton({
  icon,
  label,
  ...props
}: ComponentProps<typeof Button> & { icon: ReactNode; label: string }) {
  return (
    <Button variant="ghost" size="sm" aria-label={label} title={label} {...props}>
      {icon}
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}

function LabelToggles({ issues, mutations }: { issues: IssueRow[]; mutations: IssueMutations }) {
  const { labels } = useProjectData();
  return (
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Add or remove labels…" />
      <CommandList>
        <CommandEmpty>No labels found.</CommandEmpty>
        <CommandGroup>
          {labels.map((label) => {
            const coverage = labelCoverage(issues, label.id);
            return (
              <CommandItem
                key={label.id}
                value={label.id}
                keywords={[label.name]}
                data-checked={coverage === 'all'}
                onSelect={() => toggleLabel(mutations, issues, label.id)}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="truncate">{label.name}</span>
                {coverage === 'some' && (
                  // Takes the check's slot (the item hides its check next to a shortcut slot).
                  <span data-slot="command-shortcut" className="ml-auto text-muted-foreground">
                    <Minus aria-hidden="true" />
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function BulkBar({ issues, mutations }: { issues: IssueRow[]; mutations: IssueMutations }) {
  const { cycles, epics, labels } = useProjectData();
  const canWrite = useProjectPermission('write');
  const selection = useIssueSelection();
  const ids = useSelectedIds();
  const [trash, setTrash] = useState<IssueRow[]>([]);

  // Listed order (visual order within groups), confirmed issues only.
  const selected = issues.filter((issue) => ids.has(issue.id));

  const requestTrash = useEffectEvent(() => {
    if (selected.length === 0) return false;
    setTrash(selected);
    return true;
  });

  useEffect(() => {
    if (!canWrite) return;
    const unregister = registerHotkeys([
      {
        key: 'Backspace',
        mod: true,
        scope: 'Issues',
        description: 'Move selected issues to trash',
        passive: true,
      },
    ]);
    // Capture phase: with a selection, ⌘⌫ means the selection, not the focused
    // issue (B10's single-issue ⌘⌫ skips events that were already handled).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey || event.defaultPrevented) return;
      if (isEditableTarget(event.target) || hasOpenLayer()) return;
      if (requestTrash()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      unregister();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [canWrite]);

  const trashDialog = (
    <ConfirmTrashDialog
      issues={trash}
      onOpenChange={(open) => !open && setTrash([])}
      onConfirm={() => {
        mutations.removeMany(trash);
        selection.clear();
        setTrash([]);
      }}
    />
  );

  if (selected.length === 0) return trashDialog;

  const apply = (patch: IssuePatch) => applyPatch(mutations, selected, patch);
  const dueDate = commonValue(selected, (i) => i.dueDate);
  const epicId = commonValue(selected, (i) => i.epicId);

  return (
    <>
      <div
        data-bulk-bar
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
      >
        <div
          role="toolbar"
          aria-label={`Bulk actions for ${selected.length} selected issues`}
          className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-popover"
        >
          <span
            className="flex shrink-0 items-center gap-1 pl-2 text-xs font-medium tabular-nums"
            aria-live="polite"
          >
            {selected.length} selected
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear selection"
            title="Clear selection (Esc)"
            onClick={selection.clear}
          >
            <X />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5 self-center" />

          {!canWrite && (
            <BarButton icon={<Hash />} label="Copy IDs" onClick={() => void copyIds(selected)} />
          )}

          {canWrite && (
            <>
              <StatePicker
                side="top"
                value={commonValue(selected, (i) => i.stateId) ?? null}
                onChange={(stateId) => apply({ stateId })}
              >
                <BarButton icon={<CircleDashed />} label="Status" />
              </StatePicker>

              <PriorityPicker
                side="top"
                value={commonValue(selected, (i) => i.priority) ?? null}
                onChange={(priority) => apply({ priority })}
              >
                <BarButton icon={<SignalHigh />} label="Priority" />
              </PriorityPicker>

              <AssigneePicker
                side="top"
                value={commonValue(selected, (i) => i.assignee?.id ?? null)}
                onChange={(assigneeId) => apply({ assigneeId })}
              >
                <BarButton icon={<UserRound />} label="Assignee" />
              </AssigneePicker>

              {labels.length > 0 && (
                <PickerPopover
                  side="top"
                  className="w-60"
                  content={() => <LabelToggles issues={selected} mutations={mutations} />}
                >
                  <BarButton icon={<Tag />} label="Labels" />
                </PickerPopover>
              )}

              <EstimatePicker
                side="top"
                value={commonValue(selected, (i) => i.estimate)}
                onChange={(estimate) => apply({ estimate })}
              >
                <BarButton icon={<Triangle />} label="Estimate" />
              </EstimatePicker>

              <PickerPopover
                side="top"
                className="w-auto min-w-64"
                content={(close) => (
                  <>
                    <DueDateOptions
                      value={dueDate}
                      onSelect={(next) => {
                        close();
                        apply({ dueDate: next });
                      }}
                    />
                    {/* The options only offer "Remove" for a shared date. */}
                    {dueDate === undefined && (
                      <div className="border-t border-border p-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start font-normal"
                          onClick={() => {
                            close();
                            apply({ dueDate: null });
                          }}
                        >
                          <X className="text-muted-foreground" />
                          Remove due dates
                        </Button>
                      </div>
                    )}
                  </>
                )}
              >
                <BarButton icon={<CalendarDays />} label="Due date" />
              </PickerPopover>

              {cycles.length > 0 && (
                <CyclePicker
                  side="top"
                  value={commonValue(selected, (i) => i.cycleId)}
                  onChange={(cycleId) => apply({ cycleId })}
                >
                  <BarButton icon={<RefreshCcw />} label="Cycle" />
                </CyclePicker>
              )}

              {epics.length > 0 && (
                <EpicPicker
                  side="top"
                  epics={epics}
                  value={epicId === undefined ? MIXED : epicId}
                  onChange={(next) => apply({ epicId: next })}
                >
                  <BarButton icon={<Box />} label="Epic" />
                </EpicPicker>
              )}

              <Separator orientation="vertical" className="mx-1 h-5 self-center" />
              <BarButton
                icon={<Archive />}
                label="Archive"
                onClick={() => {
                  mutations.archiveMany(selected);
                  selection.clear();
                }}
              />
              <BarButton
                icon={<Trash2 />}
                label="Move to trash"
                className="hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setTrash(selected)}
              />
            </>
          )}
        </div>
      </div>
      {trashDialog}
    </>
  );
}
