'use client';

import { UserRound } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar } from '@/components/ui-icons';
import { useProjectData } from '@/components/project/project-data';
import type { IssueUser } from '@/lib/issue-model';
import { PickerPopover, keywordFilter, type PickerPopoverProps } from './picker-popover';

const NO_ASSIGNEE = '__none';

export interface AssigneeOptionsProps {
  /** Current assignee id; null = unassigned; undefined = mixed (bulk edit). */
  value: string | null | undefined;
  onSelect: (userId: string | null, user: IssueUser | null) => void;
}

export function AssigneeOptions({ value, onSelect }: AssigneeOptionsProps) {
  const { members, viewer } = useProjectData();
  // Viewer first — assigning to yourself is the common case.
  const ordered = [
    ...members.filter((m) => m.id === viewer.id),
    ...members.filter((m) => m.id !== viewer.id),
  ];

  return (
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Assign to…" />
      <CommandList>
        <CommandEmpty>No member found.</CommandEmpty>
        <CommandGroup>
          <CommandItem
            value={NO_ASSIGNEE}
            keywords={['No assignee', 'Unassigned']}
            data-checked={value === null}
            onSelect={() => onSelect(null, null)}
          >
            <UserRound className="text-muted-foreground" />
            No assignee
          </CommandItem>
          {ordered.map((member) => (
            <CommandItem
              key={member.id}
              value={member.id}
              keywords={[member.name, ...(member.id === viewer.id ? ['me'] : [])]}
              data-checked={member.id === value}
              onSelect={() =>
                onSelect(member.id, { id: member.id, name: member.name, image: member.image })
              }
            >
              <Avatar name={member.name} src={member.image} size={20} />
              <span className="truncate">{member.name}</span>
              {member.id === viewer.id && (
                <span className="text-xs text-muted-foreground">(you)</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function AssigneePicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null | undefined;
  onChange: (userId: string | null, user: IssueUser | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-60"
      content={(close) => (
        <AssigneeOptions
          value={value}
          onSelect={(id, user) => {
            close();
            onChange(id, user);
          }}
        />
      )}
    />
  );
}
