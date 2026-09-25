'use client';

// Cycle picker (popover + bare options), same shape as the issue pickers.
// Order: current, upcoming (soonest first), then the 3 most recent past ones.

import { CircleSlash } from 'lucide-react';

import {
  PickerPopover,
  keywordFilter,
  type PickerPopoverProps,
} from '@/components/issue-pickers/picker-popover';
import { useProjectData } from '@/components/project/project-data';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { CycleSummary } from '@/lib/project-data-types';
import { CycleGlyph } from './cycle-stats';
import { cycleName, cycleStatus, formatCycleRange } from './cycle-utils';

const NO_CYCLE = '__none';
const RECENT_PAST = 3;

export interface CycleOptionsProps {
  /** Current cycle id; null = none; undefined = mixed (bulk edit). */
  value: string | null | undefined;
  onSelect: (cycleId: string | null) => void;
}

export function CycleOptions({ value, onSelect }: CycleOptionsProps) {
  const { cycles } = useProjectData();
  const now = new Date();
  const byStart = [...cycles].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const current = byStart.filter((c) => cycleStatus(c, now) === 'current');
  const upcoming = byStart.filter((c) => cycleStatus(c, now) === 'upcoming');
  const past = byStart
    .filter((c) => cycleStatus(c, now) === 'past')
    .reverse()
    .slice(0, RECENT_PAST);
  // Keep the issue's own cycle selectable even when it's an older past one.
  const selected = cycles.find((c) => c.id === value);
  if (selected && ![...current, ...upcoming, ...past].includes(selected)) past.push(selected);

  const item = (cycle: CycleSummary, hint: string) => (
    <CommandItem
      key={cycle.id}
      value={cycle.id}
      keywords={[cycleName(cycle), `cycle ${cycle.number}`, hint]}
      data-checked={cycle.id === value}
      onSelect={() => onSelect(cycle.id)}
    >
      <CycleGlyph status={cycleStatus(cycle, now)} size={14} />
      <span className="truncate">{cycleName(cycle)}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        {formatCycleRange(cycle)}
      </span>
    </CommandItem>
  );

  return (
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Move to cycle…" />
      <CommandList>
        <CommandEmpty>No cycle found.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value={NO_CYCLE}
            keywords={['No cycle', 'Remove from cycle']}
            data-checked={value === null}
            onSelect={() => onSelect(null)}
          >
            <CircleSlash className="text-muted-foreground" />
            No cycle
          </CommandItem>
        </CommandGroup>
        {current.length > 0 && (
          <CommandGroup heading="Current">{current.map((c) => item(c, 'current'))}</CommandGroup>
        )}
        {upcoming.length > 0 && (
          <CommandGroup heading="Upcoming">{upcoming.map((c) => item(c, 'upcoming next'))}</CommandGroup>
        )}
        {past.length > 0 && (
          <CommandGroup heading="Past">{past.map((c) => item(c, 'past previous'))}</CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

export function CyclePicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null | undefined;
  onChange: (cycleId: string | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-72"
      content={(close) => (
        <CycleOptions
          value={value}
          onSelect={(id) => {
            close();
            onChange(id);
          }}
        />
      )}
    />
  );
}
