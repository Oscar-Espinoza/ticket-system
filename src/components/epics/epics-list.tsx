'use client';

// Epics list: dense Linear-style rows, a status filter kept in `?status=`, a
// label filter in `?label=a,b` (any match), j/k to move between rows (Enter
// follows the focused link), a create dialog and the epic-labels dialog.

import { useEffect, useEffectEvent, useOptimistic, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Archive, ArchiveRestore, Boxes, Link2, Plus, SearchX, Tag } from 'lucide-react';
import { toast } from 'sonner';

import { setEpicLabels } from '@/app/actions/epic-labels';
import { archiveEpic, unarchiveEpic } from '@/app/actions/epics';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import { registerHotkeys } from '@/lib/hotkeys';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { CreateEpicDialog } from './create-epic-dialog';
import { EpicIcon, EpicStatusIcon, HealthChip } from './epic-glyphs';
import { EpicLabelChips, EpicLabelFilter, EpicLabelsDialog } from './epic-labels';
import {
  EPIC_STATUS_LABEL,
  epicPath,
  type EpicLabelRow,
  type EpicRow,
  type EpicStatus,
} from './epic-model';
import { EpicProgress } from './epic-progress';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'planned', label: 'Planned' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

const FILTER_STATUSES: Record<Exclude<FilterId, 'all' | 'archived'>, EpicStatus[]> = {
  active: ['started', 'paused'],
  planned: ['backlog', 'planned'],
  completed: ['completed', 'canceled'],
};

function matches(epic: EpicRow, filter: FilterId) {
  if (filter === 'archived') return epic.archivedAt !== null;
  if (epic.archivedAt) return false;
  return filter === 'all' || FILTER_STATUSES[filter].includes(epic.status);
}

function isFilterId(value: string | null): value is FilterId {
  return FILTERS.some((f) => f.id === value);
}

function setParam(name: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value === null) params.delete(name);
  else params.set(name, value);
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function EpicsList({
  epics: serverEpics,
  labels,
}: {
  epics: EpicRow[];
  /** The project's epic labels. */
  labels: EpicLabelRow[];
}) {
  const { project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const searchParams = useSearchParams();
  const param = searchParams.get('status');
  const filter: FilterId = isFilterId(param) ? param : 'all';
  // Unknown (e.g. deleted) label ids are dropped.
  const labelFilter = (searchParams.get('label') ?? '')
    .split(',')
    .filter((id) => labels.some((l) => l.id === id));
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [epics, patchLabels] = useOptimistic(
    serverEpics,
    (list, patch: { id: string; labelIds: string[] }) =>
      list.map((epic) => (epic.id === patch.id ? { ...epic, labelIds: patch.labelIds } : epic)),
  );
  const [, startTransition] = useTransition();

  const setFilter = (next: string) => {
    if (isFilterId(next)) setParam('status', next === 'all' ? null : next);
  };
  const setLabelFilter = (ids: string[]) => setParam('label', ids.length ? ids.join(',') : null);

  const setLabels = (epic: EpicRow, labelIds: string[]) =>
    startTransition(async () => {
      patchLabels({ id: epic.id, labelIds });
      const result = await setEpicLabels({ projectId: project.id, epicId: epic.id, labelIds });
      if (!result.ok) toast.error(result.error);
    });

  const onCreate = useEffectEvent(() => setCreating(true));
  const onManage = useEffectEvent(() => setManaging(true));
  useEffect(() => {
    if (!canWrite) return;
    return registerPaletteCommands([
      {
        id: 'new-epic',
        label: 'New epic',
        section: 'Epics',
        keywords: ['create', 'project'],
        run: () => onCreate(),
      },
      {
        id: 'manage-epic-labels',
        label: 'Manage epic labels',
        section: 'Epics',
        keywords: ['project labels', 'tags'],
        run: () => onManage(),
      },
    ]);
  }, [canWrite]);

  // j / k walk the rows; the focused row is a link, so Enter opens it natively.
  useEffect(() => {
    const move = (delta: number) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-epic-row]')];
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row === document.activeElement);
      const next = index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
      rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    };
    return registerHotkeys([
      { key: 'j', description: 'Next epic', scope: 'Epics', handler: () => move(1) },
      { key: 'k', description: 'Previous epic', scope: 'Epics', handler: () => move(-1) },
    ]);
  }, []);

  const labelled = labelFilter.length
    ? epics.filter((epic) => epic.labelIds?.some((id) => labelFilter.includes(id)))
    : epics;
  const shown = labelled.filter((epic) => matches(epic, filter));
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.id, labelled.filter((epic) => matches(epic, f.id)).length]),
  ) as Record<FilterId, number>;
  const countByLabel = (list: EpicRow[]) => {
    const map = new Map<string, number>();
    for (const epic of list) {
      for (const id of epic.labelIds ?? []) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };
  const labelCounts = countByLabel(epics.filter((epic) => matches(epic, filter)));

  let body: React.ReactNode;
  if (epics.length === 0) {
    body = (
      <EmptyState
        icon={<Boxes />}
        title="No epics yet"
        description="Epics group related issues into a larger piece of work with milestones, dates and progress."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              New epic
            </Button>
          ) : undefined
        }
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={<SearchX />}
        title="No epics here"
        description={
          labelFilter.length
            ? 'No epics match these filters.'
            : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} epics.`
        }
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFilter('all');
              setLabelFilter([]);
            }}
          >
            Show all epics
          </Button>
        }
      />
    );
  } else {
    body = (
      <div role="list" aria-label="Epics" className="flex flex-col border-t border-border">
        <div
          aria-hidden="true"
          className="hidden items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground md:flex"
        >
          <span className="flex-1">Name</span>
          <span className="w-24">Health</span>
          <span className="w-6">Lead</span>
          <span className="w-20">Target</span>
          <span className="w-28">Status</span>
          <span className="w-24">Progress</span>
          <span className="hidden w-16 text-right lg:block">Points</span>
          <span className="w-12 text-right">Issues</span>
        </div>
        {shown.map((epic) => (
          <EpicListRow
            key={epic.id}
            epic={epic}
            labels={labels}
            projectId={project.id}
            canWrite={canWrite}
            onSetLabels={(labelIds) => setLabels(epic, labelIds)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={filter}
          onValueChange={(value) => value && setFilter(value)}
          aria-label="Filter epics by status"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.id} value={f.id} className="gap-1.5 px-2.5 text-xs">
              {f.label}
              <span className="text-muted-foreground tabular-nums">{counts[f.id]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {(labels.length > 0 || canWrite) && (
          <EpicLabelFilter
            labels={labels}
            counts={labelCounts}
            value={labelFilter}
            onChange={setLabelFilter}
            onManage={canWrite ? () => setManaging(true) : undefined}
          />
        )}
        {canWrite && (
          <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus />
            New epic
          </Button>
        )}
      </div>
      {body}
      {canWrite && <CreateEpicDialog open={creating} onOpenChange={setCreating} />}
      {canWrite && (
        <EpicLabelsDialog
          open={managing}
          onOpenChange={setManaging}
          projectId={project.id}
          labels={labels}
          usage={countByLabel(epics)}
        />
      )}
    </div>
  );
}

function EpicListRow({
  epic,
  labels,
  projectId,
  canWrite,
  onSetLabels,
}: {
  epic: EpicRow;
  labels: EpicLabelRow[];
  projectId: string;
  canWrite: boolean;
  onSetLabels: (labelIds: string[]) => void;
}) {
  const own = epic.labelIds ?? [];
  const href = epicPath(projectId, epic.id);

  const toggleArchive = async () => {
    const action = epic.archivedAt ? unarchiveEpic : archiveEpic;
    const result = await action({ projectId, id: epic.id });
    if (!result.ok) toast.error(result.error);
    else toast.success(epic.archivedAt ? 'Epic restored' : 'Epic archived');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      toast.success('Copied epic link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          href={href}
          role="listitem"
          data-epic-row={epic.id}
          className="flex min-h-10 items-center gap-3 border-b border-border px-3 py-1.5 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <EpicIcon color={epic.color} />
            <span className="truncate font-medium">{epic.name}</span>
            {epic.archivedAt && (
              <span className="shrink-0 text-xs text-muted-foreground">Archived</span>
            )}
            <EpicLabelChips
              labels={labels}
              labelIds={own}
              max={3}
              className="hidden shrink flex-nowrap overflow-hidden sm:flex"
            />
          </span>
          <span className="hidden w-24 md:block">
            <HealthChip health={epic.health} />
          </span>
          <span className="hidden w-6 md:block" title={epic.lead ? `Lead: ${epic.lead.name}` : 'No lead'}>
            {epic.lead && <Avatar name={epic.lead.name} src={epic.lead.image} size={20} />}
          </span>
          <span className="hidden w-20 text-xs text-muted-foreground md:block">
            {epic.targetDate ? formatDueDate(epic.targetDate) : ''}
          </span>
          <span className="flex w-28 items-center gap-1.5 text-xs text-muted-foreground">
            <EpicStatusIcon status={epic.status} />
            <span className="truncate">{EPIC_STATUS_LABEL[epic.status]}</span>
          </span>
          <EpicProgress progress={epic.progress} color={epic.color} className="w-24" />
          <span className="hidden w-16 text-right text-xs text-muted-foreground tabular-nums lg:block">
            {epic.progress.points > 0
              ? `${epic.progress.completedPoints}/${epic.progress.points} pts`
              : ''}
          </span>
          <span className="hidden w-12 text-right text-xs text-muted-foreground tabular-nums sm:block">
            {epic.progress.total}
          </span>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem asChild>
          <Link href={href}>Open</Link>
        </ContextMenuItem>
        <ContextMenuItem onSelect={copyLink}>
          <Link2 />
          Copy link
        </ContextMenuItem>
        {canWrite && labels.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Tag />
              Labels
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-72 w-48 overflow-y-auto">
              {labels.map((label) => (
                <ContextMenuCheckboxItem
                  key={label.id}
                  checked={own.includes(label.id)}
                  // Keep the menu open to toggle several.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    onSetLabels(checked ? [...own, label.id] : own.filter((id) => id !== label.id))
                  }
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="truncate">{label.name}</span>
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {canWrite && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={toggleArchive}>
              {epic.archivedAt ? <ArchiveRestore /> : <Archive />}
              {epic.archivedAt ? 'Unarchive' : 'Archive'}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
