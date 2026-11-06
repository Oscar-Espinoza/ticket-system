<!-- Two-step picker (kind → epic) that adds an epic dependency (epic-relations.tsx AddDependency). -->
<script lang="ts">
  import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
  import BanIcon from '@lucide/svelte/icons/ban';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import {
    EPIC_RELATION_KINDS,
    EPIC_RELATION_LABEL,
    type EpicRelationKind,
  } from '@/lib/epic-model';
  import EpicIcon from './epic-icon.svelte';
  import EpicStatusIcon from './epic-status-icon.svelte';
  import type { DependencyCandidate } from './epic-relations.svelte';

  const KIND_ICON = {
    blocked_by: BanIcon,
    blocks: TriangleAlertIcon,
    related: Link2Icon,
  } satisfies Record<EpicRelationKind, unknown>;

  const KIND_PROMPT: Record<EpicRelationKind, string> = {
    blocked_by: 'Blocked by…',
    blocks: 'Blocking…',
    related: 'Related to…',
  };

  let {
    candidates,
    disabled,
    onAdd,
    children,
  }: {
    candidates: DependencyCandidate[];
    disabled: boolean;
    onAdd: (kind: EpicRelationKind, epicId: string) => void;
    children: PickerPopoverProps['children'];
  } = $props();

  let kind = $state<EpicRelationKind | null>(null);
</script>

<PickerPopover align="end" class="w-64" onOpenChange={(open) => !open && (kind = null)} {children}>
  {#snippet content(close: () => void)}
    {#if kind === null}
      <Command filter={keywordFilter}>
        <CommandInput placeholder="Add dependency…" />
        <CommandList>
          <CommandEmpty>No match.</CommandEmpty>
          {#each EPIC_RELATION_KINDS as k (k)}
            {@const Icon = KIND_ICON[k]}
            <CommandItem value={k} keywords={[KIND_PROMPT[k]]} onSelect={() => (kind = k)}>
              <Icon class="text-muted-foreground" />
              {KIND_PROMPT[k]}
            </CommandItem>
          {/each}
        </CommandList>
      </Command>
    {:else}
      {@const current = kind}
      <Command filter={keywordFilter}>
        <CommandInput
          autofocus
          placeholder={KIND_PROMPT[current]}
          onkeydown={(e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
            // Backspace on an empty search steps back to the kind list.
            if (e.key === 'Backspace' && !e.currentTarget.value) kind = null;
          }}
        />
        <CommandList>
          <CommandEmpty>No other epics to link.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="__back" keywords={['Back']} onSelect={() => (kind = null)}>
              <ArrowLeftIcon class="text-muted-foreground" />
              <span class="text-muted-foreground">{EPIC_RELATION_LABEL[current]}</span>
            </CommandItem>
            {#each candidates as epic (epic.id)}
              <CommandItem
                value={epic.id}
                keywords={[epic.name]}
                {disabled}
                onSelect={() => {
                  // Read before close(): closing resets `kind`, and `current` follows it.
                  const picked = current;
                  close();
                  onAdd(picked, epic.id);
                }}
              >
                <EpicIcon color={epic.color} />
                <span class="flex-1 truncate">{epic.name}</span>
                <EpicStatusIcon status={epic.status} />
              </CommandItem>
            {/each}
          </CommandGroup>
        </CommandList>
      </Command>
    {/if}
  {/snippet}
</PickerPopover>
