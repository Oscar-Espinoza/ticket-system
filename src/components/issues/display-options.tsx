'use client';

// How issue views are laid out, grouped, ordered and which properties they
// show. The project layout's provider persists per project in localStorage;
// saved views nest their own, non-persisted provider (IssuesView initialDisplay).

import { createContext, use, useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { useOptionalProjectData } from '@/components/project/project-data';
import { isGroupBy, isOrderBy, type GroupBy, type OrderBy } from '@/lib/issue-grouping';

export type { OrderBy };

export type ViewLayout = 'list' | 'board' | 'table' | 'calendar' | 'timeline';

export const VIEW_LAYOUTS: ViewLayout[] = ['list', 'board', 'table', 'calendar', 'timeline'];

export function isViewLayout(value: unknown): value is ViewLayout {
  return typeof value === 'string' && (VIEW_LAYOUTS as string[]).includes(value);
}

export type DisplayProperty =
  | 'id'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'labels'
  | 'estimate'
  | 'dueDate'
  | 'startDate'
  | 'sla'
  | 'created'
  | 'updated'
  | 'cycle'
  | 'epic'
  | 'milestone'
  | 'subIssues'
  | 'pullRequests';

export const DISPLAY_PROPERTY_LABEL: Record<DisplayProperty, string> = {
  id: 'ID',
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  labels: 'Labels',
  estimate: 'Estimate',
  dueDate: 'Due date',
  startDate: 'Start date',
  sla: 'SLA',
  created: 'Created',
  updated: 'Updated',
  cycle: 'Cycle',
  epic: 'Epic',
  milestone: 'Milestone',
  subIssues: 'Sub-issues',
  pullRequests: 'Pull requests',
};

export interface DisplayOptions {
  layout: ViewLayout;
  groupBy: GroupBy;
  subGroupBy: GroupBy | null;
  orderBy: OrderBy;
  showEmptyGroups: boolean;
  showSubIssues: boolean;
  properties: Record<DisplayProperty, boolean>;
}

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  layout: 'list',
  groupBy: 'state',
  subGroupBy: null,
  orderBy: 'created',
  showEmptyGroups: false,
  showSubIssues: true,
  properties: {
    id: true,
    status: true,
    priority: true,
    assignee: true,
    labels: true,
    estimate: true,
    dueDate: true,
    startDate: false,
    sla: true,
    created: true,
    updated: false,
    cycle: false,
    epic: false,
    milestone: false,
    subIssues: true,
    pullRequests: true,
  },
};

/** Any JSON (saved view, localStorage, older shapes) → complete, valid options. */
export function normalizeDisplayOptions(value: unknown): DisplayOptions {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_DISPLAY_OPTIONS;
  const groupBy = isGroupBy(raw.groupBy) ? raw.groupBy : d.groupBy;
  const subGroupBy =
    isGroupBy(raw.subGroupBy) && raw.subGroupBy !== 'none' && raw.subGroupBy !== groupBy && groupBy !== 'none'
      ? raw.subGroupBy
      : null;
  const rawProps = (raw.properties && typeof raw.properties === 'object' ? raw.properties : {}) as Record<
    string,
    unknown
  >;
  const properties = { ...d.properties };
  for (const key of Object.keys(properties) as DisplayProperty[]) {
    if (typeof rawProps[key] === 'boolean') properties[key] = rawProps[key];
  }
  return {
    layout: isViewLayout(raw.layout) ? raw.layout : d.layout,
    groupBy,
    subGroupBy,
    orderBy: isOrderBy(raw.orderBy) ? raw.orderBy : d.orderBy,
    showEmptyGroups: typeof raw.showEmptyGroups === 'boolean' ? raw.showEmptyGroups : d.showEmptyGroups,
    showSubIssues: typeof raw.showSubIssues === 'boolean' ? raw.showSubIssues : d.showSubIssues,
    properties,
  };
}

// ---------------------------------------------------------------------------
// Per-project localStorage store (read via useSyncExternalStore: the server
// snapshot is the defaults, so hydration never mismatches).
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'issues-display:';
const storeListeners = new Set<() => void>();
const snapshots = new Map<string, { raw: string | null; value: DisplayOptions }>();

function readStored(key: string): DisplayOptions {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Private mode / blocked storage: defaults.
  }
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.value;
  let value = DEFAULT_DISPLAY_OPTIONS;
  try {
    if (raw) value = normalizeDisplayOptions(JSON.parse(raw));
  } catch {
    value = DEFAULT_DISPLAY_OPTIONS;
  }
  snapshots.set(key, { raw, value });
  return value;
}

function writeStored(key: string, value: DisplayOptions) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / blocked: keep the in-memory snapshot so the change still applies.
  }
  snapshots.set(key, { raw: safeRaw(key), value });
  storeListeners.forEach((listener) => listener());
}

function safeRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribeStore(listener: () => void) {
  storeListeners.add(listener);
  // Other tabs.
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getServerDefaults = () => DEFAULT_DISPLAY_OPTIONS;

// ---------------------------------------------------------------------------

type DisplayOptionsState = [DisplayOptions, (next: DisplayOptions) => void];

const DisplayOptionsContext = createContext<DisplayOptionsState | null>(null);

function PersistedProvider({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const value = useSyncExternalStore(
    subscribeStore,
    () => readStored(storageKey),
    getServerDefaults,
  );
  const set = useCallback((next: DisplayOptions) => writeStored(storageKey, next), [storageKey]);
  const state = useMemo<DisplayOptionsState>(() => [value, set], [value, set]);
  return <DisplayOptionsContext value={state}>{children}</DisplayOptionsContext>;
}

function LocalProvider({ initial, children }: { initial: DisplayOptions; children: ReactNode }) {
  const [value, set] = useState(initial);
  const state = useMemo<DisplayOptionsState>(() => [value, set], [value]);
  return <DisplayOptionsContext value={state}>{children}</DisplayOptionsContext>;
}

/**
 * Without `initial` inside a project: persisted per project (localStorage).
 * With `initial` (saved views) or outside a project: plain component state.
 */
export function DisplayOptionsProvider({
  initial,
  persist,
  children,
}: {
  initial?: DisplayOptions | Partial<DisplayOptions> | Record<string, unknown>;
  /** Default: true when no `initial` is given. */
  persist?: boolean;
  children: ReactNode;
}) {
  const projectId = useOptionalProjectData()?.project.id;
  if ((persist ?? initial === undefined) && projectId) {
    return <PersistedProvider storageKey={`${STORAGE_PREFIX}${projectId}`}>{children}</PersistedProvider>;
  }
  return <LocalProvider initial={normalizeDisplayOptions(initial)}>{children}</LocalProvider>;
}

const FALLBACK: DisplayOptionsState = [DEFAULT_DISPLAY_OPTIONS, () => {}];

/** Defaults (read-only) outside a provider, so shared rows render anywhere. */
export function useDisplayOptions(): DisplayOptionsState {
  return use(DisplayOptionsContext) ?? FALLBACK;
}
