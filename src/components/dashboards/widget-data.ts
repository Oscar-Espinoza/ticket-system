// Widget values, computed on the client from the dashboard dataset with the
// same filter matcher the issue views use — so a widget's filters mean exactly
// what they mean on a list, and edits re-render without a server round trip.

import { filterIssues, parseSearchQuery, searchIs, type FilterContext } from '@/lib/issue-filtering';
import { sortIssues } from '@/lib/issue-grouping';
import { PRIORITY_ORDER, type IssueRow, type StateType } from '@/lib/issue-model';
import type { BreakdownRow, WeekPoint } from '@/lib/insights';
import type { CycleSummary, EpicSummary, ProjectData } from '@/lib/project-data-types';
import { isClosed } from '@/lib/workflow';
import type { DashboardDataset, Widget } from './widget-model';

const DAY_MS = 86_400_000;

/** The projects a widget covers (its own, else the whole dashboard scope). */
export function widgetProjects(widget: Widget, dataset: DashboardDataset): ProjectData[] {
  const { projectId } = widget.config;
  return projectId ? dataset.projects.filter((p) => p.project.id === projectId) : dataset.projects;
}

export function filterContext(dataset: DashboardDataset, projects: ProjectData[], now: number): FilterContext {
  return {
    viewerId: dataset.viewerId,
    now,
    cycles: projects.flatMap((p) => p.cycles),
    epics: projects.flatMap((p) => p.epics),
    projects: projects.map((p) => ({ id: p.project.id, name: p.project.name, ticketKey: p.project.ticketKey })),
  };
}

/**
 * Issues matching a widget. Archived issues only count as history (the line
 * chart) or when the query asks for them (`is:archived`).
 */
export function widgetIssues(widget: Widget, dataset: DashboardDataset, now: number, history = false): IssueRow[] {
  const projects = widgetProjects(widget, dataset);
  const ids = new Set(projects.map((p) => p.project.id));
  const wantsArchived = parseSearchQuery(widget.config.filters.q).terms.some(
    (t) => t.key === 'is' && !t.negate && t.values.some((v) => searchIs(v) === 'archived'),
  );
  const scope = dataset.issues.filter(
    (issue) => ids.has(issue.projectId) && (history || wantsArchived || issue.archivedAt === null),
  );
  return filterIssues(scope, widget.config.filters, { ...filterContext(dataset, projects, now), allIssues: scope });
}

// --- bar -------------------------------------------------------------------

const STATE_TYPES: StateType[] = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];

export function barRows(widget: Widget, issues: IssueRow[], dataset: DashboardDataset): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const order = new Map<string, number>();
  const bump = (id: string, make: () => Omit<BreakdownRow, 'count' | 'id'> & { order?: number }) => {
    const row = rows.get(id);
    if (row) {
      row.count += 1;
      return;
    }
    const { order: position = 0, ...rest } = make();
    rows.set(id, { id, count: 1, ...rest });
    order.set(id, position);
  };

  for (const issue of issues) {
    switch (widget.config.groupBy) {
      case 'state':
        // Across projects, same-named states are one bar.
        bump(`${issue.state.type}:${issue.state.name.toLowerCase()}`, () => ({
          label: issue.state.name,
          color: issue.state.color,
          stateType: issue.state.type,
          order: STATE_TYPES.indexOf(issue.state.type) * 1000 + issue.state.position,
        }));
        break;
      case 'priority':
        bump(issue.priority, () => ({
          label: issue.priority,
          priority: issue.priority,
          order: PRIORITY_ORDER.indexOf(issue.priority),
        }));
        break;
      case 'assignee':
        bump(issue.assignee?.id ?? 'unassigned', () => ({
          label: issue.assignee?.name ?? 'Unassigned',
          image: issue.assignee?.image ?? null,
        }));
        break;
      case 'label':
        for (const label of issue.labels) {
          bump(label.name.toLowerCase(), () => ({ label: label.name, color: label.color }));
        }
        break;
      case 'project': {
        const project = dataset.projects.find((p) => p.project.id === issue.projectId)?.project;
        bump(issue.projectId, () => ({ label: project?.name ?? 'Unknown project' }));
        break;
      }
      case 'customer':
        break;
    }
  }

  if (widget.config.groupBy === 'customer') {
    const ids = new Set(issues.map((i) => i.id));
    const counted = new Set<string>();
    for (const link of dataset.customerLinks) {
      const key = `${link.customerId}:${link.ticketId}`;
      if (!ids.has(link.ticketId) || counted.has(key)) continue;
      counted.add(key);
      bump(link.customerId, () => ({ label: link.customerName }));
    }
  }

  const ordered = widget.config.groupBy === 'state' || widget.config.groupBy === 'priority';
  return [...rows.values()].sort((a, b) =>
    ordered ? order.get(a.id)! - order.get(b.id)! : b.count - a.count || a.label.localeCompare(b.label),
  );
}

// --- line ------------------------------------------------------------------

/** Monday 00:00 UTC of the week `weeks - 1` weeks back (matches lib/insights). */
function rangeStart(weeks: number, now: number): number {
  const date = new Date(now);
  const day = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day - (weeks - 1) * 7);
}

export function weekPoints(issues: IssueRow[], weeks: number, now: number): WeekPoint[] {
  const start = rangeStart(weeks, now);
  const points: WeekPoint[] = Array.from({ length: weeks }, (_, i) => ({
    week: new Date(start + i * 7 * DAY_MS).toISOString().slice(0, 10),
    created: 0,
    completed: 0,
  }));
  const slot = (date: Date | null) => {
    if (!date) return -1;
    const index = Math.floor((new Date(date).getTime() - start) / (7 * DAY_MS));
    return index >= 0 && index < weeks ? index : -1;
  };
  for (const issue of issues) {
    const c = slot(issue.createdAt);
    if (c >= 0) points[c].created += 1;
    const d = slot(issue.completedAt);
    if (d >= 0) points[d].completed += 1;
  }
  return points;
}

// --- list ------------------------------------------------------------------

export function listIssues(widget: Widget, issues: IssueRow[]): IssueRow[] {
  const sorted =
    widget.config.orderBy === 'dueDate'
      ? // Due soonest first; undated last.
        [...issues].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      : sortIssues(issues, widget.config.orderBy);
  return sorted.slice(0, widget.config.limit);
}

// --- cycle -----------------------------------------------------------------

export interface CycleProgress {
  project: ProjectData['project'];
  cycle: CycleSummary;
  total: number;
  completed: number;
  started: number;
  /** Whole days left (0 on the last day). */
  daysLeft: number;
}

function currentCycle(cycles: CycleSummary[], now: number): CycleSummary | null {
  return (
    cycles.find(
      (c) => new Date(c.startsAt).getTime() <= now && now < new Date(c.endsAt).getTime() && !c.completedAt,
    ) ?? null
  );
}

export function cycleProgress(widget: Widget, issues: IssueRow[], dataset: DashboardDataset, now: number): CycleProgress[] {
  return widgetProjects(widget, dataset).flatMap((data) => {
    const cycle = currentCycle(data.cycles, now);
    if (!cycle) return [];
    const inCycle = issues.filter((i) => i.cycleId === cycle.id);
    return [
      {
        project: data.project,
        cycle,
        total: inCycle.length,
        completed: inCycle.filter((i) => isClosed(i.state.type)).length,
        started: inCycle.filter((i) => i.state.type === 'started').length,
        daysLeft: Math.max(0, Math.ceil((new Date(cycle.endsAt).getTime() - now) / DAY_MS) - 1),
      },
    ];
  });
}

// --- epic ------------------------------------------------------------------

export interface EpicProgress {
  epic: EpicSummary;
  projectId: string;
  projectKey: string;
  total: number;
  done: number;
  started: number;
}

export function epicProgress(widget: Widget, issues: IssueRow[], dataset: DashboardDataset): EpicProgress[] {
  const counts = new Map<string, { total: number; done: number; started: number }>();
  for (const issue of issues) {
    if (!issue.epicId) continue;
    const count = counts.get(issue.epicId) ?? { total: 0, done: 0, started: 0 };
    count.total += 1;
    if (isClosed(issue.state.type)) count.done += 1;
    else if (issue.state.type === 'started') count.started += 1;
    counts.set(issue.epicId, count);
  }
  return widgetProjects(widget, dataset).flatMap((data) =>
    data.epics
      .filter((epic) => (widget.config.epicId ? epic.id === widget.config.epicId : epic.status !== 'canceled'))
      .map((epic) => ({
        epic,
        projectId: data.project.id,
        projectKey: data.project.ticketKey,
        ...(counts.get(epic.id) ?? { total: 0, done: 0, started: 0 }),
      })),
  );
}

// --- time in status ----------------------------------------------------------

export interface StatusTime extends BreakdownRow {
  /** Median days in the current status. */
  medianDays: number;
  maxDays: number;
}

/**
 * How long open issues have sat in their current status, per status, from
 * `stateChangedAt` (creation time when the issue never moved).
 */
export function timeInStatus(issues: IssueRow[], now: number): StatusTime[] {
  const groups = new Map<string, { row: BreakdownRow; order: number; days: number[] }>();
  for (const issue of issues) {
    if (isClosed(issue.state.type)) continue;
    const since = new Date(issue.stateChangedAt ?? issue.createdAt).getTime();
    const days = Math.max(0, (now - since) / DAY_MS);
    const key = `${issue.state.type}:${issue.state.name.toLowerCase()}`;
    const group = groups.get(key) ?? {
      row: { id: key, label: issue.state.name, color: issue.state.color, stateType: issue.state.type, count: 0 },
      order: STATE_TYPES.indexOf(issue.state.type) * 1000 + issue.state.position,
      days: [],
    };
    group.days.push(days);
    group.row.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ row, days }) => {
      const sorted = days.sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return { ...row, medianDays: median, maxDays: sorted[sorted.length - 1] };
    });
}

/** "4h" · "2.5d" · "3w" */
export function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 14) return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}
