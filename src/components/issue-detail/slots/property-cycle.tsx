'use client';

// Owner: B7. "Cycle" property row in IssueDetail. Hidden while cycles are off
// (unless the issue still points at a cycle); lists the current cycle, then
// upcoming ones, then recent past ones.

import Link from 'next/link';
import { IterationCw } from 'lucide-react';

import { projectHref } from '@/components/app-shell/routes';
import { CyclePicker } from '@/components/cycles/cycle-picker';
import { CycleGlyph } from '@/components/cycles/cycle-stats';
import { cycleName, cycleStatus } from '@/components/cycles/cycle-utils';
import { PropertyRow } from '@/components/issue-detail/property-row';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { Button } from '@/components/ui/button';
import type { IssueRow } from '@/lib/issue-model';

export function PropertyCycle({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const { project, cycles } = useProjectData();
  const canWrite = useProjectPermission('write');
  const cycle = issue.cycleId ? cycles.find((c) => c.id === issue.cycleId) : undefined;
  if (!project.cyclesEnabled && !cycle) return null;

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      disabled={!canWrite}
      className="-ml-2 max-w-full gap-2 font-normal"
    >
      {cycle ? (
        <>
          <CycleGlyph status={cycleStatus(cycle)} size={14} />
          <span className="truncate">{cycleName(cycle)}</span>
        </>
      ) : (
        <>
          <IterationCw className="text-muted-foreground" />
          <span className="text-muted-foreground">Add to cycle</span>
        </>
      )}
    </Button>
  );

  return (
    <PropertyRow label="Cycle">
      <div className="flex min-w-0 items-center gap-1">
        {canWrite && project.cyclesEnabled ? (
          <CyclePicker
            value={issue.cycleId}
            onChange={(cycleId) => mutations.update(issue, { cycleId })}
          >
            {trigger}
          </CyclePicker>
        ) : (
          trigger
        )}
        {cycle && (
          <Link
            href={projectHref(project.id, `cycles/${cycle.id}`)}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            aria-label={`Open ${cycleName(cycle)}`}
          >
            Open
          </Link>
        )}
      </div>
    </PropertyRow>
  );
}
