'use client';

// Keyboard-first pickers for epic properties, built on the shared
// PickerPopover (trigger = children via asChild). Member-based pickers take
// the member list as a prop so they also work outside a project (initiatives).

import { useState } from 'react';
import { Ban, Check, CircleDashed, Target, UserRound, X } from 'lucide-react';

import { PickerPopover, digitShortcut, keywordFilter, type PickerPopoverProps } from '@/components/issue-pickers';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Avatar } from '@/components/ui-icons';
import { formatDueDate, fromDateString, toDateString } from '@/lib/dates';
import type { IssueUser } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { EpicIcon, EpicStatusIcon, HealthDot, MilestoneGlyph } from './epic-glyphs';
import {
  EPIC_COLORS,
  EPIC_STATUSES,
  EPIC_STATUS_LABEL,
  HEALTHS,
  HEALTH_LABEL,
  type EpicStatus,
  type Health,
} from './epic-model';

export function EpicStatusPicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & { value: EpicStatus; onChange: (status: EpicStatus) => void }) {
  return (
    <PickerPopover
      {...popover}
      content={(close) => (
        <EpicStatusOptions
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

function EpicStatusOptions({
  value,
  onSelect,
}: {
  value: EpicStatus;
  onSelect: (status: EpicStatus) => void;
}) {
  const [search, setSearch] = useState('');
  return (
    <Command
      filter={keywordFilter}
      onKeyDown={digitShortcut(search, (digit) => {
        const status = EPIC_STATUSES[digit - 1];
        if (status) onSelect(status);
        return Boolean(status);
      })}
    >
      <CommandInput value={search} onValueChange={setSearch} placeholder="Change status…" />
      <CommandList>
        <CommandEmpty>No status found.</CommandEmpty>
        {EPIC_STATUSES.map((status, index) => (
          <CommandItem
            key={status}
            value={status}
            keywords={[EPIC_STATUS_LABEL[status]]}
            data-checked={status === value}
            onSelect={() => onSelect(status)}
          >
            <EpicStatusIcon status={status} />
            {EPIC_STATUS_LABEL[status]}
            <CommandShortcut>{index + 1}</CommandShortcut>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function HealthPicker({
  value,
  onChange,
  ...popover
}: PickerPopoverProps & { value: Health | null; onChange: (health: Health | null) => void }) {
  return (
    <PickerPopover
      {...popover}
      content={(close) => {
        const pick = (health: Health | null) => {
          close();
          onChange(health);
        };
        return (
          <Command filter={keywordFilter}>
            <CommandInput placeholder="Set health…" />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              {HEALTHS.map((health, index) => (
                <CommandItem
                  key={health}
                  value={health}
                  keywords={[HEALTH_LABEL[health]]}
                  data-checked={health === value}
                  onSelect={() => pick(health)}
                >
                  <HealthDot health={health} />
                  {HEALTH_LABEL[health]}
                  <CommandShortcut>{index + 1}</CommandShortcut>
                </CommandItem>
              ))}
              {value && (
                <CommandItem value="none" keywords={['No health', 'Clear']} onSelect={() => pick(null)}>
                  <X className="text-muted-foreground" />
                  Clear health
                </CommandItem>
              )}
            </CommandList>
          </Command>
        );
      }}
    />
  );
}

export function MemberPicker({
  value,
  members,
  viewerId,
  onChange,
  placeholder = 'Set lead…',
  noneLabel = 'No lead',
  ...popover
}: PickerPopoverProps & {
  value: string | null;
  members: IssueUser[];
  viewerId?: string;
  onChange: (userId: string | null) => void;
  placeholder?: string;
  noneLabel?: string;
}) {
  // Viewer first — picking yourself is the common case.
  const ordered = [
    ...members.filter((m) => m.id === viewerId),
    ...members.filter((m) => m.id !== viewerId),
  ];
  return (
    <PickerPopover
      {...popover}
      className="w-60"
      content={(close) => {
        const pick = (id: string | null) => {
          close();
          onChange(id);
        };
        return (
          <Command filter={keywordFilter}>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>No member found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__none"
                  keywords={[noneLabel]}
                  data-checked={value === null}
                  onSelect={() => pick(null)}
                >
                  <UserRound className="text-muted-foreground" />
                  {noneLabel}
                </CommandItem>
                {ordered.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    keywords={[member.name, ...(member.id === viewerId ? ['me'] : [])]}
                    data-checked={member.id === value}
                    onSelect={() => pick(member.id)}
                  >
                    <Avatar name={member.name} src={member.image} size={20} />
                    <span className="truncate">{member.name}</span>
                    {member.id === viewerId && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        );
      }}
    />
  );
}

/** A calendar in a popover, with "Clear" when a date is set. */
export function DatePicker({
  value,
  onChange,
  clearLabel = 'Clear date',
  ...popover
}: PickerPopoverProps & {
  value: string | null;
  onChange: (date: string | null) => void;
  clearLabel?: string;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-auto"
      content={(close) => {
        const selected = value ? fromDateString(value) : undefined;
        return (
          <div className="flex flex-col">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              autoFocus
              onSelect={(date) => {
                if (!date) return;
                close();
                onChange(toDateString(date));
              }}
            />
            {value && (
              <button
                type="button"
                className="flex items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent"
                onClick={() => {
                  close();
                  onChange(null);
                }}
              >
                <X className="size-3.5" />
                {clearLabel}
              </button>
            )}
          </div>
        );
      }}
    />
  );
}

export function DateLabel({ value, placeholder }: { value: string | null; placeholder: string }) {
  return value ? (
    <span>{formatDueDate(value)}</span>
  ) : (
    <span className="text-muted-foreground">{placeholder}</span>
  );
}

export function ColorSwatches({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Color" className={cn('flex flex-wrap gap-1.5', className)}>
      {EPIC_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          onClick={() => onChange(color)}
          className="flex size-6 items-center justify-center rounded-md outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: color }}
        >
          {color === value && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

export interface EpicOption {
  id: string;
  name: string;
  color: string | null;
}

export function EpicPicker({
  value,
  epics,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null;
  epics: EpicOption[];
  onChange: (epicId: string | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-64"
      content={(close) => {
        const pick = (id: string | null) => {
          close();
          onChange(id);
        };
        return (
          <Command filter={keywordFilter}>
            <CommandInput placeholder="Set epic…" />
            <CommandList>
              <CommandEmpty>No epic found.</CommandEmpty>
              <CommandItem
                value="__none"
                keywords={['No epic', 'Remove']}
                data-checked={value === null}
                onSelect={() => pick(null)}
              >
                <Ban className="text-muted-foreground" />
                No epic
              </CommandItem>
              {epics.map((epic) => (
                <CommandItem
                  key={epic.id}
                  value={epic.id}
                  keywords={[epic.name]}
                  data-checked={epic.id === value}
                  onSelect={() => pick(epic.id)}
                >
                  <EpicIcon color={epic.color} />
                  <span className="truncate">{epic.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        );
      }}
    />
  );
}

export function MilestonePicker({
  value,
  milestones,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null;
  milestones: { id: string; name: string }[];
  onChange: (milestoneId: string | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-64"
      content={(close) => {
        const pick = (id: string | null) => {
          close();
          onChange(id);
        };
        return (
          <Command filter={keywordFilter}>
            <CommandInput placeholder="Set milestone…" />
            <CommandList>
              <CommandEmpty>No milestone found.</CommandEmpty>
              <CommandItem
                value="__none"
                keywords={['No milestone', 'Remove']}
                data-checked={value === null}
                onSelect={() => pick(null)}
              >
                <Ban className="text-muted-foreground" />
                No milestone
              </CommandItem>
              {milestones.map((milestone) => (
                <CommandItem
                  key={milestone.id}
                  value={milestone.id}
                  keywords={[milestone.name]}
                  data-checked={milestone.id === value}
                  onSelect={() => pick(milestone.id)}
                >
                  <MilestoneGlyph className="text-muted-foreground" />
                  <span className="truncate">{milestone.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        );
      }}
    />
  );
}

export function InitiativePicker({
  value,
  initiatives,
  onChange,
  ...popover
}: PickerPopoverProps & {
  value: string | null;
  initiatives: { id: string; name: string }[];
  onChange: (initiativeId: string | null) => void;
}) {
  return (
    <PickerPopover
      {...popover}
      className="w-64"
      content={(close) => {
        const pick = (id: string | null) => {
          close();
          onChange(id);
        };
        return (
          <Command filter={keywordFilter}>
            <CommandInput placeholder="Set initiative…" />
            <CommandList>
              <CommandEmpty>No initiative found.</CommandEmpty>
              <CommandItem
                value="__none"
                keywords={['No initiative', 'Remove']}
                data-checked={value === null}
                onSelect={() => pick(null)}
              >
                <CircleDashed className="text-muted-foreground" />
                No initiative
              </CommandItem>
              {initiatives.map((initiative) => (
                <CommandItem
                  key={initiative.id}
                  value={initiative.id}
                  keywords={[initiative.name]}
                  data-checked={initiative.id === value}
                  onSelect={() => pick(initiative.id)}
                >
                  <Target className="text-muted-foreground" />
                  <span className="truncate">{initiative.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        );
      }}
    />
  );
}
