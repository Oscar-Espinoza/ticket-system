<!-- Small tri-state checkbox (Check / Minus) used by rows and the table header. -->
<script lang="ts">
  import CheckIcon from '@lucide/svelte/icons/check';
  import MinusIcon from '@lucide/svelte/icons/minus';

  import { cn } from '@/lib/utils';
  import { preventShiftSelect } from './selection.svelte';

  let {
    checked,
    onToggle,
    label,
    tabIndex = -1,
    class: className,
  }: {
    checked: boolean | 'mixed';
    onToggle: (event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) => void;
    label: string;
    /** Rows keep their checkbox out of the tab order (the row is the stop). */
    tabIndex?: number;
    class?: string;
  } = $props();
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={checked}
  aria-label={label}
  tabindex={tabIndex}
  onmousedown={preventShiftSelect}
  onclick={(event) => {
    // Don't open the issue underneath.
    event.stopPropagation();
    onToggle(event);
  }}
  class={cn(
    'relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background outline-none transition-[opacity,colors]',
    'after:absolute after:-inset-1.5 hover:border-ring focus-visible:ring-2 focus-visible:ring-ring',
    checked && 'border-primary bg-primary text-primary-foreground hover:border-primary',
    className,
  )}
>
  {#if checked === 'mixed'}
    <MinusIcon class="size-3" aria-hidden="true" />
  {:else if checked}
    <CheckIcon class="size-3" aria-hidden="true" />
  {/if}
</button>
