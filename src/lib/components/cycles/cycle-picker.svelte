<!-- Cycle picker (popover + bare options), same shape as the issue pickers. -->
<script lang="ts">
  import PickerPopover, {
    type PickerPopoverProps,
  } from '@/lib/components/issue-pickers/picker-popover.svelte';
  import CycleOptions from './cycle-options.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null | undefined;
    onChange: (cycleId: string | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-72">
  {#snippet content(close)}
    <CycleOptions
      {value}
      onSelect={(id) => {
        close();
        onChange(id);
      }}
    />
  {/snippet}
</PickerPopover>
