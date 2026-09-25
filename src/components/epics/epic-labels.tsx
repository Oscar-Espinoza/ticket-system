'use client';

// Epic ("project") labels: chips, the multi-select picker (with inline
// create), the list filter and the manage dialog. Labels arrive as props from
// the server read; mutations revalidate the project layout, so the lists
// settle on fresh props after each action.

import { useState, useTransition } from 'react';
import { Check, Plus, Settings2, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createEpicLabel,
  deleteEpicLabel,
  updateEpicLabel,
} from '@/app/actions/epic-labels';
import { useDraft } from '@/components/issue-detail/use-draft';
import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/components/issue-pickers';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LabelChip } from '@/components/ui-icons';
import { cn } from '@/lib/utils';
import { EPIC_COLORS, EPIC_LABEL_NAME_MAX, type EpicLabelRow } from './epic-model';
import { ColorSwatches } from './epic-pickers';

const CREATE = '__create';

const randomColor = () => EPIC_COLORS[Math.floor(Math.random() * EPIC_COLORS.length)];

export function EpicLabelChips({
  labels,
  labelIds,
  max,
  className,
}: {
  labels: EpicLabelRow[];
  labelIds: string[] | undefined;
  /** Show at most this many, then "+N". */
  max?: number;
  className?: string;
}) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const own = (labelIds ?? []).flatMap((id) => byId.get(id) ?? []);
  if (own.length === 0) return null;
  const shown = max ? own.slice(0, max) : own;
  const rest = own.length - shown.length;
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map((label) => (
        <LabelChip key={label.id} dotColor={label.color} className="max-w-32">
          <span className="truncate">{label.name}</span>
        </LabelChip>
      ))}
      {rest > 0 && (
        <span
          className="text-xs text-muted-foreground"
          title={own.slice(shown.length).map((l) => l.name).join(', ')}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

export interface EpicLabelOptionsProps {
  projectId: string;
  labels: EpicLabelRow[];
  value: string[];
  /** Full replacement set. */
  onChange: (labelIds: string[]) => void;
  canCreate: boolean;
}

/** Multi-select: toggles stay open; "Create label" when nothing matches exactly. */
export function EpicLabelOptions({
  projectId,
  labels,
  value,
  onChange,
  canCreate,
}: EpicLabelOptionsProps) {
  const [search, setSearch] = useState('');
  // Created here but not yet in the (revalidating) props.
  const [created, setCreated] = useState<EpicLabelRow[]>([]);
  const [creating, startCreate] = useTransition();
  const all = [...labels, ...created.filter((c) => !labels.some((l) => l.id === c.id))];
  const selected = new Set(value);

  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const name = search.trim();
  const exact = all.some((l) => l.name.toLowerCase() === name.toLowerCase());

  const create = () =>
    startCreate(async () => {
      const result = await createEpicLabel({ projectId, name, color: randomColor() });
      if (!result.ok || !result.label) {
        toast.error(result.ok ? 'Could not create the label.' : result.error);
        return;
      }
      const label = result.label;
      setCreated((list) => [...list, label]);
      setSearch('');
      onChange([...value, label.id]);
    });

  return (
    <Command filter={keywordFilter}>
      <CommandInput value={search} onValueChange={setSearch} placeholder="Add labels…" />
      <CommandList>
        <CommandEmpty>{canCreate ? 'Type a name to create a label.' : 'No labels found.'}</CommandEmpty>
        <CommandGroup>
          {all.map((label) => (
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
            <CommandItem value={CREATE} forceMount disabled={creating} onSelect={create}>
              <Plus />
              <span className="truncate">Create label “{name.slice(0, EPIC_LABEL_NAME_MAX)}”</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function EpicLabelPicker({
  projectId,
  labels,
  value,
  onChange,
  canCreate,
  ...popover
}: PickerPopoverProps & EpicLabelOptionsProps) {
  return (
    <PickerPopover
      {...popover}
      className="w-60"
      content={() => (
        <EpicLabelOptions
          projectId={projectId}
          labels={labels}
          value={value}
          onChange={onChange}
          canCreate={canCreate}
        />
      )}
    />
  );
}

/** Epics-list filter: matches epics with any selected label. */
export function EpicLabelFilter({
  labels,
  counts,
  value,
  onChange,
  onManage,
}: {
  labels: EpicLabelRow[];
  /** Epics per label id (within the current status filter). */
  counts: Map<string, number>;
  value: string[];
  onChange: (labelIds: string[]) => void;
  /** Omit when the viewer can't manage labels. */
  onManage?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const active = labels.filter((l) => selected.has(l.id));
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn('gap-1.5 text-xs font-normal', active.length === 0 && 'text-muted-foreground')}
        >
          <Tag />
          {active.length === 0
            ? 'Labels'
            : active.length === 1
              ? active[0].name
              : `${active.length} labels`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        <Command filter={keywordFilter}>
          <CommandInput placeholder="Filter by label…" />
          <CommandList>
            <CommandEmpty>{labels.length ? 'No labels found.' : 'No epic labels yet.'}</CommandEmpty>
            {labels.length > 0 && (
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
                    <span className="flex-1 truncate">{label.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {counts.get(label.id) ?? 0}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {(value.length > 0 || onManage) && <CommandSeparator />}
            {(value.length > 0 || onManage) && (
              <CommandGroup>
                {value.length > 0 && (
                  <CommandItem value="__clear" keywords={['Clear']} onSelect={() => onChange([])}>
                    Clear label filter
                  </CommandItem>
                )}
                {onManage && (
                  <CommandItem
                    value="__manage"
                    keywords={['Manage labels', 'Edit', 'New label']}
                    onSelect={() => {
                      setOpen(false);
                      onManage();
                    }}
                  >
                    <Settings2 />
                    Manage labels…
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EpicLabelsDialog({
  open,
  onOpenChange,
  projectId,
  labels,
  usage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  labels: EpicLabelRow[];
  /** Epics per label id. */
  usage: Map<string, number>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(EPIC_COLORS[0]);
  const [pending, startTransition] = useTransition();

  const create = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createEpicLabel({ projectId, name, color });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setName('');
      setColor(randomColor());
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Epic labels</DialogTitle>
          <DialogDescription>
            Tag epics to group and filter them. Separate from issue labels.
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
          {labels.length === 0 && (
            <li className="px-1 py-3 text-sm text-muted-foreground">No labels yet — add one below.</li>
          )}
          {labels.map((label) => (
            <EpicLabelRowEditor
              key={label.id}
              projectId={projectId}
              label={label}
              uses={usage.get(label.id) ?? 0}
            />
          ))}
        </ul>

        <form
          className="flex items-center gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <ColorButton value={color} onChange={setColor} />
          <Input
            aria-label="New label name"
            placeholder="New label"
            value={name}
            maxLength={EPIC_LABEL_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ColorButton({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Label color">
          <span className="size-3 rounded-full" style={{ backgroundColor: value }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <ColorSwatches
          value={value}
          onChange={(color) => {
            setOpen(false);
            onChange(color);
          }}
          className="max-w-40"
        />
      </PopoverContent>
    </Popover>
  );
}

function EpicLabelRowEditor({
  projectId,
  label,
  uses,
}: {
  projectId: string;
  label: EpicLabelRow;
  uses: number;
}) {
  const [draft, setDraft] = useDraft(label.name);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (patch: { name?: string; color?: string }) =>
    startTransition(async () => {
      const result = await updateEpicLabel({ projectId, id: label.id, ...patch });
      if (!result.ok) {
        toast.error(result.error);
        setDraft(label.name);
      }
    });

  const commitName = () => {
    const next = draft.trim();
    if (!next) setDraft(label.name);
    else if (next !== label.name) update({ name: next });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await deleteEpicLabel({ projectId, id: label.id });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Deleted label “${label.name}”`);
    });

  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40">
      <ColorButton value={label.color} onChange={(color) => update({ color })} />
      <Input
        aria-label={`Rename ${label.name}`}
        value={draft}
        maxLength={EPIC_LABEL_NAME_MAX}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDraft(label.name);
          }
        }}
        className="h-7 border-transparent bg-transparent px-1.5 shadow-none hover:border-border dark:bg-transparent"
      />
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {uses} {uses === 1 ? 'epic' : 'epics'}
      </span>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="destructive" disabled={pending} onClick={remove}>
            <Check />
            Delete
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${label.name}`}
          className="shrink-0 text-muted-foreground"
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
