<script lang="ts">
  import { untrack } from 'svelte';
  import { Dialog as SheetPrimitive } from 'bits-ui';

  type Props = SheetPrimitive.RootProps & {
    /** Radix `defaultOpen`: initial state when `open` is not passed. */
    defaultOpen?: boolean;
  };

  let { open = $bindable(), defaultOpen = false, ...restProps }: Props = $props();

  if (open === undefined) open = untrack(() => defaultOpen);
</script>

<SheetPrimitive.Root bind:open {...restProps} />
