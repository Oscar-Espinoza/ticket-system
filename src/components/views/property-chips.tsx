'use client';

// Small read-only chips for the properties B5 added to rows / cards / table:
// cycle, epic, milestone and sub-issue progress.

import { Diamond, Network, RefreshCcw } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import { cn } from '@/lib/utils';
import type { SubIssueCount } from './view-context';

const CHIP =
  'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground';

export function CycleChip({ cycleId, className }: { cycleId: string | null; className?: string }) {
  const { cycles } = useProjectData();
  const cycle = cycleId ? cycles.find((c) => c.id === cycleId) : null;
  if (!cycle) return null;
  const name = cycle.name || `Cycle ${cycle.number}`;
  return (
    <span title={`Cycle: ${name}`} className={cn(CHIP, className)}>
      <RefreshCcw className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function EpicChip({ epicId, className }: { epicId: string | null; className?: string }) {
  const { epics } = useProjectData();
  const epic = epicId ? epics.find((e) => e.id === epicId) : null;
  if (!epic) return null;
  return (
    <span title={`Epic: ${epic.name}`} className={cn(CHIP, className)}>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={epic.color ? { backgroundColor: epic.color } : undefined}
      />
      <span className="truncate">{epic.name}</span>
    </span>
  );
}

export function MilestoneChip({
  epicId,
  milestoneId,
  className,
}: {
  epicId: string | null;
  milestoneId: string | null;
  className?: string;
}) {
  const { epics } = useProjectData();
  if (!milestoneId) return null;
  const milestone = (epicId ? epics.filter((e) => e.id === epicId) : epics)
    .flatMap((e) => e.milestones)
    .find((m) => m.id === milestoneId);
  if (!milestone) return null;
  return (
    <span title={`Milestone: ${milestone.name}`} className={cn(CHIP, className)}>
      <Diamond className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{milestone.name}</span>
    </span>
  );
}

export function SubIssueChip({ count, className }: { count: SubIssueCount | null; className?: string }) {
  if (!count) return null;
  return (
    <span
      title={`${count.done} of ${count.total} sub-issues done`}
      className={cn(CHIP, 'tabular-nums', className)}
    >
      <Network className="size-3 shrink-0" aria-hidden="true" />
      {count.done}/{count.total}
    </span>
  );
}
