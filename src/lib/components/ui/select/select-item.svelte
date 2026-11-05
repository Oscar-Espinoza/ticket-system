<script lang="ts">
  import { Select as SelectPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import CheckIcon from '@lucide/svelte/icons/check';
  import { cn } from '@/lib/utils';

  type Props = WithoutChildrenOrChild<SelectPrimitive.ItemProps> & {
    /**
     * Radix `textValue`: the trigger label (alias of `label`). When neither is given, bits uses
     * the item's text content once the item has mounted (an empty label makes bits read it).
     */
    textValue?: string;
    children?: Snippet;
  };

  let {
    ref = $bindable(null),
    class: className,
    value,
    label,
    textValue,
    children: itemText,
    ...restProps
  }: Props = $props();
</script>

<!--
  bits highlights items virtually (aria-activedescendant), so Radix's `focus:`
  styles get `data-highlighted:` twins.
-->
<SelectPrimitive.Item
  bind:ref
  {value}
  label={label ?? textValue ?? ''}
  data-slot="select-item"
  class={cn(
    "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
    'data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground',
    className,
  )}
  {...restProps}
>
  {#snippet children({ selected })}
    <span class="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
      <!-- Radix Select.ItemIndicator -->
      {#if selected}
        <span aria-hidden="true">
          <CheckIcon class="pointer-events-none" />
        </span>
      {/if}
    </span>
    <!-- Radix Select.ItemText -->
    <span>
      {#if itemText}
        {@render itemText()}
      {:else}
        {label ?? textValue ?? value}
      {/if}
    </span>
  {/snippet}
</SelectPrimitive.Item>
