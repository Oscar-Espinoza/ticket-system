'use client';

// Project roadmap: the epics timeline with a zoom toggle (`?zoom=`), optimistic
// rescheduling, dependency connectors (with a scheduling-conflict count), and
// a side list of epics that have no dates yet.

import { useOptimistic, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarRange, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { updateEpic } from '@/app/actions/epics';
import { EpicIcon, EpicStatusIcon } from '@/components/epics/epic-glyphs';
import {
  epicPath,
  isScheduleConflict,
  type EpicDependency,
  type EpicRow,
  type MilestoneRow,
} from '@/components/epics/epic-model';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/components/ui-icons';
import { Timeline, ZOOMS, type TimelineItem, type Zoom } from './timeline';

type DatePatch = { id: string; startDate?: string; targetDate?: string };

export function RoadmapView({
  epics: serverEpics,
  milestones,
  dependencies = [],
}: {
  /** Non-archived epics. */
  epics: EpicRow[];
  milestones: MilestoneRow[];
  /** `blocks` edges between those epics. */
  dependencies?: EpicDependency[];
}) {
  const { project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const searchParams = useSearchParams();
  const zoomParam = searchParams.get('zoom');
  const zoom: Zoom = ZOOMS.some((z) => z.id === zoomParam) ? (zoomParam as Zoom) : 'months';
  const [epics, applyDates] = useOptimistic(serverEpics, (list, patch: DatePatch) =>
    list.map((epic) => (epic.id === patch.id ? { ...epic, ...patch } : epic)),
  );
  const [, startTransition] = useTransition();

  const setZoom = (value: string) => {
    if (!ZOOMS.some((z) => z.id === value)) return;
    const params = new URLSearchParams(window.location.search);
    if (value === 'months') params.delete('zoom');
    else params.set('zoom', value);
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  };

  const onChangeDates = (id: string, dates: { startDate?: string; targetDate?: string }) =>
    startTransition(async () => {
      applyDates({ id, ...dates });
      const result = await updateEpic({ projectId: project.id, id, patch: dates });
      if (!result.ok) toast.error(result.error);
    });

  const milestonesByEpic = new Map<string, MilestoneRow[]>();
  for (const milestone of milestones) {
    const list = milestonesByEpic.get(milestone.epicId) ?? [];
    list.push(milestone);
    milestonesByEpic.set(milestone.epicId, list);
  }

  const items: TimelineItem[] = epics
    .filter((epic) => epic.startDate || epic.targetDate)
    .map((epic) => ({
      id: epic.id,
      name: epic.name,
      color: epic.color,
      status: epic.status,
      startDate: epic.startDate,
      targetDate: epic.targetDate,
      progress: epic.progress,
      href: epicPath(project.id, epic.id),
      milestones: milestonesByEpic.get(epic.id) ?? [],
      editable: canWrite,
    }))
    // Earliest first, like a Gantt chart reads.
    .sort((a, b) =>
      (a.startDate ?? a.targetDate ?? '').localeCompare(b.startDate ?? b.targetDate ?? ''),
    );
  const undated = epics.filter((epic) => !epic.startDate && !epic.targetDate);

  const byId = new Map(epics.map((epic) => [epic.id, epic]));
  const conflicts = dependencies.filter((dep) => {
    const blocker = byId.get(dep.blockerId);
    const blocked = byId.get(dep.blockedId);
    return blocker && blocked && isScheduleConflict(blocker, blocked);
  });

  if (epics.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange />}
        title="Nothing on the roadmap yet"
        description="Create epics with start and target dates to see them on a timeline."
        action={
          <Button size="sm" asChild>
            <Link href={`/dashboard/projects/${project.id}/epics`}>
              <Plus />
              Go to epics
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={zoom}
          onValueChange={setZoom}
          aria-label="Zoom"
        >
          {ZOOMS.map((z) => (
            <ToggleGroupItem key={z.id} value={z.id} className="px-2.5 text-xs">
              {z.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {canWrite && (
          <span className="text-xs text-muted-foreground">
            Drag bars or their edges to reschedule (snaps to weeks)
          </span>
        )}
        {conflicts.length > 0 && (
          <span
            className="ml-auto flex items-center gap-1 text-xs text-destructive"
            title={conflicts
              .map((dep) => `${byId.get(dep.blockedId)?.name} starts before ${byId.get(dep.blockerId)?.name} ends`)
              .join('\n')}
          >
            <AlertTriangle className="size-3.5" />
            {conflicts.length} scheduling {conflicts.length === 1 ? 'conflict' : 'conflicts'}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1">
          {items.length > 0 ? (
            <Timeline
              items={items}
              zoom={zoom}
              onChangeDates={canWrite ? onChangeDates : undefined}
              dependencies={dependencies.map((dep) => ({
                id: dep.id,
                from: dep.blockerId,
                to: dep.blockedId,
              }))}
            />
          ) : (
            <EmptyState
              icon={<CalendarRange />}
              title="No dated epics"
              description="Give an epic a start or target date to place it on the timeline."
              className="rounded-md border border-border"
            />
          )}
        </div>

        {undated.length > 0 && (
          <aside aria-labelledby="undated-heading" className="flex shrink-0 flex-col gap-2 xl:w-64">
            <h2 id="undated-heading" className="text-xs font-medium text-muted-foreground">
              No dates · {undated.length}
            </h2>
            <ul className="flex flex-col rounded-md border border-border">
              {undated.map((epic) => (
                <li key={epic.id} className="border-b border-border last:border-b-0">
                  <Link
                    href={epicPath(project.id, epic.id)}
                    className="flex h-9 items-center gap-2 px-3 text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <EpicIcon color={epic.color} />
                    <span className="min-w-0 flex-1 truncate">{epic.name}</span>
                    <EpicStatusIcon status={epic.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
