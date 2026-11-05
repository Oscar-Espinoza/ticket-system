<script lang="ts">
  import { PickerPopover, type PickerPopoverProps } from '@/lib/components/issue-pickers';
  import EpicLabelOptions, { type EpicLabelOptionsProps } from './epic-label-options.svelte';

  let {
    projectId,
    labels,
    value,
    onChange,
    canCreate,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & EpicLabelOptionsProps = $props();
</script>

<PickerPopover {...popover} bind:open class="w-60">
  {#snippet content()}
    <EpicLabelOptions {projectId} {labels} {value} {onChange} {canCreate} />
  {/snippet}
</PickerPopover>
