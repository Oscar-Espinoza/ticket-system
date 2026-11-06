<!--
  StartDatePicker (the table view reuses it). DueDatePicker's copy is about due dates, so this is
  its start-date twin (quick options + calendar). Trigger = `children` snippet
  receiving `{ props }` (asChild), like every PickerPopover picker.
-->
<script lang="ts">
  import PickerPopover, { type PickerPopoverProps } from '@/lib/components/issue-pickers/picker-popover.svelte';
  import StartDateOptions from './start-date-options.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null | undefined;
    onChange: (startDate: string | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-auto min-w-64">
  {#snippet content(close)}
    <StartDateOptions
      {value}
      onSelect={(startDate) => {
        close();
        onChange(startDate);
      }}
    />
  {/snippet}
</PickerPopover>
