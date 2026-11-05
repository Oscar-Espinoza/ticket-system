<script lang="ts">
  import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
  import TargetIcon from '@lucide/svelte/icons/target';

  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';

  let {
    value,
    initiatives,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null;
    initiatives: { id: string; name: string }[];
    onChange: (initiativeId: string | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-64">
  {#snippet content(close: () => void)}
    {@const pick = (id: string | null) => {
      close();
      onChange(id);
    }}
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
          <CircleDashedIcon class="text-muted-foreground" />
          No initiative
        </CommandItem>
        {#each initiatives as initiative (initiative.id)}
          <CommandItem
            value={initiative.id}
            keywords={[initiative.name]}
            data-checked={initiative.id === value}
            onSelect={() => pick(initiative.id)}
          >
            <TargetIcon class="text-muted-foreground" />
            <span class="truncate">{initiative.name}</span>
          </CommandItem>
        {/each}
      </CommandList>
    </Command>
  {/snippet}
</PickerPopover>
