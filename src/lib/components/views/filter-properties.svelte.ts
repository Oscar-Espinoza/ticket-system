// The filterable properties behind FilterMenu and FilterChips.
// Option icons are plain descriptors that FilterMenu renders (FilterOptionIcon).

import type { LucideIcon } from '@lucide/svelte';
import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
import ClockIcon from '@lucide/svelte/icons/clock';
import HourglassIcon from '@lucide/svelte/icons/hourglass';
import HistoryIcon from '@lucide/svelte/icons/history';
import LayersIcon from '@lucide/svelte/icons/layers';
import NetworkIcon from '@lucide/svelte/icons/network';
import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
import SignalIcon from '@lucide/svelte/icons/signal';
import TagIcon from '@lucide/svelte/icons/tag';
import UserRoundIcon from '@lucide/svelte/icons/user-round';
import UserRoundPenIcon from '@lucide/svelte/icons/user-round-pen';

import { useProjectData, type ProjectData } from '@/lib/components/project/project-data.svelte';
import {
  DUE_FILTERS,
  DUE_FILTER_LABEL,
  FOLLOW_UP_FILTER_LABEL,
  HIERARCHY_FILTERS,
  HIERARCHY_FILTER_LABEL,
  ME,
  NONE,
  RELATIVE_RANGES,
  RELATIVE_RANGE_LABEL,
  UNASSIGNED,
  type DueFilter,
  type HierarchyFilter,
  type IssueFilters,
  type RelativeRange,
} from '@/lib/issue-filtering';
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  STATE_TYPE_LABEL,
  STATE_TYPE_ORDER,
  type Priority,
  type StateType,
  type WorkflowState,
} from '@/lib/issue-model';

export type FilterPropertyId =
  | 'status'
  | 'assignee'
  | 'creator'
  | 'priority'
  | 'labels'
  | 'cycle'
  | 'epic'
  | 'waitingOn'
  | 'due'
  | 'followUp'
  | 'created'
  | 'updated'
  | 'hierarchy';

/** What FilterMenu draws before an option's label. */
export type FilterOptionIcon =
  | { kind: 'avatar'; name: string; src: string | null | undefined }
  | { kind: 'state'; state: WorkflowState }
  | { kind: 'status'; type: StateType }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'lucide'; icon: LucideIcon; class: string }
  | { kind: 'dot'; color: string | null | undefined };

export interface FilterOption {
  value: string;
  label: string;
  icon?: FilterOptionIcon;
}

export interface FilterProperty {
  id: FilterPropertyId;
  label: string;
  icon: LucideIcon;
  /** One value at a time (date ranges). */
  single?: boolean;
  options: FilterOption[];
  get: (filters: IssueFilters) => string[];
  set: (filters: IssueFilters, values: string[]) => IssueFilters;
}

const TYPE_PREFIX = 'type:';

const lucide = (icon: LucideIcon, className: string): FilterOptionIcon => ({ kind: 'lucide', icon, class: className });
const dot = (color: string | null | undefined): FilterOptionIcon => ({ kind: 'dot', color });

/** Every property the project can filter by (pure; see useFilterProperties). */
export function filterProperties(data: Pick<ProjectData, 'project' | 'states' | 'members' | 'labels' | 'cycles' | 'epics'>): FilterProperty[] {
  const { project, states, members, labels, cycles, epics } = data;
  const presentTypes = STATE_TYPE_ORDER.filter((type) => states.some((s) => s.type === type));
  const people: FilterOption[] = members.map((m) => ({
    value: m.id,
    label: m.name,
    icon: { kind: 'avatar', name: m.name, src: m.image },
  }));
  const me: FilterOption = { value: ME, label: 'Me', icon: lucide(UserRoundIcon, 'text-muted-foreground') };

  const properties: (FilterProperty | false)[] = [
    {
      id: 'status',
      label: 'Status',
      icon: CircleDashedIcon,
      options: [
        ...states.map((s): FilterOption => ({ value: s.id, label: s.name, icon: { kind: 'state', state: s } })),
        ...presentTypes.map(
          (type): FilterOption => ({
            value: `${TYPE_PREFIX}${type}`,
            label: `Any ${STATE_TYPE_LABEL[type].toLowerCase()}`,
            icon: { kind: 'status', type },
          }),
        ),
      ],
      get: (f) => [...f.stateIds, ...f.stateTypes.map((t) => `${TYPE_PREFIX}${t}`)],
      set: (f, values) => ({
        ...f,
        // Keep workflow order so the URL is stable.
        stateIds: states.map((s) => s.id).filter((id) => values.includes(id)),
        stateTypes: STATE_TYPE_ORDER.filter((t) => values.includes(`${TYPE_PREFIX}${t}`)) as StateType[],
      }),
    },
    {
      id: 'assignee',
      label: 'Assignee',
      icon: UserRoundIcon,
      options: [
        me,
        { value: UNASSIGNED, label: 'No assignee', icon: lucide(UserRoundIcon, 'text-muted-foreground/60') },
        ...people,
      ],
      get: (f) => f.assigneeIds,
      set: (f, assigneeIds) => ({ ...f, assigneeIds }),
    },
    {
      id: 'waitingOn',
      label: 'Waiting on',
      icon: HourglassIcon,
      options: [
        me,
        { value: NONE, label: 'Not waiting', icon: lucide(HourglassIcon, 'text-muted-foreground/60') },
        ...people,
      ],
      get: (f) => f.waitingOnIds,
      set: (f, waitingOnIds) => ({ ...f, waitingOnIds }),
    },
    {
      id: 'creator',
      label: 'Creator',
      icon: UserRoundPenIcon,
      options: [me, ...people],
      get: (f) => f.creatorIds,
      set: (f, creatorIds) => ({ ...f, creatorIds }),
    },
    {
      id: 'priority',
      label: 'Priority',
      icon: SignalIcon,
      options: PRIORITY_ORDER.map((p) => ({
        value: p,
        label: PRIORITY_LABEL[p],
        icon: { kind: 'priority', priority: p },
      })),
      get: (f) => f.priorities,
      set: (f, values) => ({ ...f, priorities: PRIORITY_ORDER.filter((p) => values.includes(p)) }),
    },
    {
      id: 'labels',
      label: 'Labels',
      icon: TagIcon,
      options: [
        { value: NONE, label: 'No label', icon: lucide(TagIcon, 'text-muted-foreground/60') },
        ...labels.map((l) => ({ value: l.id, label: l.name, icon: dot(l.color) })),
      ],
      get: (f) => f.labelIds,
      set: (f, labelIds) => ({ ...f, labelIds }),
    },
    (project.cyclesEnabled || cycles.length > 0) && {
      id: 'cycle',
      label: 'Cycle',
      icon: RefreshCcwIcon,
      options: [
        { value: NONE, label: 'No cycle', icon: lucide(RefreshCcwIcon, 'text-muted-foreground/60') },
        ...cycles.map((c) => ({
          value: c.id,
          label: c.name || `Cycle ${c.number}`,
          icon: lucide(RefreshCcwIcon, 'text-muted-foreground'),
        })),
      ],
      get: (f) => f.cycleIds,
      set: (f, cycleIds) => ({ ...f, cycleIds }),
    },
    epics.length > 0 && {
      id: 'epic',
      label: 'Epic',
      icon: LayersIcon,
      options: [
        { value: NONE, label: 'No epic', icon: lucide(LayersIcon, 'text-muted-foreground/60') },
        ...epics.map((e) => ({ value: e.id, label: e.name, icon: dot(e.color) })),
      ],
      get: (f) => f.epicIds,
      set: (f, epicIds) => ({ ...f, epicIds }),
    },
    {
      id: 'due',
      label: 'Due date',
      icon: CalendarDaysIcon,
      options: DUE_FILTERS.map((d) => ({
        value: d,
        label: DUE_FILTER_LABEL[d],
        icon: lucide(CalendarClockIcon, 'text-muted-foreground'),
      })),
      get: (f) => f.due,
      set: (f, values) => ({ ...f, due: DUE_FILTERS.filter((d) => values.includes(d)) as DueFilter[] }),
    },
    {
      id: 'followUp',
      label: 'Follow-up',
      icon: CalendarClockIcon,
      options: DUE_FILTERS.map((d) => ({
        value: d,
        label: FOLLOW_UP_FILTER_LABEL[d],
        icon: lucide(CalendarClockIcon, 'text-muted-foreground'),
      })),
      get: (f) => f.followUp,
      set: (f, values) => ({ ...f, followUp: DUE_FILTERS.filter((d) => values.includes(d)) as DueFilter[] }),
    },
    {
      id: 'created',
      label: 'Created',
      icon: ClockIcon,
      single: true,
      options: RELATIVE_RANGES.map((r) => ({ value: r, label: RELATIVE_RANGE_LABEL[r] })),
      get: (f) => (f.created ? [f.created] : []),
      set: (f, values) => ({ ...f, created: (values[0] as RelativeRange | undefined) ?? null }),
    },
    {
      id: 'updated',
      label: 'Updated',
      icon: HistoryIcon,
      single: true,
      options: RELATIVE_RANGES.map((r) => ({ value: r, label: RELATIVE_RANGE_LABEL[r] })),
      get: (f) => (f.updated ? [f.updated] : []),
      set: (f, values) => ({ ...f, updated: (values[0] as RelativeRange | undefined) ?? null }),
    },
    {
      id: 'hierarchy',
      label: 'Sub-issues',
      icon: NetworkIcon,
      options: HIERARCHY_FILTERS.map((h) => ({ value: h, label: HIERARCHY_FILTER_LABEL[h] })),
      get: (f) => f.hierarchy,
      set: (f, values) => ({
        ...f,
        hierarchy: HIERARCHY_FILTERS.filter((h) => values.includes(h)) as HierarchyFilter[],
      }),
    },
  ];
  return properties.filter((p): p is FilterProperty => Boolean(p));
}

/**
 * The project's filter properties, kept in sync with the project data. Call
 * during component init (reads the ProjectData context; throws outside one, as
 * . Read `.current`.
 */
export function useFilterProperties(): { readonly current: FilterProperty[] } {
  const data = useProjectData();
  const properties = $derived(filterProperties(data));
  return {
    get current() {
      return properties;
    },
  };
}

export function toggleValue(property: FilterProperty, filters: IssueFilters, value: string): IssueFilters {
  const current = property.get(filters);
  const selected = current.includes(value);
  if (property.single) return property.set(filters, selected ? [] : [value]);
  return property.set(filters, selected ? current.filter((v) => v !== value) : [...current, value]);
}

export function valuesText(property: FilterProperty, values: string[]): string {
  const labels = values.map((v) => property.options.find((o) => o.value === v)?.label ?? 'Unknown');
  return labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}
