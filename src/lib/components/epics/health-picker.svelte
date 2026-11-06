<script lang="ts">
  import XIcon from '@lucide/svelte/icons/x';

  import { PickerPopover, keywordFilter, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
  } from '@/lib/components/ui/command';
  import { HEALTHS, HEALTH_LABEL, type Health } from '@/lib/epic-model';
  import HealthDot from './health-dot.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & { value: Health | null; onChange: (health: Health | null) => void } =
    $props();
</script>

<PickerPopover {...popover} bind:open>
  {#snippet content(close: () => void)}
    {@const pick = (health: Health | null) => {
      close();
      onChange(health);
    }}
    <Command filter={keywordFilter}>
      <CommandInput placeholder="Set health…" />
      <CommandList>
        <CommandEmpty>No match.</CommandEmpty>
        {#each HEALTHS as health, index (health)}
          <CommandItem
            value={health}
            keywords={[HEALTH_LABEL[health]]}
            data-checked={health === value}
            onSelect={() => pick(health)}
          >
            <HealthDot {health} />
            {HEALTH_LABEL[health]}
            <CommandShortcut>{index + 1}</CommandShortcut>
          </CommandItem>
        {/each}
        {#if value}
          <CommandItem value="none" keywords={['No health', 'Clear']} onSelect={() => pick(null)}>
            <XIcon class="text-muted-foreground" />
            Clear health
          </CommandItem>
        {/if}
      </CommandList>
    </Command>
  {/snippet}
</PickerPopover>
