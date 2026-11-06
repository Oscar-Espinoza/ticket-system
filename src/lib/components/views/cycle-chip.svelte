<!-- Read-only cycle chip. -->
<script lang="ts">
  import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { cn } from '@/lib/utils';
  import { CHIP_CLASS } from './chip-class';

  let { cycleId, class: className }: { cycleId: string | null; class?: string } = $props();

  const data = useProjectData();
  const cycle = $derived(cycleId ? data.cycles.find((c) => c.id === cycleId) : null);
  const name = $derived(cycle ? cycle.name || `Cycle ${cycle.number}` : '');
</script>

{#if cycle}
  <span title={`Cycle: ${name}`} class={cn(CHIP_CLASS, className)}>
    <RefreshCcwIcon class="size-3 shrink-0" aria-hidden="true" />
    <span class="truncate">{name}</span>
  </span>
{/if}
