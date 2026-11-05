<!-- Keyboard-first epic status picker on the shared PickerPopover (trigger = children snippet). -->
<script lang="ts">
  import { PickerPopover, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import type { EpicStatus } from '@/components/epics/epic-model';
  import EpicStatusOptions from './epic-status-options.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & { value: EpicStatus; onChange: (status: EpicStatus) => void } = $props();
</script>

<PickerPopover {...popover} bind:open>
  {#snippet content(close: () => void)}
    <EpicStatusOptions
      {value}
      onSelect={(status) => {
        close();
        onChange(status);
      }}
    />
  {/snippet}
</PickerPopover>
