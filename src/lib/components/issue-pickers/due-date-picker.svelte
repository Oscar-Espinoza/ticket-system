<script lang="ts">
  import DueDateOptions, { type DueDateOptionsProps } from './due-date-options.svelte';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';

  let {
    value,
    onChange,
    placeholder,
    removeLabel,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps &
    Pick<DueDateOptionsProps, 'placeholder' | 'removeLabel'> & {
      value: string | null | undefined;
      onChange: (dueDate: string | null) => void;
    } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-auto min-w-64">
  {#snippet content(close)}
    <DueDateOptions
      {value}
      {placeholder}
      {removeLabel}
      onSelect={(dueDate) => {
        close();
        onChange(dueDate);
      }}
    />
  {/snippet}
</PickerPopover>
