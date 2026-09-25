'use client';

// The "Display" popover (Shift+V): layout, grouping, sub-grouping, ordering,
// toggles and visible properties — all written through useDisplayOptions().

import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_DISPLAY_OPTIONS,
  DISPLAY_PROPERTY_LABEL,
  useDisplayOptions,
  type DisplayOptions,
  type DisplayProperty,
} from '@/components/issues/display-options';
import type { IssueViewDefinition } from '@/components/issues/views';
import { useProjectData } from '@/components/project/project-data';
import { registerHotkeys } from '@/lib/hotkeys';
import {
  GROUP_BY_LABEL,
  GROUP_BY_OPTIONS,
  ORDER_BY_LABEL,
  ORDER_BY_OPTIONS,
  isGroupBy,
  isOrderBy,
  type GroupBy,
} from '@/lib/issue-grouping';
import { cn } from '@/lib/utils';

const NO_SUBGROUP = '__none';

// Pull requests aren't part of IssueRow, so there's nothing to toggle yet.
const TOGGLEABLE: DisplayProperty[] = [
  'id',
  'status',
  'priority',
  'assignee',
  'labels',
  'estimate',
  'dueDate',
  'cycle',
  'epic',
  'milestone',
  'subIssues',
  'created',
  'updated',
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function OptionSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (value: string) => void;
}) {
  return (
    <Row label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-36 text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}

export function DisplayMenu({
  views,
  layout,
  onLayoutChange,
}: {
  views: IssueViewDefinition[];
  layout: string;
  onLayoutChange: (id: string) => void;
}) {
  const [display, setDisplay] = useDisplayOptions();
  const { project, cycles, epics } = useProjectData();
  const [open, setOpen] = useState(false);

  const toggle = useEffectEvent(() => setOpen((o) => !o));
  useEffect(
    () =>
      registerHotkeys([
        {
          key: 'V',
          scope: 'Issues',
          description: 'Display options (Shift+V)',
          when: (event) => event.shiftKey,
          handler: () => toggle(),
        },
      ]),
    [],
  );

  const update = (patch: Partial<DisplayOptions>) => setDisplay({ ...display, ...patch });
  const grouped = layout === 'list' || layout === 'board';
  const ordered = layout !== 'calendar';

  // Hide groupings the project can't use (no cycles / epics yet).
  const groupOptions = GROUP_BY_OPTIONS.filter(
    (g) =>
      (g !== 'cycle' || project.cyclesEnabled || cycles.length > 0 || display.groupBy === 'cycle') &&
      (g !== 'epic' || epics.length > 0 || display.groupBy === 'epic'),
  );
  const subOptions = groupOptions.filter((g) => g !== 'none' && g !== display.groupBy);

  const setGroupBy = (value: string) => {
    if (!isGroupBy(value)) return;
    update({
      groupBy: value,
      subGroupBy: value === 'none' || display.subGroupBy === value ? null : display.subGroupBy,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Display options (Shift+V)" className="text-muted-foreground">
          <SlidersHorizontal />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div
          role="radiogroup"
          aria-label="Layout"
          className="grid grid-cols-4 gap-1 border-b border-border p-2"
        >
          {views.map((view) => {
            const Icon = view.icon;
            const selected = view.id === layout;
            return (
              <button
                key={view.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onLayoutChange(view.id)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {view.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col px-3 py-2">
          {grouped && (
            <>
              <OptionSelect
                label="Grouping"
                value={display.groupBy}
                options={groupOptions}
                labels={GROUP_BY_LABEL}
                onChange={setGroupBy}
              />
              {display.groupBy !== 'none' && (
                <Row label={layout === 'board' ? 'Swimlanes' : 'Sub-grouping'}>
                  <Select
                    value={display.subGroupBy ?? NO_SUBGROUP}
                    onValueChange={(value) =>
                      update({ subGroupBy: isGroupBy(value) ? (value as GroupBy) : null })
                    }
                  >
                    <SelectTrigger size="sm" className="w-36 text-xs" aria-label="Sub-grouping">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SUBGROUP} className="text-xs">
                        No sub-grouping
                      </SelectItem>
                      {subOptions.map((option) => (
                        <SelectItem key={option} value={option} className="text-xs">
                          {GROUP_BY_LABEL[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
              )}
            </>
          )}
          {ordered && (
            <OptionSelect
              label="Ordering"
              value={display.orderBy}
              options={ORDER_BY_OPTIONS}
              labels={ORDER_BY_LABEL}
              onChange={(value) => isOrderBy(value) && update({ orderBy: value })}
            />
          )}
          {grouped && (
            <Row label="Show empty groups">
              <Switch
                size="sm"
                // Board columns are always shown (drop targets); the switch then
                // only governs empty swimlanes.
                checked={layout === 'board' && display.subGroupBy === null ? true : display.showEmptyGroups}
                disabled={layout === 'board' && display.subGroupBy === null}
                onCheckedChange={(checked) => update({ showEmptyGroups: checked })}
                aria-label="Show empty groups"
              />
            </Row>
          )}
          <Row label="Show sub-issues">
            <Switch
              size="sm"
              checked={display.showSubIssues}
              onCheckedChange={(checked) => update({ showSubIssues: checked })}
              aria-label="Show sub-issues"
            />
          </Row>
        </div>

        {layout !== 'calendar' && (
          <div className="border-t border-border px-3 py-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Display properties</p>
            <div className="flex flex-wrap gap-1">
              {TOGGLEABLE.map((property) => {
                const on = display.properties[property];
                return (
                  <button
                    key={property}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update({ properties: { ...display.properties, [property]: !on } })
                    }
                    className={cn(
                      'h-6 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      on
                        ? 'border-border bg-secondary text-foreground'
                        : 'border-dashed border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {DISPLAY_PROPERTY_LABEL[property]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setDisplay({ ...DEFAULT_DISPLAY_OPTIONS, layout: display.layout })}
          >
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
