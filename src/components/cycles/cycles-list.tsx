'use client';

// Cycles list: current (with progress), upcoming, past (completion %), and the
// velocity chart. Rows link to the cycle page; "New cycle" opens the form.

import { useEffect, useEffectEvent, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import { projectHref } from '@/components/app-shell/routes';
import { Button } from '@/components/ui/button';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { cn } from '@/lib/utils';
import { VelocityChart, type VelocityCycle } from './cycle-charts';
import { CycleFormDialog } from './cycle-dialogs';
import { CycleGlyph, CycleProgressBar, CycleStats } from './cycle-stats';
import {
  cycleName,
  daysLeft,
  daysUntil,
  formatCycleRange,
  percent,
  type CycleStatus,
  type CycleTotals,
} from './cycle-utils';

export interface CycleListItem {
  id: string;
  number: number;
  name: string | null;
  startsAt: Date;
  endsAt: Date;
  completedAt: Date | null;
  status: CycleStatus;
  totals: CycleTotals;
}

export function CyclesList({
  projectId,
  current,
  upcoming,
  past,
  velocity,
  estimatesEnabled,
  canWrite,
  suggested,
}: {
  projectId: string;
  current: CycleListItem | null;
  /** Soonest first. */
  upcoming: CycleListItem[];
  /** Newest first. */
  past: CycleListItem[];
  velocity: VelocityCycle[];
  estimatesEnabled: boolean;
  canWrite: boolean;
  suggested: { startsAt: Date; endsAt: Date };
}) {
  const [creating, setCreating] = useState(false);
  const onPaletteCreate = useEffectEvent(() => setCreating(true));

  useEffect(() => {
    if (!canWrite) return;
    return registerPaletteCommands([
      {
        id: 'new-cycle',
        label: 'New cycle',
        section: 'Cycles',
        keywords: ['sprint', 'iteration', 'create'],
        run: () => onPaletteCreate(),
      },
    ]);
  }, [canWrite]);

  const href = (cycle: CycleListItem) => projectHref(projectId, `cycles/${cycle.id}`);

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Time-boxed iterations. Unfinished issues roll over when a cycle ends.
        </p>
        {canWrite && (
          <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus />
            New cycle
          </Button>
        )}
      </div>

      <section aria-labelledby="cycles-current" className="flex flex-col gap-2">
        <SectionHeading id="cycles-current">Current</SectionHeading>
        {current ? (
          <Link
            href={href(current)}
            className="flex flex-col gap-4 rounded-lg border border-border p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CycleGlyph
                status="current"
                progress={percent(current.totals.completed, current.totals.scope)}
              />
              <span className="font-medium">{cycleName(current)}</span>
              <span className="text-sm text-muted-foreground">{formatCycleRange(current)}</span>
              <span className="ml-auto text-xs text-muted-foreground" suppressHydrationWarning>
                {daysLeft(current) === 0 ? 'Last day' : `${daysLeft(current)} days left`}
              </span>
            </div>
            <CycleProgressBar totals={current.totals} />
            <CycleStats totals={current.totals} showPoints={estimatesEnabled} />
          </Link>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No cycle is running right now.
          </p>
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="cycles-upcoming" className="flex flex-col gap-2">
          <SectionHeading id="cycles-upcoming">Upcoming</SectionHeading>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {upcoming.map((cycle) => (
              <CycleRowLink
                key={cycle.id}
                href={href(cycle)}
                cycle={cycle}
                trailing={
                  <>
                    <span>
                      {cycle.totals.scope} {cycle.totals.scope === 1 ? 'issue' : 'issues'}
                    </span>
                    <span className="w-24 text-right" suppressHydrationWarning>
                      in {daysUntil(cycle)} days
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <VelocityChart cycles={velocity} estimatesEnabled={estimatesEnabled} />

      {past.length > 0 && (
        <section aria-labelledby="cycles-past" className="flex flex-col gap-2">
          <SectionHeading id="cycles-past">Past</SectionHeading>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {past.map((cycle) => (
              <CycleRowLink
                key={cycle.id}
                href={href(cycle)}
                cycle={cycle}
                trailing={
                  <>
                    <span>
                      {cycle.totals.completed}/{cycle.totals.scope} done
                    </span>
                    <span className="w-24 text-right font-medium text-foreground tabular-nums">
                      {percent(cycle.totals.completed, cycle.totals.scope)}%
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <CycleFormDialog
        projectId={projectId}
        open={creating}
        onOpenChange={setCreating}
        suggested={suggested}
      />
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-medium text-muted-foreground">
      {children}
    </h2>
  );
}

function CycleRowLink({
  href,
  cycle,
  trailing,
}: {
  href: string;
  cycle: CycleListItem;
  trailing: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex h-10 items-center gap-3 px-3 text-sm outline-none transition-colors',
          'hover:bg-muted/40 focus-visible:bg-muted/60',
        )}
      >
        <CycleGlyph status={cycle.status} />
        <span className="truncate font-medium">{cycleName(cycle)}</span>
        <span className="hidden text-muted-foreground sm:inline">{formatCycleRange(cycle)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-4 text-xs text-muted-foreground tabular-nums">
          {trailing}
        </span>
      </Link>
    </li>
  );
}
