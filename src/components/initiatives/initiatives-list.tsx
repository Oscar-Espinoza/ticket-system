'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, SearchX, Target } from 'lucide-react';

import { EpicProgress } from '@/components/epics/epic-progress';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState } from '@/components/ui-icons';
import { formatDueDate } from '@/lib/dates';
import { registerHotkeys } from '@/lib/hotkeys';
import { registerPaletteCommands } from '@/lib/palette-commands';
import type { IssueUser } from '@/lib/issue-model';
import { CreateInitiativeDialog } from './create-initiative-dialog';
import { InitiativeStatusIcon } from './initiative-glyphs';
import {
  INITIATIVE_STATUSES,
  INITIATIVE_STATUS_LABEL,
  initiativesPath,
  type InitiativeRow,
  type InitiativeStatus,
} from './initiative-model';

type FilterId = 'all' | InitiativeStatus;
const FILTERS: FilterId[] = ['all', ...INITIATIVE_STATUSES];
const isFilter = (value: string | null): value is FilterId => FILTERS.includes(value as FilterId);

export function InitiativesList({
  workspace,
  initiatives,
  members,
  viewerId,
}: {
  workspace: { id: string; slug: string; name: string };
  initiatives: InitiativeRow[];
  members: IssueUser[];
  viewerId: string;
}) {
  const searchParams = useSearchParams();
  const param = searchParams.get('status');
  const filter: FilterId = isFilter(param) ? param : 'all';
  const [creating, setCreating] = useState(false);

  const setFilter = (value: string) => {
    if (!isFilter(value)) return;
    const params = new URLSearchParams(window.location.search);
    if (value === 'all') params.delete('status');
    else params.set('status', value);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  };

  const onCreate = useEffectEvent(() => setCreating(true));
  useEffect(
    () =>
      registerPaletteCommands([
        {
          id: 'new-initiative',
          label: 'New initiative',
          section: 'Initiatives',
          keywords: ['create', 'goal'],
          run: () => onCreate(),
        },
      ]),
    [],
  );

  useEffect(() => {
    const move = (delta: number) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-initiative-row]')];
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row === document.activeElement);
      const next = index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
      rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    };
    return registerHotkeys([
      { key: 'j', description: 'Next initiative', scope: 'Initiatives', handler: () => move(1) },
      { key: 'k', description: 'Previous initiative', scope: 'Initiatives', handler: () => move(-1) },
    ]);
  }, []);

  const shown = filter === 'all' ? initiatives : initiatives.filter((i) => i.status === filter);

  let body: React.ReactNode;
  if (initiatives.length === 0) {
    body = (
      <EmptyState
        icon={<Target />}
        title="No initiatives yet"
        description="Initiatives group epics from this workspace’s projects under one goal and roll up their progress."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New initiative
          </Button>
        }
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={<SearchX />}
        title="No initiatives here"
        description={`No ${INITIATIVE_STATUS_LABEL[filter as InitiativeStatus]?.toLowerCase()} initiatives.`}
        action={
          <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
            Show all
          </Button>
        }
      />
    );
  } else {
    body = (
      <div role="list" aria-label="Initiatives" className="flex flex-col border-t border-border">
        {shown.map((initiative) => (
          <Link
            key={initiative.id}
            href={initiativesPath(workspace.slug, initiative.id)}
            role="listitem"
            data-initiative-row={initiative.id}
            className="flex min-h-10 items-center gap-3 border-b border-border px-3 py-1.5 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent"
          >
            <Target className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{initiative.name}</span>
            <span className="hidden w-12 text-xs text-muted-foreground tabular-nums sm:block">
              {initiative.epicCount} {initiative.epicCount === 1 ? 'epic' : 'epics'}
            </span>
            <span className="hidden w-6 md:block" title={initiative.owner ? `Owner: ${initiative.owner.name}` : 'No owner'}>
              {initiative.owner && (
                <Avatar name={initiative.owner.name} src={initiative.owner.image} size={20} />
              )}
            </span>
            <span className="hidden w-20 text-xs text-muted-foreground md:block">
              {initiative.targetDate ? formatDueDate(initiative.targetDate) : ''}
            </span>
            <span className="flex w-24 items-center gap-1.5 text-xs text-muted-foreground">
              <InitiativeStatusIcon status={initiative.status} />
              {INITIATIVE_STATUS_LABEL[initiative.status]}
            </span>
            <EpicProgress progress={initiative.progress} className="w-24" />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-1 text-xs text-muted-foreground">
        <Link href={`/dashboard/workspaces/${workspace.slug}`} className="hover:text-foreground">
          {workspace.name}
        </Link>
      </div>
      <h1 className="mb-4 text-xl font-medium">Initiatives</h1>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={filter}
          onValueChange={(value) => value && setFilter(value)}
          aria-label="Filter initiatives by status"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f} value={f} className="gap-1.5 px-2.5 text-xs">
              {f === 'all' ? 'All' : INITIATIVE_STATUS_LABEL[f]}
              <span className="text-muted-foreground tabular-nums">
                {f === 'all' ? initiatives.length : initiatives.filter((i) => i.status === f).length}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus />
          New initiative
        </Button>
      </div>
      {body}
      <CreateInitiativeDialog
        open={creating}
        onOpenChange={setCreating}
        workspaceId={workspace.id}
        slug={workspace.slug}
        members={members}
        viewerId={viewerId}
      />
    </div>
  );
}
