<script lang="ts">
  import type { IssueUser } from '@/lib/issue-model';
  import AssigneeOptions from './assignee-options.svelte';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null | undefined;
    onChange: (userId: string | null, user: IssueUser | null) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open class="w-60">
  {#snippet content(close)}
    <AssigneeOptions
      {value}
      onSelect={(id, user) => {
        close();
        onChange(id, user);
      }}
    />
  {/snippet}
</PickerPopover>
