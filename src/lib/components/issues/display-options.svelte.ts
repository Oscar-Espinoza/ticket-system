// How issue views are laid out, grouped, ordered and which properties they
// show. The project layout's provider persists per project in localStorage;
// saved views nest their own, non-persisted provider (IssuesView initialDisplay).
//
// API (port of src/components/issues/display-options.tsx; constants, types and
// normalizeDisplayOptions are unchanged):
//   setDisplayOptionsContext(() => ({ initial, persist }))   provider; call during
//       component init. Without `initial` inside a project: persisted per project
//       (localStorage, synced across tabs). With `initial` (saved views) or outside
//       a project: component state seeded once from `initial`.
//   <DisplayOptionsProvider initial={…} persist={false}>     same, as a component
//   useDisplayOptions(): DisplayOptionsState                 defaults (read-only) outside
//
// React's tuple `const [display, setDisplay] = useDisplayOptions()` becomes
//   const displayOptions = useDisplayOptions();
//   displayOptions.current   — reactive DisplayOptions (read it in markup / $derived)
//   displayOptions.set(next) — replace them
// Persisted options render the defaults on the server and during hydration, then
// the stored value (as React's useSyncExternalStore with a server snapshot did).

import { createContext } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';

import { useOptionalProjectData } from '@/lib/components/project/project-data.svelte';
import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';
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
// Per-project localStorage store (server and hydration render the defaults, so
// hydration never mismatches).
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

const trackStore = createSubscriber((update) => subscribeStore(update));

// ---------------------------------------------------------------------------

export interface DisplayOptionsState {
  /** The options in effect (reactive). */
  readonly current: DisplayOptions;
  /** Replace the options (persisted providers write localStorage). */
  set: (next: DisplayOptions) => void;
}

export interface DisplayOptionsProviderProps {
  initial?: DisplayOptions | Partial<DisplayOptions> | Record<string, unknown>;
  /** Default: true when no `initial` is given. */
  persist?: boolean;
}

const [getContext, setContext, hasContext] = createContext<DisplayOptionsState>();

/**
 * Provide display options to every descendant (DisplayOptionsProvider). Call
 * during component init. `initial` seeds the local (non-persisted) state once,
 * like React's useState(initial); later changes to it are ignored.
 */
export function setDisplayOptionsContext(props: () => DisplayOptionsProviderProps): DisplayOptionsState {
  const project = useOptionalProjectData();
  const initialProps = props();
  let local = $state.raw<DisplayOptions>(normalizeDisplayOptions(initialProps.initial));
  // Server snapshot = defaults while the app hydrates (useSyncExternalStore's
  // getServerSnapshot). A provider mounted after that (client navigation into a
  // project) reads localStorage on its first render, as React did.
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });

  const storageKey = (): string | null => {
    const { initial, persist } = props();
    const projectId = project?.project.id;
    return (persist ?? initial === undefined) && projectId ? `${STORAGE_PREFIX}${projectId}` : null;
  };

  const state: DisplayOptionsState = {
    get current() {
      const key = storageKey();
      if (!key) return local;
      if (!hydrated) return DEFAULT_DISPLAY_OPTIONS;
      trackStore();
      return readStored(key);
    },
    set: (next) => {
      const key = storageKey();
      if (key) writeStored(key, next);
      else local = next;
    },
  };
  return setContext(state);
}

const FALLBACK: DisplayOptionsState = { current: DEFAULT_DISPLAY_OPTIONS, set: () => {} };

/** Defaults (read-only) outside a provider, so shared rows render anywhere. */
export function useDisplayOptions(): DisplayOptionsState {
  return hasContext() ? getContext() : FALLBACK;
}
