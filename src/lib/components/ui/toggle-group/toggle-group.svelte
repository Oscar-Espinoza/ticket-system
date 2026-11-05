<script lang="ts">
  import { untrack } from 'svelte';
  import {
    ToggleGroup as ToggleGroupPrimitive,
    type MultipleToggleGroupRootProps,
    type SingleToggleGroupRootProps,
  } from 'bits-ui';
  import { cn } from '@/lib/utils';
  import type { ToggleVariants } from '@/lib/components/ui/toggle';
  import { setToggleGroupContext } from './toggle-group-context.svelte';

  type Extra = ToggleVariants & {
    spacing?: number;
    orientation?: 'horizontal' | 'vertical';
  };
  type Props =
    | (SingleToggleGroupRootProps & Extra & { defaultValue?: string })
    | (MultipleToggleGroupRootProps & Extra & { defaultValue?: string[] });

  let {
    ref = $bindable(null),
    value = $bindable(),
    defaultValue,
    class: className,
    variant,
    size,
    spacing = 2,
    orientation = 'horizontal',
    style,
    onkeydown,
    ...restProps
  }: Props = $props();

  /*
   * React never passed `orientation` to Radix, so Radix's roving focus answered both arrow
   * axes. bits only answers the axis of its `orientation`, so the other axis is re-sent to the
   * focused item as the matching bits key (bits then moves focus, loops and updates the tab stop).
   */
  const synthetic = new WeakSet<Event>();
  function handleKeydown(e: KeyboardEvent & { currentTarget: EventTarget & HTMLDivElement }) {
    if (synthetic.has(e)) {
      // Our own re-sent key: bits' item handler has run; hide it from everyone else.
      e.stopPropagation();
      return;
    }
    onkeydown?.(e);
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute('data-toggle-group-item')) return;
    if (target.closest('[data-toggle-group-root]') !== e.currentTarget) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    let key: string | undefined;
    if (orientation === 'vertical') {
      if (e.key === 'ArrowRight') key = rtl ? 'ArrowUp' : 'ArrowDown';
      else if (e.key === 'ArrowLeft') key = rtl ? 'ArrowDown' : 'ArrowUp';
    } else {
      if (e.key === 'ArrowDown') key = rtl ? 'ArrowLeft' : 'ArrowRight';
      else if (e.key === 'ArrowUp') key = rtl ? 'ArrowRight' : 'ArrowLeft';
    }
    if (!key) return;
    e.preventDefault();
    const resent = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    synthetic.add(resent);
    target.dispatchEvent(resent);
  }

  // Radix `defaultValue` only seeds the initial state.
  const initialValue = untrack(() => defaultValue);
  if (value === undefined && initialValue !== undefined) value = initialValue;

  setToggleGroupContext({
    get variant() {
      return variant;
    },
    get size() {
      return size;
    },
    get spacing() {
      return spacing;
    },
    get orientation() {
      return orientation;
    },
  });
</script>

<!--
  `type` + `value` form a discriminated union that destructuring loses, so the
  binding is cast (the caller's props are still checked against Props).
-->
<ToggleGroupPrimitive.Root
  bind:ref
  bind:value={value as never}
  {orientation}
  onkeydown={handleKeydown}
  data-slot="toggle-group"
  data-variant={variant}
  data-size={size}
  data-spacing={spacing}
  style={[`--gap: ${spacing}`, style].filter(Boolean).join('; ')}
  class={cn(
    'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch',
    className,
  )}
  {...restProps as SingleToggleGroupRootProps}
/>
