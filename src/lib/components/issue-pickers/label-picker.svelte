<script module lang="ts">
  export { LABEL_COLORS } from './picker-utils';
</script>

<script lang="ts">
  import LabelOptions, { type LabelOptionsProps } from './label-options.svelte';
  import PickerPopover, { type PickerPopoverProps } from './picker-popover.svelte';

  let {
    value,
    onChange,
    open = $bindable(),
    ...popover
  }: PickerPopoverProps & LabelOptionsProps = $props();
</script>

<PickerPopover {...popover} bind:open class="w-60">
  {#snippet content()}
    <LabelOptions {value} {onChange} />
  {/snippet}
</PickerPopover>
