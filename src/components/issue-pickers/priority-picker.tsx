'use client';

import { useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { PriorityIcon } from '@/components/ui-icons';
import { PRIORITY_LABEL, type Priority } from '@/lib/issue-model';
import { PickerPopover, digitShortcut, keywordFilter, type PickerPopoverProps } from './picker-popover';

// Menu order and number keys match Linear: 0 none, 1 urgent … 4 low.
const MENU_ORDER: Priority[] = ['none', 'urgent', 'high', 'medium', 'low'];

export interface PriorityOptionsProps {
  /** null when mixed (bulk edit). */
  value: Priority | null;
  onSelect: (priority: Priority) => void;
}

export function PriorityOptions({ value, onSelect }: PriorityOptionsProps) {
  const [search, setSearch] = useState('');
  return (
    <Command
      filter={keywordFilter}
      onKeyDown={digitShortcut(search, (digit) => {
        const priority = MENU_ORDER[digit];
        if (priority) onSelect(priority);
        return Boolean(priority);
      })}
    >
      <CommandInput value={search} onValueChange={setSearch} placeholder="Set priority…" />
      <CommandList>
        <CommandEmpty>No priority found.</CommandEmpty>
        {MENU_ORDER.map((priority, index) => (
          <CommandItem
            key={priority}
            value={priority}
            keywords={[PRIORITY_LABEL[priority]]}
            data-checked={priority === value}
            onSelect={() => onSelect(priority)}
          >
            <PriorityIcon priority={priority} size={14} />
            {PRIORITY_LABEL[priority]}
            <CommandShortcut>{index}</CommandShortcut>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function PriorityPicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & { value: Priority | null; onChange: (priority: Priority) => void }) {
  return (
    <PickerPopover
      {...popover}
      className="w-48"
      content={(close) => (
        <PriorityOptions
          value={value}
          onSelect={(priority) => {
            close();
            onChange(priority);
          }}
        />
      )}
    />
  );
}
