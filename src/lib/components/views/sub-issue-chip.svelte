<!-- Sub-issue progress chip. -->
<script lang="ts">
  import NetworkIcon from '@lucide/svelte/icons/network';

  import { cn } from '@/lib/utils';
  import { CHIP_CLASS } from './chip-class';
  import type { SubIssueCount } from './view-context.svelte';

  let { count, class: className }: { count: SubIssueCount | null; class?: string } = $props();
</script>

{#if count}
  <span title={`${count.done} of ${count.total} sub-issues done`} class={cn(CHIP_CLASS, 'tabular-nums', className)}>
    <NetworkIcon class="size-3 shrink-0" aria-hidden="true" />
    {count.done}/{count.total}
  </span>
{/if}
