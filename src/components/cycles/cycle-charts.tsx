'use client';

// Burndown (cycle page) and velocity (cycles list) — thin wrappers that turn
// server-computed cycle stats into the generic chart primitives.

import { useState } from 'react';

import { BarChart } from '@/components/charts/bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DAY_MS,
  completedOf,
  cycleLengthDays,
  formatCycleDay,
  formatWeekday,
  scopeOf,
  type BurndownPoint,
  type ChartUnit,
  type CycleTotals,
} from './cycle-utils';

export function UnitToggle({
  value,
  onChange,
}: {
  value: ChartUnit;
  onChange: (unit: ChartUnit) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0}
      value={value}
      onValueChange={(next) => next && onChange(next as ChartUnit)}
      aria-label="Chart unit"
    >
      <ToggleGroupItem value="issues" className="h-6 px-2 text-xs">
        Issues
      </ToggleGroupItem>
      <ToggleGroupItem value="points" className="h-6 px-2 text-xs">
        Points
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function ChartCard({
  title,
  unit,
  onUnit,
  showUnit,
  children,
}: {
  title: string;
  unit: ChartUnit;
  onUnit: (unit: ChartUnit) => void;
  showUnit: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {showUnit && (
          <div className="ml-auto">
            <UnitToggle value={unit} onChange={onUnit} />
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function BurndownChart({
  cycle,
  points,
  estimatesEnabled,
}: {
  cycle: { startsAt: Date; endsAt: Date };
  points: BurndownPoint[];
  estimatesEnabled: boolean;
}) {
  const [unit, setUnit] = useState<ChartUnit>(estimatesEnabled ? 'points' : 'issues');
  const effective: ChartUnit = estimatesEnabled ? unit : 'issues';
  const days = cycleLengthDays(cycle);
  const start = new Date(cycle.startsAt).getTime();

  let body: React.ReactNode;
  if (points.length === 0) {
    body = (
      <p className="py-10 text-center text-sm text-muted-foreground">
        The burndown starts on {formatCycleDay(start)}.
      </p>
    );
  } else {
    const last = points[points.length - 1];
    const lastScope = scopeOf(last.totals, effective);
    // x positions are day boundaries: 0 = start, k = end of day k.
    const labels = Array.from({ length: days + 1 }, (_, k) => formatCycleDay(start + k * DAY_MS));
    const pointLabels = labels.map((_, k) => {
      if (k === 0) return `Start · ${formatWeekday(start)}`;
      const inProgress = k === points.length - 1 && new Date(last.at).getTime() < start + k * DAY_MS - 1;
      return inProgress ? 'Now' : `End of ${formatWeekday(start + (k - 1) * DAY_MS)}`;
    });
    const at = (k: number, pick: (t: CycleTotals) => number) =>
      k < points.length ? pick(points[k].totals) : null;

    body =
      lastScope === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {effective === 'points'
            ? 'No estimated issues in this cycle yet.'
            : 'No issues in this cycle yet.'}
        </p>
      ) : (
        <LineChart
          title={`Burndown in ${effective}`}
          labels={labels}
          pointLabels={pointLabels}
          series={[
            {
              id: 'scope',
              label: 'Scope',
              color: 'var(--muted-foreground)',
              values: labels.map((_, k) => at(k, (t) => scopeOf(t, effective))),
            },
            {
              id: 'ideal',
              label: 'Ideal',
              color: 'var(--muted-foreground)',
              variant: 'dashed',
              values: labels.map((_, k) => lastScope * (1 - k / days)),
            },
            {
              id: 'remaining',
              label: 'Remaining',
              color: 'var(--primary)',
              variant: 'area',
              values: labels.map((_, k) =>
                at(k, (t) => scopeOf(t, effective) - completedOf(t, effective)),
              ),
            },
          ]}
        />
      );
  }

  return (
    <ChartCard title="Burndown" unit={effective} onUnit={setUnit} showUnit={estimatesEnabled}>
      {body}
    </ChartCard>
  );
}

export interface VelocityCycle {
  id: string;
  /** Short axis label, e.g. "C12". */
  label: string;
  name: string;
  totals: CycleTotals;
}

export function VelocityChart({
  cycles,
  estimatesEnabled,
}: {
  /** Past cycles, oldest first. */
  cycles: VelocityCycle[];
  estimatesEnabled: boolean;
}) {
  const [unit, setUnit] = useState<ChartUnit>(estimatesEnabled ? 'points' : 'issues');
  const effective: ChartUnit = estimatesEnabled ? unit : 'issues';
  const recent = cycles.slice(-3);
  const average = recent.length
    ? recent.reduce((sum, c) => sum + completedOf(c.totals, effective), 0) / recent.length
    : 0;
  const noun = effective === 'points' ? 'points' : 'issues';

  return (
    <ChartCard title="Velocity" unit={effective} onUnit={setUnit} showUnit={estimatesEnabled}>
      {cycles.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Velocity appears once a cycle has finished.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="text-base font-medium tabular-nums text-foreground">
              {Math.round(average * 10) / 10}
            </span>{' '}
            {noun} per cycle · average of the last {recent.length}
          </p>
          <BarChart
            title={`Completed ${noun} per cycle`}
            seriesLabel={`Completed ${noun}`}
            bars={cycles.map((c) => ({
              label: c.label,
              value: completedOf(c.totals, effective),
              details: [
                { label: 'Cycle', value: c.name },
                { label: 'Scope', value: String(scopeOf(c.totals, effective)) },
              ],
            }))}
            reference={{ label: `Average (last ${recent.length})`, value: average }}
          />
        </>
      )}
    </ChartCard>
  );
}
