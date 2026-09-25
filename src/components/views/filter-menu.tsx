'use client';

// Linear-style two-level filter menu (property → values) and the removable
// chips for active filters. Pure UI over IssueFilters — state lives in
// IssueFiltersProvider (src/components/issues/issue-filters.tsx).

import { useState, type ReactNode } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock,
  History,
  Layers,
  ListFilter,
  Network,
  RefreshCcw,
  Signal,
  Tag,
  UserRound,
  UserRoundPen,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { keywordFilter } from '@/components/issue-pickers';
import { useProjectData } from '@/components/project/project-data';
import { Avatar, PriorityIcon, StateIcon, StatusIcon } from '@/components/ui-icons';
import {
  DUE_FILTERS,
  DUE_FILTER_LABEL,
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
  type StateType,
} from '@/lib/issue-model';
import { cn } from '@/lib/utils';

export type FilterPropertyId =
  | 'status'
  | 'assignee'
  | 'creator'
  | 'priority'
  | 'labels'
  | 'cycle'
  | 'epic'
  | 'due'
  | 'created'
  | 'updated'
  | 'hierarchy';

interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface FilterProperty {
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

const dot = (color: string | null | undefined) => (
  <span
    aria-hidden="true"
    className="size-2 shrink-0 rounded-full bg-muted-foreground"
    style={color ? { backgroundColor: color } : undefined}
  />
);

function useFilterProperties(): FilterProperty[] {
  const { project, states, members, labels, cycles, epics } = useProjectData();
  const presentTypes = STATE_TYPE_ORDER.filter((type) => states.some((s) => s.type === type));
  const people = members.map((m) => ({
    value: m.id,
    label: m.name,
    icon: <Avatar name={m.name} src={m.image} size={20} />,
  }));
  const me = { value: ME, label: 'Me', icon: <UserRound className="text-muted-foreground" /> };

  const properties: (FilterProperty | false)[] = [
    {
      id: 'status',
      label: 'Status',
      icon: CircleDashed,
      options: [
        ...states.map((s) => ({ value: s.id, label: s.name, icon: <StateIcon state={s} size={14} /> })),
        ...presentTypes.map((type) => ({
          value: `${TYPE_PREFIX}${type}`,
          label: `Any ${STATE_TYPE_LABEL[type].toLowerCase()}`,
          icon: <StatusIcon type={type} size={14} />,
        })),
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
      icon: UserRound,
      options: [
        me,
        { value: UNASSIGNED, label: 'No assignee', icon: <UserRound className="text-muted-foreground/60" /> },
        ...people,
      ],
      get: (f) => f.assigneeIds,
      set: (f, assigneeIds) => ({ ...f, assigneeIds }),
    },
    {
      id: 'creator',
      label: 'Creator',
      icon: UserRoundPen,
      options: [me, ...people],
      get: (f) => f.creatorIds,
      set: (f, creatorIds) => ({ ...f, creatorIds }),
    },
    {
      id: 'priority',
      label: 'Priority',
      icon: Signal,
      options: PRIORITY_ORDER.map((p) => ({
        value: p,
        label: PRIORITY_LABEL[p],
        icon: <PriorityIcon priority={p} size={14} />,
      })),
      get: (f) => f.priorities,
      set: (f, values) => ({ ...f, priorities: PRIORITY_ORDER.filter((p) => values.includes(p)) }),
    },
    {
      id: 'labels',
      label: 'Labels',
      icon: Tag,
      options: [
        { value: NONE, label: 'No label', icon: <Tag className="text-muted-foreground/60" /> },
        ...labels.map((l) => ({ value: l.id, label: l.name, icon: dot(l.color) })),
      ],
      get: (f) => f.labelIds,
      set: (f, labelIds) => ({ ...f, labelIds }),
    },
    (project.cyclesEnabled || cycles.length > 0) && {
      id: 'cycle',
      label: 'Cycle',
      icon: RefreshCcw,
      options: [
        { value: NONE, label: 'No cycle', icon: <RefreshCcw className="text-muted-foreground/60" /> },
        ...cycles.map((c) => ({
          value: c.id,
          label: c.name || `Cycle ${c.number}`,
          icon: <RefreshCcw className="text-muted-foreground" />,
        })),
      ],
      get: (f) => f.cycleIds,
      set: (f, cycleIds) => ({ ...f, cycleIds }),
    },
    epics.length > 0 && {
      id: 'epic',
      label: 'Epic',
      icon: Layers,
      options: [
        { value: NONE, label: 'No epic', icon: <Layers className="text-muted-foreground/60" /> },
        ...epics.map((e) => ({ value: e.id, label: e.name, icon: dot(e.color) })),
      ],
      get: (f) => f.epicIds,
      set: (f, epicIds) => ({ ...f, epicIds }),
    },
    {
      id: 'due',
      label: 'Due date',
      icon: CalendarDays,
      options: DUE_FILTERS.map((d) => ({
        value: d,
        label: DUE_FILTER_LABEL[d],
        icon: <CalendarClock className="text-muted-foreground" />,
      })),
      get: (f) => f.due,
      set: (f, values) => ({ ...f, due: DUE_FILTERS.filter((d) => values.includes(d)) as DueFilter[] }),
    },
    {
      id: 'created',
      label: 'Created',
      icon: Clock,
      single: true,
      options: RELATIVE_RANGES.map((r) => ({ value: r, label: RELATIVE_RANGE_LABEL[r] })),
      get: (f) => (f.created ? [f.created] : []),
      set: (f, values) => ({ ...f, created: (values[0] as RelativeRange | undefined) ?? null }),
    },
    {
      id: 'updated',
      label: 'Updated',
      icon: History,
      single: true,
      options: RELATIVE_RANGES.map((r) => ({ value: r, label: RELATIVE_RANGE_LABEL[r] })),
      get: (f) => (f.updated ? [f.updated] : []),
      set: (f, values) => ({ ...f, updated: (values[0] as RelativeRange | undefined) ?? null }),
    },
    {
      id: 'hierarchy',
      label: 'Sub-issues',
      icon: Network,
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

function toggleValue(property: FilterProperty, filters: IssueFilters, value: string): IssueFilters {
  const current = property.get(filters);
  const selected = current.includes(value);
  if (property.single) return property.set(filters, selected ? [] : [value]);
  return property.set(filters, selected ? current.filter((v) => v !== value) : [...current, value]);
}

export function FilterMenu({
  filters,
  onChange,
  open,
  onOpenChange,
  property,
  onPropertyChange,
}: {
  filters: IssueFilters;
  onChange: (next: IssueFilters) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Value list being shown; null = the property list. */
  property: FilterPropertyId | null;
  onPropertyChange: (property: FilterPropertyId | null) => void;
}) {
  const properties = useFilterProperties();
  const current = properties.find((p) => p.id === property) ?? null;
  const [search, setSearch] = useState('');

  const go = (next: FilterPropertyId | null) => {
    setSearch('');
    onPropertyChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('');
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Filter (F)" className="text-muted-foreground">
          <ListFilter />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <Command
          key={current?.id ?? 'properties'}
          filter={keywordFilter}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !search && current) {
              event.preventDefault();
              go(null);
            }
          }}
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={current ? `${current.label}…` : 'Filter by…'}
          />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            {current ? (
              <CommandGroup
                heading={
                  <button
                    type="button"
                    onClick={() => go(null)}
                    className="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                  >
                    <ChevronLeft className="size-3" aria-hidden="true" />
                    {current.label}
                  </button>
                }
              >
                {current.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    data-checked={current.get(filters).includes(option.value)}
                    onSelect={() => {
                      onChange(toggleValue(current, filters, option.value));
                      if (current.single) onOpenChange(false);
                    }}
                  >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              <CommandGroup>
                {properties.map((p) => {
                  const Icon = p.icon;
                  const count = p.get(filters).length;
                  return (
                    <CommandItem key={p.id} value={p.id} keywords={[p.label]} onSelect={() => go(p.id)}>
                      <Icon className="text-muted-foreground" />
                      <span className="truncate">{p.label}</span>
                      {count > 0 && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>}
                      <ChevronRight className={cn('text-muted-foreground', count === 0 && 'ml-auto')} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function valuesText(property: FilterProperty, values: string[]): string {
  const labels = values.map((v) => property.options.find((o) => o.value === v)?.label ?? 'Unknown');
  return labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

/** One segmented chip per filtered property; click edits, × removes. */
export function FilterChips({
  filters,
  onChange,
  onEdit,
}: {
  filters: IssueFilters;
  onChange: (next: IssueFilters) => void;
  onEdit: (property: FilterPropertyId) => void;
}) {
  const properties = useFilterProperties();
  return properties.map((property) => {
    const values = property.get(filters);
    if (values.length === 0) return null;
    const Icon = property.icon;
    const operator = property.single
      ? 'in'
      : values.length > 1
        ? property.id === 'labels'
          ? 'include any of'
          : 'is any of'
        : property.id === 'labels'
          ? 'include'
          : 'is';
    return (
      <span
        key={property.id}
        className="inline-flex h-7 max-w-80 items-center overflow-hidden rounded-md border border-border text-xs"
      >
        <button
          type="button"
          onClick={() => onEdit(property.id)}
          className="flex min-w-0 items-center gap-1.5 px-2 outline-none hover:bg-muted focus-visible:bg-muted"
          aria-label={`Edit ${property.label} filter`}
        >
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="shrink-0">{property.label}</span>
          <span className="shrink-0 text-muted-foreground">{operator}</span>
          <span className="truncate font-medium">{valuesText(property, values)}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange(property.set(filters, []))}
          aria-label={`Remove ${property.label} filter`}
          className="flex h-full items-center border-l border-border px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  });
}
