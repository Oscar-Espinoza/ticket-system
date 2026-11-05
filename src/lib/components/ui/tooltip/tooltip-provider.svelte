<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui';

  // Radix-compatible defaults: the React wrapper set delayDuration=0; bits'
  // skipDelayDuration default (300) is the same as Radix's.
  let { delayDuration = 0, ...restProps }: TooltipPrimitive.ProviderProps = $props();
</script>

<TooltipPrimitive.Provider {delayDuration} {...restProps} />
