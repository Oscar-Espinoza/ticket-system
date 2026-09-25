'use client';

import { useState } from 'react';

import { PickerPopover, digitShortcut, keywordFilter, type PickerPopoverProps } from '@/components/issue-pickers';
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { StatusIcon } from '@/components/ui-icons';
import {
  INITIATIVE_STATUSES,
  INITIATIVE_STATUS_LABEL,
  type InitiativeStatus,
} from './initiative-model';

const GLYPH = {
  planned: 'unstarted',
  active: 'started',
  completed: 'completed',
} as const;

export function InitiativeStatusIcon({ status }: { status: InitiativeStatus }) {
  return (
    <StatusIcon
      type={GLYPH[status]}
      color={status === 'completed' ? '#5e6ad2' : undefined}
      size={14}
      aria-label={INITIATIVE_STATUS_LABEL[status]}
    />
  );
}

export function InitiativeStatusPicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: InitiativeStatus;
  onChange: (status: InitiativeStatus) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      content={(close) => (
        <StatusOptions
          value={value}
          onSelect={(status) => {
            close();
            onChange(status);
          }}
        />
      )}
    />
  );
}

function StatusOptions({
  value,
  onSelect,
}: {
  value: InitiativeStatus;
  onSelect: (status: InitiativeStatus) => void;
}) {
  const [search, setSearch] = useState('');
  return (
    <Command
      filter={keywordFilter}
      onKeyDown={digitShortcut(search, (digit) => {
        const status = INITIATIVE_STATUSES[digit - 1];
        if (status) onSelect(status);
        return Boolean(status);
      })}
    >
      <CommandInput value={search} onValueChange={setSearch} placeholder="Change status…" />
      <CommandList>
        {INITIATIVE_STATUSES.map((status, index) => (
          <CommandItem
            key={status}
            value={status}
            keywords={[INITIATIVE_STATUS_LABEL[status]]}
            data-checked={status === value}
            onSelect={() => onSelect(status)}
          >
            <InitiativeStatusIcon status={status} />
            {INITIATIVE_STATUS_LABEL[status]}
            <CommandShortcut>{index + 1}</CommandShortcut>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
