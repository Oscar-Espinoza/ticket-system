<!--
  Icon buttons inside an issue row: out of the tab order (the row is the stop)
  and they don't open the issue when clicked. Trigger props (aria-*, onclick,
  data-state…) arrive from the picker's `child` snippet and are forwarded.
  (RowButton in issue-row.tsx.)
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    label,
    onclick,
    children,
    ref = $bindable(null),
    ...rest
  }: HTMLButtonAttributes & { label: string; ref?: HTMLButtonElement | null } = $props();
</script>

<button
  bind:this={ref}
  type="button"
  tabindex={-1}
  aria-label={label}
  class="-m-1 flex shrink-0 rounded p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
  {...rest}
  onclick={(event) => {
    event.stopPropagation();
    onclick?.(event);
  }}
>
  {@render children?.()}
</button>
