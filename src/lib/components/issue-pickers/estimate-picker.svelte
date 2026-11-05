<!-- Renders nothing (not even the trigger) when estimates are off. -->
<script lang="ts">
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import EstimateOptions from './estimate-options.svelte';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & {
    value: number | null | undefined;
    onChange: (estimate: number | null) => void;
  } = $props();

  const data = useProjectData();
</script>

{#if data.project.estimateScale !== 'none'}
  <PickerPopover {...popover} bind:open class="w-48">
    {#snippet content(close)}
      <EstimateOptions
        {value}
        onSelect={(estimate) => {
          close();
          onChange(estimate);
        }}
      />
    {/snippet}
  </PickerPopover>
{/if}
