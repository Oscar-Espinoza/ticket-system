<script lang="ts">
  import type { IssueUser } from '@/lib/issue-model';
  import AssigneeOptions, { type AssigneeOptionsProps } from './assignee-options.svelte';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';

  let {
    value,
    onChange,
    placeholder,
    noneLabel,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps &
    Pick<AssigneeOptionsProps, 'placeholder' | 'noneLabel'> & {
      value: string | null | undefined;
      onChange: (userId: string | null, user: IssueUser | null) => void;
    } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-60">
  {#snippet content(close)}
    <AssigneeOptions
      {value}
      {placeholder}
      {noneLabel}
      onSelect={(id, user) => {
        close();
        onChange(id, user);
      }}
    />
  {/snippet}
</PickerPopover>
