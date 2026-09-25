'use client';

// The content of one widget card, by type. Charts reuse the insights kit
// (BarList, TrendChart); lists reuse NavIssueRow (cross-project safe).

import Link from 'next/link';

import { epicPath } from '@/components/epics/epic-model';
import { EpicIcon, ProgressRing } from '@/components/epics/epic-glyphs';
import { BarList } from '@/components/insights/bar-list';
import { TrendChart } from '@/components/insights/trend-chart';
import { NavIssueRow } from '@/components/navigation/nav-issue-row';
import { StatusIcon } from '@/components/ui-icons';
import {
  barRows,
  cycleProgress,
  epicProgress,
  formatDays,
  listIssues,
  timeInStatus,
  weekPoints,
  widgetIssues,
} from './widget-data';
import type { DashboardDataset, Widget } from './widget-model';

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Bar({ value, total, color }: { value: number; total: number; color?: string | null }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span
        className="block h-full rounded-full bg-primary/80"
        style={{ width: `${percent}%`, backgroundColor: color ?? undefined }}
      />
    </span>
  );
}

export function WidgetBody({ widget, dataset, now }: { widget: Widget; dataset: DashboardDataset; now: number }) {
  if (widget.config.projectId && !dataset.projects.some((p) => p.project.id === widget.config.projectId)) {
    return <Muted>This widget uses a project you can’t access.</Muted>;
  }

  switch (widget.type) {
    case 'number': {
      const count = widgetIssues(widget, dataset, now).length;
      return (
        <div className="flex flex-1 flex-col justify-end">
          <span className="text-4xl font-medium tabular-nums">{count}</span>
          <span className="text-xs text-muted-foreground">{count === 1 ? 'issue' : 'issues'}</span>
        </div>
      );
    }

    case 'bar': {
      const rows = barRows(widget, widgetIssues(widget, dataset, now), dataset);
      const kind =
        widget.config.groupBy === 'state' || widget.config.groupBy === 'priority' || widget.config.groupBy === 'assignee'
          ? widget.config.groupBy
          : 'label';
      if (widget.config.groupBy === 'customer' && dataset.customerLinks.length === 0) {
        return <Muted>No issues are linked to customers yet.</Muted>;
      }
      return <BarList rows={rows} kind={kind} empty="No matching issues." />;
    }

    case 'line': {
      const points = weekPoints(widgetIssues(widget, dataset, now, true), widget.config.weeks, now);
      return <TrendChart weeks={points} />;
    }

    case 'list': {
      const issues = listIssues(widget, widgetIssues(widget, dataset, now));
      if (issues.length === 0) return <Muted>No matching issues.</Muted>;
      const names = new Map(dataset.projects.map((p) => [p.project.id, p.project.name]));
      const multi = dataset.projects.length > 1 && !widget.config.projectId;
      return (
        <div className="-mx-2 flex flex-col gap-px">
          {issues.map((issue) => (
            <NavIssueRow key={issue.id} issue={issue} project={multi ? names.get(issue.projectId) : undefined} />
          ))}
        </div>
      );
    }

    case 'cycle': {
      const cycles = cycleProgress(widget, widgetIssues(widget, dataset, now), dataset, now);
      if (cycles.length === 0) return <Muted>No active cycle.</Muted>;
      return (
        <ul className="flex flex-col gap-3">
          {cycles.map(({ project, cycle, total, completed, started, daysLeft }) => {
            const percent = total ? Math.round((completed / total) * 100) : 0;
            return (
              <li key={cycle.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2 text-sm">
                  <Link
                    href={`/dashboard/projects/${project.id}/cycles/${cycle.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {cycle.name || `Cycle ${cycle.number}`}
                  </Link>
                  {cycles.length > 1 && <span className="font-mono text-xs text-muted-foreground">{project.ticketKey}</span>}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {daysLeft === 0 ? 'Last day' : `${daysLeft}d left`}
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="bg-status-done" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
                  <span className="bg-amber-500/70" style={{ width: `${total ? (started / total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {percent}% · {completed} done · {started} in progress · {total - completed - started} not started
                </p>
              </li>
            );
          })}
        </ul>
      );
    }

    case 'epic': {
      const epics = epicProgress(widget, widgetIssues(widget, dataset, now), dataset);
      if (epics.length === 0) return <Muted>No epics in scope.</Muted>;
      const multi = new Set(epics.map((e) => e.projectId)).size > 1;
      return (
        <ul className="flex flex-col gap-2">
          {epics.map(({ epic, projectId, projectKey, total, done }) => {
            const percent = total ? Math.round((done / total) * 100) : 0;
            return (
              <li key={epic.id} className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-sm">
                <Link href={epicPath(projectId, epic.id)} className="flex min-w-0 items-center gap-2 hover:underline">
                  <EpicIcon color={epic.color} />
                  <span className="truncate">{epic.name}</span>
                  {multi && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{projectKey}</span>}
                </Link>
                <Bar value={done} total={total} color={epic.color} />
                <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground tabular-nums">
                  <ProgressRing percent={percent} size={14} color={epic.color} />
                  {done}/{total}
                </span>
              </li>
            );
          })}
        </ul>
      );
    }

    case 'timeInStatus': {
      const rows = timeInStatus(widgetIssues(widget, dataset, now), now);
      if (rows.length === 0) return <Muted>No open issues.</Muted>;
      const max = Math.max(...rows.map((r) => r.medianDays), 1 / 24);
      return (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-[minmax(0,9rem)_1fr_5.5rem] items-center gap-3 text-sm"
              title={`${row.count} issue${row.count === 1 ? '' : 's'} · median ${formatDays(row.medianDays)} · longest ${formatDays(row.maxDays)}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {row.stateType && <StatusIcon type={row.stateType} color={row.color ?? undefined} size={14} />}
                <span className="truncate">{row.label}</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (row.medianDays / max) * 100)}%`,
                    backgroundColor: row.color ?? undefined,
                  }}
                />
              </span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {formatDays(row.medianDays)} · {row.count}
              </span>
            </li>
          ))}
        </ul>
      );
    }
  }
}
