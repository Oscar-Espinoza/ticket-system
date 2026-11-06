// Issue filters: one plain-JSON shape that round-trips through the URL
// (`?state=…&assignee=…`) and saved views, plus the pure matcher every issue
// view runs on the client. Client-safe.

import { toDateString, weekRange } from '@/lib/dates';
import {
  PRIORITY_ORDER,
  STATE_TYPE_ORDER,
  type IssueRow,
  type Priority,
  type StateType,
} from '@/lib/issue-model';
import { DAY_MS, HOUR_MS } from '@/lib/time';
import { isClosed } from '@/lib/workflow';

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
  stateTypes: oneOf(STATE_TYPE_ORDER),
  priorities: oneOf(PRIORITY_ORDER),
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
  /**
   * Lookups for `cycle:` / `epic:` / `project:` query terms (IssueRow only has
   * ids). Without them those terms are ignored rather than matching nothing.
   */
  cycles?: SearchCycle[];
  epics?: { id: string; name: string }[];
  projects?: { id: string; name: string; ticketKey: string }[];
}

function matchesDue(issue: IssueRow, due: DueFilter, today: string): boolean {
  const date = issue.dueDate;
  if (due === 'none') return date === null;
  if (date === null) return false;
  switch (due) {
    case 'overdue':
      return date < today && !isClosed(issue.state.type);
    case 'today':
      return date === today;
    case 'thisWeek':
    case 'nextWeek': {
      const [start, end] = weekRange(today, due === 'thisWeek' ? 0 : 1);
      return date >= start && date <= end;
    }
  }
}

function withinRange(date: Date, range: RelativeRange, now: number): boolean {
  return new Date(date).getTime() >= now - RANGE_DAYS[range] * DAY_MS;
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
  // `q` may carry query syntax (label:bug -is:closed …): terms become extra
  // predicates, the rest is the plain title / ID substring.
  const search = parseSearchQuery(f.q);
  const words = search.text.replace(/"/g, ' ').split(/\s+/).filter(Boolean);
  const excluded = words.filter((w) => w.length > 1 && w.startsWith('-')).map((w) => w.slice(1).toLowerCase());
  const q = words
    .filter((w) => !(w.length > 1 && w.startsWith('-')))
    .join(' ')
    .toLowerCase();
  const today = context.today ?? toDateString(new Date());
  const now = context.now ?? Date.now();
  const termTests = search.terms
    .map((term) => termPredicate(term, { ...context, viewerId: viewer, today, now }))
    .filter((test): test is (issue: IssueRow) => boolean => test !== null);
  const parents = f.hierarchy.includes('hasSubIssues')
    ? new Set((context.allIssues ?? context.issues ?? []).map((i) => i.parentId).filter(Boolean))
    : null;

  return (issue) => {
    if (q && !issue.title.toLowerCase().includes(q) && !issue.key.toLowerCase().includes(q)) {
      return false;
    }
    if (excluded.length) {
      const title = issue.title.toLowerCase();
      if (excluded.some((word) => title.includes(word))) return false;
    }
    if (termTests.length && !termTests.every((test) => test(issue))) return false;
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

// ---------------------------------------------------------------------------
// Query syntax: `label:bug assignee:me -is:closed "exact phrase" login`.
// Shared by the search page (SQL, lib/search.ts), the issues quick filter and
// dashboard widgets (issueMatcher above parses `filters.q`).
// ---------------------------------------------------------------------------

export type SearchKey =
  | 'is'
  | 'status'
  | 'type'
  | 'assignee'
  | 'creator'
  | 'priority'
  | 'label'
  | 'project'
  | 'cycle'
  | 'epic'
  | 'due'
  | 'created'
  | 'updated'
  | 'sla';

const SEARCH_KEY_ALIASES: Record<string, SearchKey> = {
  is: 'is',
  status: 'status',
  state: 'status',
  type: 'type',
  assignee: 'assignee',
  assigned: 'assignee',
  creator: 'creator',
  author: 'creator',
  priority: 'priority',
  label: 'label',
  labels: 'label',
  project: 'project',
  team: 'project',
  cycle: 'cycle',
  epic: 'epic',
  due: 'due',
  created: 'created',
  updated: 'updated',
  sla: 'sla',
};

export interface SearchTerm {
  key: SearchKey;
  /** Any-of (`label:bug,ui`); never empty. */
  values: string[];
  /** `-label:bug` */
  negate: boolean;
}

export interface ParsedSearch {
  /** Free text, quotes and `-word` kept (full-text search understands them). */
  text: string;
  terms: SearchTerm[];
}

const MAX_SEARCH_TERMS = 20;
const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);

export function parseSearchQuery(input: string): ParsedSearch {
  const source = (input ?? '').slice(0, 200);
  const text: string[] = [];
  const terms: SearchTerm[] = [];
  let i = 0;

  // `a,"b c",d` → ['a', 'b c', 'd']; stops at whitespace outside quotes.
  const readValues = (): string[] => {
    const values: string[] = [];
    for (;;) {
      let value: string;
      if (source[i] === '"') {
        const end = source.indexOf('"', i + 1);
        value = source.slice(i + 1, end === -1 ? source.length : end);
        i = end === -1 ? source.length : end + 1;
      } else {
        let j = i;
        while (j < source.length && !isSpace(source[j]) && source[j] !== ',') j++;
        value = source.slice(i, j);
        i = j;
      }
      value = value.trim();
      if (value) values.push(value);
      if (source[i] === ',') {
        i++;
        continue;
      }
      return values;
    }
  };

  while (i < source.length) {
    if (isSpace(source[i])) {
      i++;
      continue;
    }
    const start = i;
    const match = /^(-?)([a-z]+):/i.exec(source.slice(i));
    const key = match ? SEARCH_KEY_ALIASES[match[2].toLowerCase()] : undefined;
    if (match && key && terms.length < MAX_SEARCH_TERMS) {
      i += match[0].length;
      const values = readValues();
      if (values.length) {
        terms.push({ key, values, negate: match[1] === '-' });
        continue;
      }
      text.push(source.slice(start, i));
      continue;
    }
    if (source[i] === '"') {
      const end = source.indexOf('"', i + 1);
      const stop = end === -1 ? source.length : end + 1;
      text.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    let j = i;
    while (j < source.length && !isSpace(source[j])) j++;
    text.push(source.slice(i, j));
    i = j;
  }
  return { text: text.join(' '), terms };
}

export function formatSearchTerm(term: SearchTerm): string {
  const values = term.values.map((v) => (/[\s,"]/.test(v) ? `"${v.replace(/"/g, '')}"` : v));
  return `${term.negate ? '-' : ''}${term.key}:${values.join(',')}`;
}

export function formatSearchQuery(text: string, terms: SearchTerm[]): string {
  return [...terms.map(formatSearchTerm), text.trim()].filter(Boolean).join(' ');
}

// --- value vocabularies (shared with the SQL side) -------------------------

const STATE_TYPE_WORDS: Record<string, StateType> = {
  triage: 'triage',
  backlog: 'backlog',
  unstarted: 'unstarted',
  todo: 'unstarted',
  started: 'started',
  'in-progress': 'started',
  inprogress: 'started',
  completed: 'completed',
  done: 'completed',
  canceled: 'canceled',
  cancelled: 'canceled',
};

export function searchStateType(value: string): StateType | null {
  return STATE_TYPE_WORDS[value.toLowerCase()] ?? null;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: 'urgent',
  high: 'high',
  medium: 'medium',
  med: 'medium',
  low: 'low',
  none: 'none',
  no: 'none',
  // Linear's numbers: 0 = none, 1 = urgent … 4 = low.
  '0': 'none',
  '1': 'urgent',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
};

export function searchPriority(value: string): Priority | null {
  return PRIORITY_WORDS[value.toLowerCase()] ?? null;
}

const DUE_WORDS: Record<string, DueFilter> = {
  overdue: 'overdue',
  today: 'today',
  week: 'thisWeek',
  'this-week': 'thisWeek',
  thisweek: 'thisWeek',
  'next-week': 'nextWeek',
  nextweek: 'nextWeek',
  none: 'none',
};

export function searchDue(value: string): DueFilter | null {
  return DUE_WORDS[value.toLowerCase()] ?? null;
}

export type IsValue = 'open' | 'closed' | 'archived' | 'completed' | 'canceled';
const IS_WORDS: Record<string, IsValue> = {
  open: 'open',
  closed: 'closed',
  archived: 'archived',
  completed: 'completed',
  done: 'completed',
  canceled: 'canceled',
  cancelled: 'canceled',
};

export function searchIs(value: string): IsValue | null {
  return IS_WORDS[value.toLowerCase()] ?? null;
}

export type SlaValue = 'breached' | 'risk' | 'none' | 'any';
const SLA_WORDS: Record<string, SlaValue> = {
  breached: 'breached',
  risk: 'risk',
  'at-risk': 'risk',
  none: 'none',
  any: 'any',
};

export function searchSla(value: string): SlaValue | null {
  return SLA_WORDS[value.toLowerCase()] ?? null;
}

/** "At risk" = open with less than this left on the SLA clock. */
export const SLA_RISK_MS = 24 * HOUR_MS;

const UNIT_MS: Record<string, number> = {
  h: HOUR_MS,
  d: DAY_MS,
  w: 7 * DAY_MS,
  m: 30 * DAY_MS,
  y: 365 * DAY_MS,
};

/**
 * `>7d` older than 7 days · `<7d` / `7d` within the last 7 days ·
 * `>2026-01-01` after that day · `<2026-01-01` before it · `2026-01-01` on it.
 * Bounds in epoch ms (after inclusive, before exclusive); null = unparseable.
 */
export function searchTimeRange(value: string, now: number): { after?: number; before?: number } | null {
  const relative = /^([<>]=?)?(\d{1,4})([hdwmy])$/i.exec(value);
  if (relative) {
    const edge = now - Number(relative[2]) * UNIT_MS[relative[3].toLowerCase()];
    return relative[1]?.startsWith('>') ? { before: edge } : { after: edge };
  }
  const absolute = /^([<>]=?)?(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (absolute) {
    const [, op = '', y, m, d] = absolute;
    const start = new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    if (Number.isNaN(start)) return null;
    const next = new Date(Number(y), Number(m) - 1, Number(d) + 1).getTime();
    switch (op) {
      case '>':
        return { after: next };
      case '>=':
        return { after: start };
      case '<':
        return { before: start };
      case '<=':
        return { before: next };
      default:
        return { after: start, before: next };
    }
  }
  return null;
}

export type CycleWord = 'current' | 'next' | 'previous' | 'none';

export function searchCycle(value: string): CycleWord | number | null {
  const v = value.toLowerCase();
  if (v === 'current' || v === 'active') return 'current';
  if (v === 'next' || v === 'upcoming') return 'next';
  if (v === 'previous' || v === 'last') return 'previous';
  if (v === 'none') return 'none';
  return /^\d{1,6}$/.test(v) ? Number(v) : null;
}

/**
 * What a query value means, independent of where the query runs. The SQL
 * adapter (lib/search) and the in-memory adapter (filterIssues) both read this
 * instead of re-resolving aliases, case and date ranges themselves. `raw` keeps
 * the user's spelling (ids, substring matches); `value`/`normalized` are lowercase.
 */
export type SearchValue =
  | { key: 'is'; value: IsValue | null }
  | { key: 'type'; value: StateType | null }
  | { key: 'priority'; value: Priority | null }
  | { key: 'cycle'; value: CycleWord | number | null }
  | { key: 'due'; value: DueFilter | null }
  | { key: 'created' | 'updated'; value: ReturnType<typeof searchTimeRange> }
  | { key: 'sla'; value: SlaValue | null }
  | { key: 'assignee' | 'creator'; value: 'me' | 'none' | 'user'; raw: string; normalized: string }
  | { key: 'status' | 'label' | 'project' | 'epic'; value: string; raw: string };

export function decodeSearchValue(key: SearchKey, raw: string, now: number): SearchValue {
  const value = raw.toLowerCase();
  switch (key) {
    case 'is':
      return { key, value: searchIs(value) };
    case 'type':
      return { key, value: searchStateType(value) };
    case 'priority':
      return { key, value: searchPriority(value) };
    case 'cycle':
      return { key, value: searchCycle(value) };
    case 'due':
      return { key, value: searchDue(value) };
    case 'created':
    case 'updated':
      return { key, value: searchTimeRange(value, now) };
    case 'sla':
      return { key, value: searchSla(value) };
    case 'assignee':
    case 'creator':
      return {
        key,
        value: value === 'me' ? 'me' : value === 'none' || value === 'unassigned' ? 'none' : 'user',
        raw,
        normalized: value,
      };
    case 'status':
    case 'label':
    case 'project':
    case 'epic':
      return { key, value, raw };
  }
}

/** Whether the terms ask for archived issues explicitly (`is:archived`). */
export function wantsArchived(terms: SearchTerm[]): boolean {
  return terms.some(
    (t) => t.key === 'is' && !t.negate && t.values.some((v) => decodeSearchValue('is', v, 0).value === 'archived'),
  );
}

export interface SearchCycle {
  id: string;
  number: number;
  startsAt: Date | string;
  endsAt: Date | string;
  completedAt: Date | string | null;
}

/** `current` = in its window and not completed; `next` = not started yet; `previous` = over. */
export function cycleMatchesWord(cycle: SearchCycle, word: Exclude<CycleWord, 'none'>, now: number): boolean {
  const starts = new Date(cycle.startsAt).getTime();
  const ends = new Date(cycle.endsAt).getTime();
  if (word === 'current') return starts <= now && now < ends && !cycle.completedAt;
  if (word === 'next') return starts > now;
  return ends <= now || cycle.completedAt !== null;
}

/** Issue key prefix ("ENG-12" → "eng"). */
const keyPrefix = (key: string) => key.slice(0, key.lastIndexOf('-')).toLowerCase();

type Resolved = FilterContext & { viewerId: string | null; today: string; now: number };

/** One term → predicate; null when the context can't evaluate it (ignored). */
function termPredicate(term: SearchTerm, ctx: Resolved): ((issue: IssueRow) => boolean) | null {
  const one = (decoded: SearchValue): ((issue: IssueRow) => boolean) | null => {
    switch (decoded.key) {
      case 'is': {
        const is = decoded.value;
        if (is === 'open') return (i) => !isClosed(i.state.type);
        if (is === 'closed') return (i) => isClosed(i.state.type);
        if (is === 'completed' || is === 'canceled') return (i) => i.state.type === is;
        if (is === 'archived') return (i) => i.archivedAt !== null;
        return () => false;
      }
      case 'status':
        return (i) => i.state.name.toLowerCase().includes(decoded.value);
      case 'type': {
        const type = decoded.value;
        return (i) => i.state.type === type;
      }
      case 'assignee':
      case 'creator': {
        const pick = (i: IssueRow) => (decoded.key === 'assignee' ? i.assignee : i.creator);
        if (decoded.value === 'me') return (i) => ctx.viewerId !== null && pick(i)?.id === ctx.viewerId;
        if (decoded.value === 'none') return (i) => pick(i) === null;
        return (i) => {
          const user = pick(i);
          return !!user && (user.id === decoded.raw || user.name.toLowerCase().includes(decoded.normalized));
        };
      }
      case 'priority': {
        const priority = decoded.value;
        return (i) => i.priority === priority;
      }
      case 'label':
        if (decoded.value === 'none') return (i) => i.labels.length === 0;
        return (i) => i.labels.some((l) => l.name.toLowerCase() === decoded.value);
      case 'project': {
        const names = ctx.projects?.filter((p) => p.name.toLowerCase() === decoded.value).map((p) => p.id);
        return (i) => keyPrefix(i.key) === decoded.value || (names?.includes(i.projectId) ?? false);
      }
      case 'cycle': {
        const word = decoded.value;
        if (word === 'none') return (i) => i.cycleId === null;
        if (word === null) return () => false;
        if (!ctx.cycles) return null;
        const ids = new Set(
          ctx.cycles
            .filter((c) => (typeof word === 'number' ? c.number === word : cycleMatchesWord(c, word, ctx.now)))
            .map((c) => c.id),
        );
        return (i) => i.cycleId !== null && ids.has(i.cycleId);
      }
      case 'epic': {
        if (decoded.value === 'none') return (i) => i.epicId === null;
        if (!ctx.epics) return null;
        const ids = new Set(ctx.epics.filter((e) => e.name.toLowerCase().includes(decoded.value)).map((e) => e.id));
        return (i) => i.epicId !== null && ids.has(i.epicId);
      }
      case 'due': {
        const due = decoded.value;
        return (i) => due !== null && matchesDue(i, due, ctx.today);
      }
      case 'created':
      case 'updated': {
        const range = decoded.value;
        return (i) => {
          if (!range) return false;
          const at = new Date(decoded.key === 'created' ? i.createdAt : i.updatedAt).getTime();
          return (range.after === undefined || at >= range.after) && (range.before === undefined || at < range.before);
        };
      }
      case 'sla': {
        const sla = decoded.value;
        return (i) => {
          const due = i.slaDueAt ? new Date(i.slaDueAt).getTime() : null;
          const open = !isClosed(i.state.type);
          switch (sla) {
            case 'breached':
              return i.slaBreachedAt !== null || (due !== null && due <= ctx.now && open);
            case 'risk':
              return open && i.slaBreachedAt === null && due !== null && due > ctx.now && due - ctx.now < SLA_RISK_MS;
            case 'none':
              return due === null;
            case 'any':
              return due !== null;
            default:
              return false;
          }
        };
      }
    }
  };

  const tests = term.values.map((value) => one(decodeSearchValue(term.key, value, ctx.now)));
  if (tests.some((t) => t === null)) return null;
  const any = (issue: IssueRow) => tests.some((t) => t!(issue));
  return term.negate ? (issue) => !any(issue) : any;
}

// --- quick filter: turn terms into structured filters (chips) -------------

export interface SearchResolveData {
  states: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  members: { id: string; name: string }[];
  cycles: SearchCycle[];
  epics: { id: string; name: string }[];
}

type ListFilterKey = Exclude<ListKey, 'hierarchy'>;

/**
 * Moves the terms that map exactly onto IssueFilters (single positive term
 * per key, every value resolvable) into `filters`; the rest stays as query
 * text. Keys converted are merged (union) with the current filters.
 */
export function resolveSearchTerms(
  current: IssueFilters,
  query: string,
  data: SearchResolveData,
  onlyKeys?: SearchKey[],
  now = Date.now(),
): IssueFilters {
  const parsed = parseSearchQuery(query);
  const counts = new Map<SearchKey, number>();
  for (const term of parsed.terms) counts.set(term.key, (counts.get(term.key) ?? 0) + 1);

  const next: IssueFilters = { ...current };
  const rest: SearchTerm[] = [];
  const byName = <T extends { id: string; name: string }>(items: T[], value: string) =>
    items.find((item) => item.name.toLowerCase() === value.toLowerCase())?.id ?? null;
  const person = (value: string) => {
    const v = value.toLowerCase();
    if (v === 'me') return ME;
    const exact = byName(data.members, value);
    if (exact) return exact;
    const partial = data.members.filter((m) => m.name.toLowerCase().includes(v));
    return partial.length === 1 ? partial[0].id : null;
  };
  const cycleIds = (value: string): string[] | null => {
    const word = searchCycle(value);
    if (word === null) return null;
    if (word === 'none') return [NONE];
    if (typeof word === 'number') {
      const cycle = data.cycles.find((c) => c.number === word);
      return cycle ? [cycle.id] : null;
    }
    const matches = data.cycles.filter((c) => cycleMatchesWord(c, word, now));
    if (matches.length === 0) return null;
    // "next" = the soonest upcoming, "previous" = the latest finished.
    const sorted = matches.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return [word === 'previous' ? sorted[sorted.length - 1].id : sorted[0].id];
  };
  const within = (value: string): RelativeRange | null => {
    const m = /^<?(\d+)d$/i.exec(value);
    const range = m ? (`${Number(m[1])}d` as RelativeRange) : null;
    return range && RELATIVE_RANGES.includes(range) ? range : null;
  };

  for (const term of parsed.terms) {
    const convertible = !term.negate && counts.get(term.key) === 1 && (!onlyKeys || onlyKeys.includes(term.key));
    const all = <T>(map: (value: string) => T | null): T[] | null => {
      const out = term.values.map(map);
      return out.every((v) => v !== null) ? (out as T[]) : null;
    };
    const add = (key: ListFilterKey, values: string[] | null) => {
      if (!values) return false;
      next[key] = [...new Set([...(next[key] as string[]), ...values])] as never;
      return true;
    };
    let done = false;
    if (convertible) {
      switch (term.key) {
        case 'status':
          done = add('stateIds', all((v) => byName(data.states, v)));
          break;
        case 'type':
          done = add('stateTypes', all(searchStateType));
          break;
        case 'assignee':
          done = add('assigneeIds', all((v) => (['none', 'unassigned'].includes(v.toLowerCase()) ? UNASSIGNED : person(v))));
          break;
        case 'creator':
          done = add('creatorIds', all(person));
          break;
        case 'priority':
          done = add('priorities', all(searchPriority));
          break;
        case 'label':
          done = term.values.length === 1 && add('labelIds', all((v) => (v.toLowerCase() === 'none' ? NONE : byName(data.labels, v))));
          break;
        case 'cycle': {
          const ids = all(cycleIds);
          done = add('cycleIds', ids ? ids.flat() : null);
          break;
        }
        case 'epic':
          done = add('epicIds', all((v) => (v.toLowerCase() === 'none' ? NONE : byName(data.epics, v))));
          break;
        case 'due':
          done = add('due', all(searchDue));
          break;
        case 'created':
        case 'updated': {
          const range = term.values.length === 1 ? within(term.values[0]) : null;
          if (range) {
            next[term.key] = range;
            done = true;
          }
          break;
        }
      }
    }
    if (!done) rest.push(term);
  }
  next.q = formatSearchQuery(parsed.text, rest);
  return next;
}

/** Reference for the syntax help popover (search page, quick filter). */
export const SEARCH_SYNTAX_HELP: { key: string; description: string; examples: string[] }[] = [
  { key: 'is', description: 'Open, closed or archived', examples: ['is:open', 'is:closed', 'is:archived'] },
  { key: 'status', description: 'Workflow state name', examples: ['status:"In Progress"'] },
  { key: 'type', description: 'State category', examples: ['type:started', 'type:todo'] },
  { key: 'assignee', description: 'me, none or a name', examples: ['assignee:me', 'assignee:none'] },
  { key: 'creator', description: 'Who created it', examples: ['creator:me'] },
  { key: 'priority', description: 'urgent, high, medium, low, none', examples: ['priority:urgent,high'] },
  { key: 'label', description: 'Repeat to require several; - excludes', examples: ['label:bug', '-label:wontfix'] },
  { key: 'project', description: 'Project key', examples: ['project:ENG'] },
  { key: 'cycle', description: 'current, next, previous, none or a number', examples: ['cycle:current'] },
  { key: 'epic', description: 'Epic name or none', examples: ['epic:"Mobile app"'] },
  { key: 'due', description: 'overdue, today, week, next-week, none', examples: ['due:overdue', 'due:week'] },
  { key: 'created', description: '> older than, < within; h d w m, or a date', examples: ['created:<7d', 'created:>30d'] },
  { key: 'updated', description: 'Same as created', examples: ['updated:<1d'] },
  { key: 'sla', description: 'breached, risk, none', examples: ['sla:breached'] },
];
