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
import { StateIcon } from '@/components/ui-icons';
import { useProjectData } from '@/components/project/project-data';
import type { WorkflowState } from '@/lib/issue-model';
import { PickerPopover, digitShortcut, keywordFilter, type PickerPopoverProps } from './picker-popover';

export interface StateOptionsProps {
  /** Current state id; null when mixed (bulk edit). */
  value: string | null;
  onSelect: (stateId: string, state: WorkflowState) => void;
  /** Defaults to the project's states. */
  states?: WorkflowState[];
}

/** Bare list (type to filter, 1–9 picks the nth state) for dialogs / palette. */
export function StateOptions({ value, onSelect, states }: StateOptionsProps) {
  const project = useProjectData();
  const list = states ?? project.states;
  const [search, setSearch] = useState('');

  return (
    <Command
      filter={keywordFilter}
      onKeyDown={digitShortcut(search, (digit) => {
        const state = list[digit - 1];
        if (state) onSelect(state.id, state);
        return Boolean(state);
      })}
    >
      <CommandInput value={search} onValueChange={setSearch} placeholder="Change status…" />
      <CommandList>
        <CommandEmpty>No status found.</CommandEmpty>
        {list.map((state, index) => (
          <CommandItem
            key={state.id}
            value={state.id}
            keywords={[state.name]}
            data-checked={state.id === value}
            onSelect={() => onSelect(state.id, state)}
          >
            <StateIcon state={state} size={14} />
            <span className="truncate">{state.name}</span>
            {index < 9 && <CommandShortcut>{index + 1}</CommandShortcut>}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function StatePicker({
  value,
  onChange,
  states,
  ...popover
}: PickerPopoverProps & {
  value: string | null;
  onChange: (stateId: string, state: WorkflowState) => void;
  states?: WorkflowState[];
}) {
  return (
    <PickerPopover
      {...popover}
      content={(close) => (
        <StateOptions
          value={value}
          states={states}
          onSelect={(id, state) => {
            close();
            onChange(id, state);
          }}
        />
      )}
    />
  );
}
