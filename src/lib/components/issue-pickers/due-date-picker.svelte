<script lang="ts">
  import DueDateOptions from './due-date-options.svelte';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null | undefined;
    onChange: (dueDate: string | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-auto min-w-64">
  {#snippet content(close)}
    <DueDateOptions
      {value}
      onSelect={(dueDate) => {
        close();
        onChange(dueDate);
      }}
    />
  {/snippet}
</PickerPopover>
