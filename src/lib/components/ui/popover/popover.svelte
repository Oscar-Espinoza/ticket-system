<script lang="ts">
  import { untrack } from 'svelte';
  import { Popover as PopoverPrimitive } from 'bits-ui';
  import { PopoverAnchorState, setPopoverAnchorContext } from './popover-context.svelte';

  type Props = PopoverPrimitive.RootProps & {
    /** Radix `defaultOpen`: initial state when `open` is not passed. */
    defaultOpen?: boolean;
  };

  let { open = $bindable(), defaultOpen = false, ...restProps }: Props = $props();

  if (open === undefined) open = untrack(() => defaultOpen);

  setPopoverAnchorContext(new PopoverAnchorState());
</script>

<PopoverPrimitive.Root bind:open {...restProps} />
