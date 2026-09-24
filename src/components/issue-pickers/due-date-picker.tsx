'use client';

import { CalendarDays, X } from 'lucide-react';

import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { addDays, formatDueDate, fromDateString, toDateString } from '@/lib/dates';
import { PickerPopover, type PickerPopoverProps } from './picker-popover';

function quickOptions(today = new Date()) {
  // End of week = the coming Friday (today when it's Friday).
  const friday = addDays(today, (5 - today.getDay() + 7) % 7);
  return [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'End of this week', date: friday },
    { label: 'In one week', date: addDays(today, 7) },
    { label: 'In two weeks', date: addDays(today, 14) },
  ].map((option) => ({ ...option, value: toDateString(option.date) }));
}

export interface DueDateOptionsProps {
  /** YYYY-MM-DD, or null. */
  value: string | null | undefined;
  onSelect: (dueDate: string | null) => void;
}

export function DueDateOptions({ value, onSelect }: DueDateOptionsProps) {
  const selected = value ? fromDateString(value) : undefined;
  return (
    <div className="flex flex-col">
      <Command>
        <CommandInput placeholder="Set due date…" />
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
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDueDate(option.value)}
                </span>
              </CommandItem>
            ))}
            {value && (
              <CommandItem value="Remove due date" onSelect={() => onSelect(null)}>
                <X className="text-muted-foreground" />
                Remove due date
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

export function DueDatePicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null | undefined;
  onChange: (dueDate: string | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-auto min-w-64"
      content={(close) => (
        <DueDateOptions
          value={value}
          onSelect={(dueDate) => {
            close();
            onChange(dueDate);
          }}
        />
      )}
    />
  );
}
