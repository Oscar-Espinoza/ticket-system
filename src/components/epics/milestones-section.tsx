'use client';

// Milestones of one epic: inline add / rename, target date, progress, and
// reorder via the row menu or Alt+↑/↓. Changes apply optimistically and roll
// back when the server refuses (the refreshed props win either way).

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createMilestone,
  deleteMilestone,
  reorderMilestones,
  updateMilestone,
} from '@/app/actions/epics';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { formatDueDate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { MilestoneGlyph } from './epic-glyphs';
import { EMPTY_PROGRESS, progressPercent, type MilestoneRow } from './epic-model';
import { EpicProgress } from './epic-progress';
import { DatePicker } from './epic-pickers';

type Op =
  | { type: 'add'; milestone: MilestoneRow }
  | { type: 'patch'; id: string; patch: Partial<MilestoneRow> }
  | { type: 'remove'; id: string }
  | { type: 'order'; ids: string[] };

function reduce(list: MilestoneRow[], op: Op): MilestoneRow[] {
  switch (op.type) {
    case 'add':
      return [...list, op.milestone];
    case 'patch':
      return list.map((m) => (m.id === op.id ? { ...m, ...op.patch } : m));
    case 'remove':
      return list.filter((m) => m.id !== op.id);
    case 'order': {
      const byId = new Map(list.map((m) => [m.id, m]));
      return op.ids.flatMap((id) => byId.get(id) ?? []);
    }
  }
}

export function MilestonesSection({
  projectId,
  epicId,
  milestones,
  color,
  canWrite,
}: {
  projectId: string;
  epicId: string;
  milestones: MilestoneRow[];
  color: string | null;
  canWrite: boolean;
}) {
  const [list, apply] = useOptimistic(milestones, reduce);
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const run = (op: Op, action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      apply(op);
      const result = await action();
      if (!result.ok) toast.error(result.error ?? 'Something went wrong.');
    });

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    setDraft('');
    run(
      {
        type: 'add',
        milestone: {
          id: `temp-${crypto.randomUUID()}`,
          epicId,
          name,
          description: null,
          targetDate: null,
          sortOrder: Number.MAX_SAFE_INTEGER,
          progress: EMPTY_PROGRESS,
        },
      },
      () => createMilestone({ projectId, epicId, name }),
    );
  };

  const move = (id: string, delta: -1 | 1) => {
    const ids = list.map((m) => m.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= ids.length || ids.some((i) => i.startsWith('temp-'))) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    run({ type: 'order', ids }, () => reorderMilestones({ projectId, epicId, ids }));
    // Keep focus on the moved row after the re-render.
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-milestone-row="${id}"]`)?.focus(),
    );
  };

  return (
    <section aria-labelledby="milestones-heading" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 id="milestones-heading" className="text-sm font-medium">
          Milestones
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
        {canWrite && !adding && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            aria-label="Add milestone"
            onClick={() => setAdding(true)}
          >
            <Plus />
          </Button>
        )}
      </div>

      {list.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          Break the epic into checkpoints with their own target dates.
          {canWrite && (
            <>
              {' '}
              <button
                type="button"
                className="text-foreground underline-offset-2 hover:underline"
                onClick={() => setAdding(true)}
              >
                Add a milestone
              </button>
            </>
          )}
        </p>
      )}

      {list.length > 0 && (
        <div ref={listRef} role="list" className="flex flex-col rounded-md border border-border">
          {list.map((milestone, index) => (
            <MilestoneItem
              key={milestone.id}
              milestone={milestone}
              color={color}
              canWrite={canWrite && !milestone.id.startsWith('temp-')}
              isFirst={index === 0}
              isLast={index === list.length - 1}
              onMove={(delta) => move(milestone.id, delta)}
              onRename={(name) =>
                run({ type: 'patch', id: milestone.id, patch: { name } }, () =>
                  updateMilestone({ projectId, id: milestone.id, name }),
                )
              }
              onTargetDate={(targetDate) =>
                run({ type: 'patch', id: milestone.id, patch: { targetDate } }, () =>
                  updateMilestone({ projectId, id: milestone.id, targetDate }),
                )
              }
              onDelete={() =>
                run({ type: 'remove', id: milestone.id }, () =>
                  deleteMilestone({ projectId, id: milestone.id }),
                )
              }
            />
          ))}
        </div>
      )}

      {adding && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <MilestoneGlyph className="ml-3 text-muted-foreground" />
          <Input
            autoFocus
            value={draft}
            maxLength={80}
            placeholder="Milestone name — Enter to add, Esc to close"
            aria-label="New milestone name"
            className="h-8"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft('');
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (!draft.trim()) setAdding(false);
            }}
          />
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}

function MilestoneItem({
  milestone,
  color,
  canWrite,
  isFirst,
  isLast,
  onMove,
  onRename,
  onTargetDate,
  onDelete,
}: {
  milestone: MilestoneRow;
  color: string | null;
  canWrite: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onRename: (name: string) => void;
  onTargetDate: (date: string | null) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(milestone.name);
  const done =
    milestone.progress.total > 0 && progressPercent(milestone.progress) === 100;

  const commit = () => {
    setEditing(false);
    const next = name.trim();
    if (next && next !== milestone.name) onRename(next);
    else setName(milestone.name);
  };

  return (
    <div
      role="listitem"
      tabIndex={0}
      data-milestone-row={milestone.id}
      aria-label={milestone.name}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !canWrite) return;
        if (event.altKey && event.key === 'ArrowUp') {
          event.preventDefault();
          onMove(-1);
        } else if (event.altKey && event.key === 'ArrowDown') {
          event.preventDefault();
          onMove(1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          setName(milestone.name);
          setEditing(true);
        }
      }}
      className={cn(
        'group flex min-h-10 items-center gap-2 border-b border-border px-3 py-1 text-sm outline-none last:border-b-0',
        'focus-visible:bg-accent',
        milestone.id.startsWith('temp-') && 'opacity-60',
      )}
    >
      <MilestoneGlyph done={done} color={color} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={name}
            maxLength={80}
            aria-label="Milestone name"
            className="h-7"
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setName(milestone.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            disabled={!canWrite}
            className="max-w-full truncate text-left disabled:cursor-default"
            onClick={() => {
              setName(milestone.name);
              setEditing(true);
            }}
          >
            {milestone.name}
          </button>
        )}
      </div>

      <EpicProgress progress={milestone.progress} color={color} showCounts />

      {canWrite ? (
        <DatePicker value={milestone.targetDate} onChange={onTargetDate} align="end">
          <Button variant="ghost" size="xs" className="w-24 justify-start font-normal text-muted-foreground">
            <CalendarDays />
            {milestone.targetDate ? formatDueDate(milestone.targetDate) : 'Target'}
          </Button>
        </DatePicker>
      ) : (
        <span className="w-24 text-xs text-muted-foreground">
          {milestone.targetDate ? formatDueDate(milestone.targetDate) : ''}
        </span>
      )}

      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Actions for ${milestone.name}`}
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
              <ArrowUp />
              Move up
              <span className="ml-auto text-xs text-muted-foreground">Alt ↑</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
              <ArrowDown />
              Move down
              <span className="ml-auto text-xs text-muted-foreground">Alt ↓</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
