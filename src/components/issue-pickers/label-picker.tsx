'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { createLabel } from '@/app/actions/labels';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { PickerPopover, keywordFilter, type PickerPopoverProps } from './picker-popover';

// New labels get a random swatch from Linear-ish defaults; B9's settings edit it.
export const LABEL_COLORS = [
  '#5e6ad2',
  '#26b5ce',
  '#4cb782',
  '#f2c94c',
  '#f2994a',
  '#eb5757',
  '#bb87fc',
  '#95a2b3',
];

const CREATE = '__create';

export interface LabelOptionsProps {
  /** Selected label ids. */
  value: string[];
  /** Full replacement set (maps onto IssuePatch.labelIds). */
  onChange: (labelIds: string[]) => void;
}

/** Multi-select: toggles stay open; "Create label" when nothing matches exactly. */
export function LabelOptions({ value, onChange }: LabelOptionsProps) {
  const { project, labels } = useProjectData();
  const canCreate = useProjectPermission('write');
  const [search, setSearch] = useState('');
  const [creating, startCreate] = useTransition();
  const selected = new Set(value);

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const name = search.trim();
  const exact = labels.some((l) => l.name.toLowerCase() === name.toLowerCase());

  const create = () =>
    startCreate(async () => {
      const color = LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
      const result = await createLabel({ projectId: project.id, name, color });
      if (!result.ok || !result.label) {
        toast.error(result.ok ? 'Could not create the label.' : result.error);
        return;
      }
      setSearch('');
      onChange([...value, result.label.id]);
    });

  return (
    <Command filter={keywordFilter}>
      <CommandInput value={search} onValueChange={setSearch} placeholder="Add labels…" />
      <CommandList>
        <CommandEmpty>{canCreate ? 'Type a name to create a label.' : 'No labels found.'}</CommandEmpty>
        <CommandGroup>
          {labels.map((label) => (
            <CommandItem
              key={label.id}
              value={label.id}
              keywords={[label.name]}
              data-checked={selected.has(label.id)}
              onSelect={() => toggle(label.id)}
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              <span className="truncate">{label.name}</span>
            </CommandItem>
          ))}
          {canCreate && name && !exact && (
            // forceMount: keep it visible whatever the filter says.
            <CommandItem value={CREATE} forceMount disabled={creating} onSelect={create}>
              <Plus />
              <span className="truncate">
                Create label “{name}”
              </span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function LabelPicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & LabelOptionsProps) {
  return (
    <PickerPopover
      {...popover}
      className="w-60"
      content={() => <LabelOptions value={value} onChange={onChange} />}
    />
  );
}
