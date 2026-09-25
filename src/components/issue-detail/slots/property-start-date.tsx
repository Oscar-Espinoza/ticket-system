'use client';

// Slot — owned by D8. "Start date" property row (issue timeline view planning)
// plus the StartDatePicker the table view reuses. DueDatePicker's copy is about
// due dates, so this is its start-date twin (quick options + calendar).

import { AlertTriangle, CalendarArrowUp, CalendarDays, X } from 'lucide-react';

import { PropertyRow } from '@/components/issue-detail/property-row';
import { PickerPopover, type PickerPopoverProps } from '@/components/issue-pickers/picker-popover';
import { useProjectPermission } from '@/components/project/project-data';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { addDays, formatDueDate, fromDateString, toDateString } from '@/lib/dates';
import type { IssueRow } from '@/lib/issue-model';

function quickOptions(today = new Date()) {
  // Next Monday (a week from today when today is Monday).
  const monday = addDays(today, ((8 - today.getDay()) % 7) || 7);
  return [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Next week', date: monday },
    { label: 'In two weeks', date: addDays(monday, 7) },
  ].map((option) => ({ ...option, value: toDateString(option.date) }));
}

function StartDateOptions({
  value,
  onSelect,
}: {
  value: string | null | undefined;
  onSelect: (startDate: string | null) => void;
}) {
  const selected = value ? fromDateString(value) : undefined;
  return (
    <div className="flex flex-col">
      <Command>
        <CommandInput placeholder="Set start date…" />
        <CommandList>
          <CommandGroup>
            {quickOptions().map((option) => (
              <CommandItem
                key={option.label}
                value={option.label}
                data-checked={option.value === value}
                onSelect={() => onSelect(option.value)}
              >
                <CalendarDays className="text-muted-foreground" />
                {option.label}
                <span className="ml-auto text-xs text-muted-foreground">{formatDueDate(option.value)}</span>
              </CommandItem>
            ))}
            {value && (
              <CommandItem value="Remove start date" onSelect={() => onSelect(null)}>
                <X className="text-muted-foreground" />
                Remove start date
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
        <CommandSeparator />
      </Command>
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        onSelect={(date) => date && onSelect(toDateString(date))}
        className="mx-auto"
      />
    </div>
  );
}

export function StartDatePicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null | undefined;
  onChange: (startDate: string | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-auto min-w-64"
      content={(close) => (
        <StartDateOptions
          value={value}
          onSelect={(startDate) => {
            close();
            onChange(startDate);
          }}
        />
      )}
    />
  );
}

export function PropertyStartDate({ issue, mutations }: { issue: IssueRow; mutations: IssueMutations }) {
  const canWrite = useProjectPermission('write');
  const afterDue = issue.startDate !== null && issue.dueDate !== null && issue.startDate > issue.dueDate;

  const trigger = (
    <Button variant="ghost" size="sm" disabled={!canWrite} className="-ml-2 max-w-full gap-2 font-normal">
      {issue.startDate ? (
        <>
          <CalendarArrowUp className="text-muted-foreground" />
          <span suppressHydrationWarning>{formatDueDate(issue.startDate)}</span>
          {afterDue && (
            <AlertTriangle
              className="text-amber-600 dark:text-amber-400"
              aria-label="Starts after the due date"
            />
          )}
        </>
      ) : (
        <>
          <CalendarArrowUp className="text-muted-foreground" />
          <span className="text-muted-foreground">Set start date</span>
        </>
      )}
    </Button>
  );

  return (
    <PropertyRow label="Start date">
      {canWrite ? (
        <StartDatePicker value={issue.startDate} onChange={(startDate) => mutations.update(issue, { startDate })}>
          {trigger}
        </StartDatePicker>
      ) : (
        trigger
      )}
    </PropertyRow>
  );
}
