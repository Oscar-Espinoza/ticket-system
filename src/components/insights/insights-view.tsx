'use client';

import { useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3 } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui-icons';
// Types only: @/lib/insights is server code (db).
import type { InsightRange, ProjectInsights } from '@/lib/insights';
import { cn } from '@/lib/utils';
import { BarList } from './bar-list';
import { formatHours, formatWeek } from './chart-kit';
import { ColumnChart } from './column-chart';
import { TrendChart } from './trend-chart';

const ALL = 'all';

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4', className)}>
      <header>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-medium tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function InsightsView({
  data,
  weeks,
  ranges,
  labelId,
}: {
  data: ProjectInsights;
  weeks: InsightRange;
  ranges: readonly InsightRange[];
  labelId: string | null;
}) {
  const { labels } = useProjectData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const { totals } = data;
  const nothing = totals.open === 0 && totals.created === 0 && totals.completed === 0;
  const avgThroughput = totals.completed / weeks;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(weeks)} onValueChange={(v) => setParam('range', v)}>
          <SelectTrigger size="sm" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranges.map((w) => (
              <SelectItem key={w} value={String(w)}>
                Last {w} weeks
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={labelId ?? ALL} onValueChange={(v) => setParam('label', v === ALL ? null : v)}>
          <SelectTrigger size="sm" aria-label="Label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All labels</SelectItem>
            {labels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.weeks[0] && (
          <span className="ml-auto text-xs text-muted-foreground">
            Since {formatWeek(data.weeks[0].week)} · UTC weeks
          </span>
        )}
      </div>

      <div className={cn('flex flex-col gap-4 transition-opacity', pending && 'opacity-60')} aria-busy={pending}>
        {nothing ? (
          <EmptyState
            icon={<BarChart3 />}
            title="Nothing to chart yet"
            description={
              labelId
                ? 'No issues with this label in the selected range.'
                : 'Create and complete a few issues and their flow shows up here.'
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Stat label="Open issues" value={totals.open} />
              <Stat label="Created" value={totals.created} hint={`last ${weeks} weeks`} />
              <Stat label="Completed" value={totals.completed} hint={`${avgThroughput.toFixed(1)} per week`} />
              <Stat
                label="Median cycle time"
                value={formatHours(data.cycleTime.medianHours)}
                hint="started → done"
              />
              <Stat
                label="Median lead time"
                value={formatHours(data.leadTime.medianHours)}
                hint="created → done"
              />
            </div>

            <Panel title="Created vs completed" description="Issues per week — is the backlog growing?">
              <TrendChart weeks={data.weeks} />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Throughput" description="Issues completed per week">
                <ColumnChart
                  caption="Issues completed per week"
                  unit="completed"
                  showAverage
                  data={data.weeks.map((w) => ({
                    label: formatWeek(w.week),
                    title: `Week of ${formatWeek(w.week)}`,
                    value: w.completed,
                  }))}
                />
              </Panel>
              <Panel title="Open by status">
                <BarList rows={data.byState} kind="state" />
              </Panel>
              <Panel title="Open by priority">
                <BarList rows={data.byPriority} kind="priority" />
              </Panel>
              <Panel title="Open by assignee">
                <BarList rows={data.byAssignee} kind="assignee" />
              </Panel>
              <Panel title="Open by label">
                <BarList rows={data.byLabel} kind="label" empty="No labelled open issues." />
              </Panel>
              <Panel
                title="Cycle time"
                description={`Started → done · ${data.cycleTime.count} issues completed in range`}
              >
                <ColumnChart
                  caption="Cycle time distribution"
                  unit="issues"
                  data={data.cycleTime.buckets.map((b) => ({ label: b.label, value: b.count }))}
                />
              </Panel>
              <Panel
                title="Lead time"
                description={`Created → done · ${data.leadTime.count} issues completed in range`}
              >
                <ColumnChart
                  caption="Lead time distribution"
                  unit="issues"
                  data={data.leadTime.buckets.map((b) => ({ label: b.label, value: b.count }))}
                />
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
