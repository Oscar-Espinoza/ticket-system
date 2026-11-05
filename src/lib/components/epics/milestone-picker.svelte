<script lang="ts">
  import BanIcon from '@lucide/svelte/icons/ban';

  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import MilestoneGlyph from './milestone-glyph.svelte';

  let {
    value,
    milestones,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null;
    milestones: { id: string; name: string }[];
    onChange: (milestoneId: string | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-64">
  {#snippet content(close: () => void)}
    {@const pick = (id: string | null) => {
      close();
      onChange(id);
    }}
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
          <BanIcon class="text-muted-foreground" />
          No milestone
        </CommandItem>
        {#each milestones as milestone (milestone.id)}
          <CommandItem
            value={milestone.id}
            keywords={[milestone.name]}
            data-checked={milestone.id === value}
            onSelect={() => pick(milestone.id)}
          >
            <MilestoneGlyph class="text-muted-foreground" />
            <span class="truncate">{milestone.name}</span>
          </CommandItem>
        {/each}
      </CommandList>
    </Command>
  {/snippet}
</PickerPopover>
