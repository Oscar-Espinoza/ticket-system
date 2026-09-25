// Issue filters: one plain-JSON shape that round-trips through the URL
// (`?state=…&assignee=…`) and saved views, plus the pure matcher every issue
// view runs on the client. Client-safe; only type imports from issue-model so
// issue-model can re-export this module without an import cycle.

import type { IssueRow, Priority, StateType } from '@/lib/issue-model';

/** Assignee value for "No assignee". */
export const UNASSIGNED = 'unassigned';
/** Assignee / creator value resolved to the viewer at filter time. */
export const ME = 'me';
/** "No label" / "No cycle" / "No epic". */
export const NONE = 'none';

export type DueFilter = 'overdue' | 'today' | 'thisWeek' | 'nextWeek' | 'none';
export type RelativeRange = '1d' | '7d' | '30d' | '90d';
export type HierarchyFilter = 'hasSubIssues' | 'isSubIssue';

export const DUE_FILTERS: DueFilter[] = ['overdue', 'today', 'thisWeek', 'nextWeek', 'none'];
export const DUE_FILTER_LABEL: Record<DueFilter, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  thisWeek: 'Due this week',
  nextWeek: 'Due next week',
  none: 'No due date',
};
export const RELATIVE_RANGES: RelativeRange[] = ['1d', '7d', '30d', '90d'];
export const RELATIVE_RANGE_LABEL: Record<RelativeRange, string> = {
  '1d': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};
const RANGE_DAYS: Record<RelativeRange, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };
export const HIERARCHY_FILTERS: HierarchyFilter[] = ['hasSubIssues', 'isSubIssue'];
export const HIERARCHY_FILTER_LABEL: Record<HierarchyFilter, string> = {
  hasSubIssues: 'Has sub-issues',
  isSubIssue: 'Is a sub-issue',
};

// Local copies (not imports) of the enum values — see the header comment.
const STATE_TYPES: StateType[] = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

/**
 * Within a property the values are any-of; properties combine with AND.
 * Empty list / null / '' = the property doesn't filter.
 */
export interface IssueFilters {
  /** Case-insensitive substring of title or key. */
  q: string;
  stateIds: string[];
  /** Whole categories ("any started state"); OR-ed with stateIds. */
  stateTypes: StateType[];
  /** User ids, UNASSIGNED or ME. */
  assigneeIds: string[];
  /** User ids or ME. */
  creatorIds: string[];
  priorities: Priority[];
  /** Label ids or NONE — any-of. */
  labelIds: string[];
  /** Cycle ids or NONE. */
  cycleIds: string[];
  /** Epic ids or NONE. */
  epicIds: string[];
  due: DueFilter[];
  created: RelativeRange | null;
  updated: RelativeRange | null;
  hierarchy: HierarchyFilter[];
}

export const EMPTY_FILTERS: IssueFilters = {
  q: '',
  stateIds: [],
  stateTypes: [],
  assigneeIds: [],
  creatorIds: [],
  priorities: [],
  labelIds: [],
  cycleIds: [],
  epicIds: [],
  due: [],
  created: null,
  updated: null,
  hierarchy: [],
};

/**
 * What filterIssues accepts: full or partial filters, plus the pre-B5 shape
 * `{ stateIds, assignee }` (tests and older callers).
 */
export type IssueFilterInput = Partial<IssueFilters> & { assignee?: string | null };

type ListKey = {
  [K in keyof IssueFilters]: IssueFilters[K] extends unknown[] ? K : never;
}[keyof IssueFilters];

// URL param per field. `state` and `assignee` predate B5 — keep them.
const LIST_PARAMS: Record<ListKey, string> = {
  stateIds: 'state',
  stateTypes: 'stateType',
  assigneeIds: 'assignee',
  creatorIds: 'creator',
  priorities: 'priority',
  labelIds: 'label',
  cycleIds: 'cycle',
  epicIds: 'epic',
  due: 'due',
  hierarchy: 'hierarchy',
};

/** Every URL param the filters own (for "does the URL carry filters?"). */
export const FILTER_PARAM_NAMES: string[] = ['q', 'created', 'updated', ...Object.values(LIST_PARAMS)];

const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (value: string): value is T =>
    (allowed as readonly string[]).includes(value);

// Enum-typed lists drop unknown values; id lists keep anything non-empty
// (a deleted label simply matches nothing).
const LIST_GUARD: Partial<Record<ListKey, (value: string) => boolean>> = {
  stateTypes: oneOf(STATE_TYPES),
  priorities: oneOf(PRIORITIES),
  due: oneOf(DUE_FILTERS),
  hierarchy: oneOf(HIERARCHY_FILTERS),
};
const isRange = oneOf(RELATIVE_RANGES);

function cleanList(key: ListKey, values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const guard = LIST_GUARD[key];
  const items = values
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v && v.length <= 200 && (!guard || guard(v)));
  return [...new Set(items)];
}

/** Any JSON (saved view, localStorage) → valid filters; unknown keys dropped. */
export function normalizeIssueFilters(value: unknown): IssueFilters {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const filters: IssueFilters = { ...EMPTY_FILTERS };
  for (const key of Object.keys(LIST_PARAMS) as ListKey[]) {
    (filters as unknown as Record<string, string[]>)[key] = cleanList(key, raw[key]);
  }
  // Legacy single assignee.
  if (filters.assigneeIds.length === 0 && typeof raw.assignee === 'string' && raw.assignee) {
    filters.assigneeIds = [raw.assignee];
  }
  filters.q = typeof raw.q === 'string' ? raw.q.slice(0, 200) : '';
  filters.created = typeof raw.created === 'string' && isRange(raw.created) ? raw.created : null;
  filters.updated = typeof raw.updated === 'string' && isRange(raw.updated) ? raw.updated : null;
  return filters;
}

type SearchParamValue = string | string[] | null | undefined;
type SearchParamsLike =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, SearchParamValue>;

function reader(params: SearchParamsLike): (name: string) => string | undefined {
  if (typeof (params as URLSearchParams).get === 'function') {
    return (name) => (params as URLSearchParams).get(name) ?? undefined;
  }
  return (name) => {
    const value = (params as Record<string, SearchParamValue>)[name];
    return (Array.isArray(value) ? value[0] : value) ?? undefined;
  };
}

/** URL params (URLSearchParams, useSearchParams(), or a page's searchParams) → filters. */
export function filtersFromSearchParams(params: SearchParamsLike): IssueFilters {
  const get = reader(params);
  const raw: Record<string, unknown> = {
    q: get('q') ?? '',
    created: get('created'),
    updated: get('updated'),
  };
  for (const [key, param] of Object.entries(LIST_PARAMS)) {
    raw[key] = (get(param) ?? '').split(',');
  }
  return normalizeIssueFilters(raw);
}

/**
 * Filters → URL param changes, one entry per filter param (null = remove it),
 * ready for `setSearchParams` / `URLSearchParams.set`.
 */
export function filtersToSearchParams(filters: IssueFilters): Record<string, string | null> {
  const params: Record<string, string | null> = {
    q: filters.q.trim() || null,
    created: filters.created,
    updated: filters.updated,
  };
  for (const [key, param] of Object.entries(LIST_PARAMS) as [ListKey, string][]) {
    const values = filters[key] as string[];
    params[param] = values.length ? values.join(',') : null;
  }
  return params;
}

/** Stable string form (URL query order) — cheap equality for filters. */
export function filtersKey(filters: IssueFilters): string {
  return Object.entries(filtersToSearchParams(filters))
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function isFilterActive(filters: IssueFilterInput): boolean {
  return filtersKey(normalizeIssueFilters(filters)) !== '';
}

export interface FilterContext {
  /** Resolves ME. Without it, ME matches nothing. */
  viewerId?: string | null;
  /** Issues used to know who has sub-issues (default: the filtered list itself). */
  allIssues?: IssueRow[];
  /** YYYY-MM-DD "today" in the viewer's calendar (default: now, local). */
  today?: string;
  now?: number;
}

function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDateString(new Date(y, m - 1, d + days));
}

/** Monday..Sunday bounds of the week containing `today`, offset by `weeks`. */
function weekBounds(today: string, weeks: number): [string, string] {
  const [y, m, d] = today.split('-').map(Number);
  const mondayOffset = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const monday = shiftDays(today, -mondayOffset + weeks * 7);
  return [monday, shiftDays(monday, 6)];
}

function matchesDue(issue: IssueRow, due: DueFilter, today: string): boolean {
  const date = issue.dueDate;
  if (due === 'none') return date === null;
  if (date === null) return false;
  switch (due) {
    case 'overdue':
      return date < today && issue.state.type !== 'completed' && issue.state.type !== 'canceled';
    case 'today':
      return date === today;
    case 'thisWeek':
    case 'nextWeek': {
      const [start, end] = weekBounds(today, due === 'thisWeek' ? 0 : 1);
      return date >= start && date <= end;
    }
  }
}

function withinRange(date: Date, range: RelativeRange, now: number): boolean {
  return new Date(date).getTime() >= now - RANGE_DAYS[range] * 86_400_000;
}

/** A predicate for one set of filters (resolve once, test many issues). */
export function issueMatcher(
  input: IssueFilterInput,
  context: FilterContext & { issues?: IssueRow[] } = {},
): (issue: IssueRow) => boolean {
  const f = normalizeIssueFilters(input);
  const viewer = context.viewerId ?? null;
  const resolveMe = (ids: string[]) => ids.map((id) => (id === ME ? viewer : id));
  const assignees = new Set(resolveMe(f.assigneeIds));
  const creators = new Set(resolveMe(f.creatorIds));
  const stateIds = new Set(f.stateIds);
  const stateTypes = new Set<string>(f.stateTypes);
  const labels = new Set(f.labelIds);
  const q = f.q.trim().toLowerCase();
  const today = context.today ?? localDateString(new Date());
  const now = context.now ?? Date.now();
  const parents = f.hierarchy.includes('hasSubIssues')
    ? new Set((context.allIssues ?? context.issues ?? []).map((i) => i.parentId).filter(Boolean))
    : null;

  return (issue) => {
    if (q && !issue.title.toLowerCase().includes(q) && !issue.key.toLowerCase().includes(q)) {
      return false;
    }
    if ((stateIds.size || stateTypes.size) && !stateIds.has(issue.stateId) && !stateTypes.has(issue.state.type)) {
      return false;
    }
    if (assignees.size) {
      const id = issue.assignee?.id ?? null;
      if (!(id === null ? assignees.has(UNASSIGNED) : assignees.has(id))) return false;
    }
    if (creators.size && !(issue.creator && creators.has(issue.creator.id))) return false;
    if (f.priorities.length && !f.priorities.includes(issue.priority)) return false;
    if (labels.size) {
      const hit =
        issue.labels.length === 0 ? labels.has(NONE) : issue.labels.some((l) => labels.has(l.id));
      if (!hit) return false;
    }
    if (f.cycleIds.length && !f.cycleIds.includes(issue.cycleId ?? NONE)) return false;
    if (f.epicIds.length && !f.epicIds.includes(issue.epicId ?? NONE)) return false;
    if (f.due.length && !f.due.some((due) => matchesDue(issue, due, today))) return false;
    if (f.created && !withinRange(issue.createdAt, f.created, now)) return false;
    if (f.updated && !withinRange(issue.updatedAt, f.updated, now)) return false;
    if (f.hierarchy.length) {
      const hit =
        (f.hierarchy.includes('isSubIssue') && issue.parentId !== null) ||
        (parents !== null && parents.has(issue.id));
      if (!hit) return false;
    }
    return true;
  };
}

export function matchesFilters(
  issue: IssueRow,
  filters: IssueFilterInput,
  context: FilterContext = {},
): boolean {
  return issueMatcher(filters, context)(issue);
}

export function filterIssues(
  issues: IssueRow[],
  filters: IssueFilterInput,
  context: FilterContext = {},
): IssueRow[] {
  if (!isFilterActive(filters)) return issues;
  return issues.filter(issueMatcher(filters, { ...context, issues }));
}
