<!--

  React's trigger was `children` rendered through `PopoverTrigger asChild`. In
  Svelte the trigger is a `children` snippet that receives the trigger props —
  spread them on your element:

    <StatePicker value={issue.stateId} onChange={…}>
      {#snippet children({ props })}<Button {...props} variant="ghost">…</Button>{/snippet}
    </StatePicker>

  `open` + `onOpenChange` (controlled, e.g. opened by a hotkey) or `bind:open`;
  uncontrolled when omitted. `content(close)` → `content: Snippet<[close]>`,
  rendered only while open.
-->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  export { digitShortcut, keywordFilter } from './picker-utils';

  /** The trigger snippet: spread `props` on the trigger element (asChild). */
  export type PickerTrigger = Snippet<[{ props: Record<string, unknown> }]>;

  /** Props every popover picker accepts (trigger = children, via asChild). */
  export interface PickerPopoverProps {
    /** The trigger element; spread the `props` it receives onto it. */
    children: PickerTrigger;
    /** Controlled open state (e.g. opened by a hotkey); uncontrolled when omitted. Bindable. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    align?: 'start' | 'center' | 'end';
    side?: 'top' | 'right' | 'bottom' | 'left';
    /** E.g. return focus to a list row instead of the trigger. */
    onCloseAutoFocus?: (event: Event) => void;
  }
</script>

<script lang="ts">
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { cn } from '@/lib/utils';

  let {
    children,
    open = $bindable(),
    onOpenChange,
    align = 'start',
    side,
    onCloseAutoFocus,
    class: className,
    content,
  }: PickerPopoverProps & {
    class?: string;
    /** Rendered only while open; `close` dismisses the popover. */
    content: Snippet<[close: () => void]>;
  } = $props();

  let uncontrolled = $state(false);
  const isOpen = $derived(open ?? uncontrolled);

  function setOpen(next: boolean) {
    if (open === undefined) uncontrolled = next;
    else open = next;
    onOpenChange?.(next);
  }

  const close = () => setOpen(false);
</script>

<Popover bind:open={() => isOpen, setOpen}>
  <PopoverTrigger>
    {#snippet child({ props })}
      {@render children({ props })}
    {/snippet}
  </PopoverTrigger><!-- no whitespace: it would render a text node next to the trigger --><PopoverContent
    {align}
    {side}
    class={cn('w-56 gap-0 p-0', className)}
    {onCloseAutoFocus}
    onclick={(event: MouseEvent) => event.stopPropagation()}
  >
    {#if isOpen}
      {@render content(close)}
    {/if}
  </PopoverContent>
</Popover>
