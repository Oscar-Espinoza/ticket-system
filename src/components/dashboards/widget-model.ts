// Dashboard widgets: the JSON stored in `dashboard.widgets` and its validation.
// Client-safe (the server actions normalise with the same functions).
//
// Stored shape per widget: { id, type, title, x, y, w, h, config }. Order is
// the array order (x mirrors the index); w/h are the size preset in grid cells.

import { normalizeIssueFilters, type IssueFilters } from '@/lib/issue-filtering';
import type { IssueRow } from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';

export const WIDGET_TYPES = ['number', 'bar', 'line', 'list', 'cycle', 'epic', 'timeInStatus'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_TYPE_LABEL: Record<WidgetType, string> = {
  number: 'Number',
  bar: 'Bar chart',
  line: 'Created vs completed',
  list: 'Issue list',
  cycle: 'Cycle progress',
  epic: 'Epic progress',
  timeInStatus: 'Time in status',
};

export const WIDGET_TYPE_DESCRIPTION: Record<WidgetType, string> = {
  number: 'Count of issues matching filters',
  bar: 'Issues grouped by a property',
  line: 'Issues created and completed per week',
  list: 'The top issues matching filters',
  cycle: 'Progress of the current cycle',
  epic: 'Done vs total per epic',
  timeInStatus: 'How long open issues sit in each status',
};

export type WidgetSize = 's' | 'm' | 'l' | 'xl';
export const WIDGET_SIZES: { id: WidgetSize; label: string; w: number; h: number }[] = [
  { id: 's', label: 'Small', w: 1, h: 1 },
  { id: 'm', label: 'Medium', w: 2, h: 1 },
  { id: 'l', label: 'Large', w: 2, h: 2 },
  { id: 'xl', label: 'Full width', w: 4, h: 2 },
];

export function sizeOf(widget: Pick<Widget, 'w' | 'h'>): WidgetSize {
  return WIDGET_SIZES.find((s) => s.w === widget.w && s.h === widget.h)?.id ?? 'm';
}

export const BAR_GROUPS = ['state', 'priority', 'assignee', 'label', 'customer', 'project'] as const;
export type BarGroupBy = (typeof BAR_GROUPS)[number];
export const BAR_GROUP_LABEL: Record<BarGroupBy, string> = {
  state: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  label: 'Label',
  customer: 'Customer',
  project: 'Project',
};

export const LINE_WEEKS = [4, 8, 12, 26, 52] as const;
export const LIST_LIMITS = [5, 10, 20, 50] as const;
export const LIST_ORDERS = ['updated', 'created', 'priority', 'dueDate'] as const;
export type ListOrder = (typeof LIST_ORDERS)[number];
export const LIST_ORDER_LABEL: Record<ListOrder, string> = {
  updated: 'Last updated',
  created: 'Newest',
  priority: 'Priority',
  dueDate: 'Due date',
};

export interface WidgetConfig {
  /** One project, or null = the dashboard's scope (its project, or all of the owner's). */
  projectId: string | null;
  /** Filters (and `q` query syntax) — the same matcher as issue views. */
  filters: IssueFilters;
  groupBy: BarGroupBy;
  weeks: number;
  limit: number;
  orderBy: ListOrder;
  /** Epic widget: one epic, or null = every epic in scope. */
  epicId: string | null;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: WidgetConfig;
}

export const MAX_WIDGETS = 24;
const MAX_TITLE = 80;

const DEFAULTS: Record<WidgetType, { title: string; size: WidgetSize; config?: Partial<WidgetConfig>; q?: string }> = {
  number: { title: 'Open issues', size: 's', q: 'is:open' },
  bar: { title: 'Open issues by status', size: 'm', q: 'is:open', config: { groupBy: 'state' } },
  line: { title: 'Created vs completed', size: 'l', config: { weeks: 12 } },
  list: { title: 'Recently updated', size: 'l', q: 'is:open', config: { orderBy: 'updated', limit: 10 } },
  cycle: { title: 'Current cycle', size: 'm' },
  epic: { title: 'Epic progress', size: 'm' },
  timeInStatus: { title: 'Time in status', size: 'm', q: 'is:open' },
};

const BASE_CONFIG: WidgetConfig = {
  projectId: null,
  filters: normalizeIssueFilters({}),
  groupBy: 'state',
  weeks: 12,
  limit: 10,
  orderBy: 'updated',
  epicId: null,
};

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function newWidget(type: WidgetType, projectId: string | null = null): Widget {
  const d = DEFAULTS[type];
  const size = WIDGET_SIZES.find((s) => s.id === d.size)!;
  return {
    id: newId(),
    type,
    title: d.title,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    config: {
      ...BASE_CONFIG,
      ...d.config,
      projectId,
      filters: normalizeIssueFilters({ q: d.q ?? '' }),
    },
  };
}

/** A new dashboard's starter widgets. */
export function starterWidgets(): Widget[] {
  return normalizeWidgets([newWidget('number'), newWidget('bar'), newWidget('line'), newWidget('list')]);
}

const oneOf = <T extends string | number>(allowed: readonly T[], value: unknown, fallback: T): T =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
const idOrNull = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : null;

export function normalizeWidget(value: unknown): Widget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const type = (WIDGET_TYPES as readonly unknown[]).includes(raw.type) ? (raw.type as WidgetType) : null;
  if (!type) return null;
  const config = (raw.config && typeof raw.config === 'object' ? raw.config : {}) as Record<string, unknown>;
  const size = WIDGET_SIZES.find((s) => s.w === raw.w && s.h === raw.h) ?? WIDGET_SIZES.find((s) => s.id === DEFAULTS[type].size)!;
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE) : '';
  return {
    id: idOrNull(raw.id) ?? newId(),
    type,
    title: title || DEFAULTS[type].title,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    config: {
      projectId: idOrNull(config.projectId),
      filters: normalizeIssueFilters(config.filters),
      groupBy: oneOf(BAR_GROUPS, config.groupBy, 'state'),
      weeks: oneOf(LINE_WEEKS, config.weeks, 12),
      limit: oneOf(LIST_LIMITS, config.limit, 10),
      orderBy: oneOf(LIST_ORDERS, config.orderBy, 'updated'),
      epicId: idOrNull(config.epicId),
    },
  };
}

/** Any JSON → valid widgets (unknown entries dropped, ids unique, x = index). */
export function normalizeWidgets(value: unknown): Widget[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const item of value.slice(0, MAX_WIDGETS)) {
    const widget = normalizeWidget(item);
    if (!widget) continue;
    if (seen.has(widget.id)) widget.id = newId();
    seen.add(widget.id);
    widgets.push({ ...widget, x: widgets.length });
  }
  return widgets;
}

/** Data every widget computes from (loaded by lib/dashboards, sent once). */
export interface DashboardDataset {
  viewerId: string;
  /** The scoped projects the viewer belongs to. */
  projects: ProjectData[];
  /** Non-deleted issues of those projects (archived included; no descriptions). */
  issues: IssueRow[];
  /** Customer requests linked to issues (bar chart by customer). */
  customerLinks: { ticketId: string; customerId: string; customerName: string }[];
  /** Issue loading hit the cap — counts may be partial. */
  truncated: boolean;
}

export interface DashboardRecord {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
  shared: boolean;
  ownerId: string;
  ownerName: string | null;
  widgets: Widget[];
  updatedAt: Date;
}

export const dashboardHref = (id: string) => `/dashboard/dashboards/${id}`;
