<script lang="ts">
  import type { WorkflowState } from '@/lib/issue-model';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';
  import StateOptions from './state-options.svelte';

  let {
    value,
    onChange,
    states,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: string | null;
    onChange: (stateId: string, state: WorkflowState) => void;
    states?: WorkflowState[];
  } = $props();
</script>

<PickerPopover {...popover} bind:open>
  {#snippet content(close)}
    <StateOptions
      {value}
      {states}
      onSelect={(id, state) => {
        close();
        onChange(id, state);
      }}
    />
  {/snippet}
</PickerPopover>
