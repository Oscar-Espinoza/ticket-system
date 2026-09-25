'use client';

// Cycle page header: name, dates, status, favorite, edit / complete.

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, Pencil } from 'lucide-react';

import { projectHref } from '@/components/app-shell/routes';
import { FavoriteButton } from '@/components/navigation/favorite-button';
import { Button } from '@/components/ui/button';
import { LabelChip } from '@/components/ui-icons';
import { CompleteCycleDialog, CycleFormDialog, type EditableCycle } from './cycle-dialogs';
import { CycleGlyph } from './cycle-stats';
import {
  cycleName,
  daysLeft,
  daysUntil,
  formatCycleDay,
  formatCycleRange,
  type CycleStatus,
} from './cycle-utils';

export function CycleHeader({
  projectId,
  cycle,
  status,
  progress,
  unfinished,
  nextCycleName,
  canWrite,
}: {
  projectId: string;
  cycle: EditableCycle & { id: string };
  status: CycleStatus;
  progress: number;
  unfinished: number;
  nextCycleName: string | null;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);

  let timing: string;
  if (cycle.completedAt) timing = `Completed ${formatCycleDay(cycle.completedAt)}`;
  else if (status === 'past') timing = 'Ended — completes automatically';
  else if (status === 'upcoming') timing = `Starts in ${daysUntil(cycle)} days`;
  else timing = daysLeft(cycle) === 0 ? 'Last day' : `${daysLeft(cycle)} days left`;

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={projectHref(projectId, 'cycles')}
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" />
        Cycles
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CycleGlyph status={status} progress={progress} />
        <h2 className="text-lg font-medium">{cycleName(cycle)}</h2>
        <span className="text-sm text-muted-foreground">{formatCycleRange(cycle)}</span>
        <LabelChip dot={false} suppressHydrationWarning>
          {timing}
        </LabelChip>
        <div className="ml-auto flex items-center gap-1">
          <FavoriteButton targetType="cycle" targetId={cycle.id} />
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          )}
          {canWrite && !cycle.completedAt && status !== 'upcoming' && (
            <Button size="sm" variant="outline" onClick={() => setCompleting(true)}>
              <CheckCircle2 />
              Complete cycle
            </Button>
          )}
        </div>
      </div>
      {cycle.description && (
        <p className="max-w-2xl text-sm whitespace-pre-line text-muted-foreground">
          {cycle.description}
        </p>
      )}

      <CycleFormDialog
        projectId={projectId}
        open={editing}
        onOpenChange={setEditing}
        cycle={cycle}
      />
      {canWrite && !cycle.completedAt && (
        <CompleteCycleDialog
          key={String(completing)}
          projectId={projectId}
          cycle={cycle}
          unfinished={unfinished}
          nextCycleName={nextCycleName}
          open={completing}
          onOpenChange={setCompleting}
        />
      )}
    </div>
  );
}
