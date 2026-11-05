<script lang="ts">
  import { PickerPopover, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import type { InitiativeStatus } from '@/components/initiatives/initiative-model';
  import InitiativeStatusOptions from './initiative-status-options.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: InitiativeStatus;
    onChange: (status: InitiativeStatus) => void;
  } = $props();
</script>

<PickerPopover {...popover} bind:open>
  {#snippet content(close: () => void)}
    <InitiativeStatusOptions
      {value}
      onSelect={(status) => {
        close();
        onChange(status);
      }}
    />
  {/snippet}
</PickerPopover>
