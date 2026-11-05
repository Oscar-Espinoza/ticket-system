<script lang="ts">
  import type { Priority } from '@/lib/issue-model';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';
  import PriorityOptions from './priority-options.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & { value: Priority | null; onChange: (priority: Priority) => void } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-48">
  {#snippet content(close)}
    <PriorityOptions
      {value}
      onSelect={(priority) => {
        close();
        onChange(priority);
      }}
    />
  {/snippet}
</PickerPopover>
