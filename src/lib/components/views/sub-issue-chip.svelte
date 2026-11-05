<!-- Sub-issue progress chip (port of SubIssueChip in src/components/views/property-chips.tsx). -->
<script lang="ts">
  import NetworkIcon from '@lucide/svelte/icons/network';

  import { cn } from '@/lib/utils';
  import type { SubIssueCount } from './view-context.svelte';

  const CHIP =
    'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground';

  let { count, class: className }: { count: SubIssueCount | null; class?: string } = $props();
</script>

{#if count}
  <span title={`${count.done} of ${count.total} sub-issues done`} class={cn(CHIP, 'tabular-nums', className)}>
    <NetworkIcon class="size-3 shrink-0" aria-hidden="true" />
    {count.done}/{count.total}
  </span>
{/if}
