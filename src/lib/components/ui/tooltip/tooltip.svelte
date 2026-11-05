<script lang="ts" generics="T = never">
  import { untrack } from 'svelte';
  import { Tooltip as TooltipPrimitive } from 'bits-ui';

  type Props = TooltipPrimitive.RootProps<T> & {
    /** Radix `defaultOpen`: initial state when `open` is not passed. */
    defaultOpen?: boolean;
  };

  let { open = $bindable(), defaultOpen = false, ...restProps }: Props = $props();

  if (open === undefined) open = untrack(() => defaultOpen);
</script>

<TooltipPrimitive.Root bind:open {...restProps} />
