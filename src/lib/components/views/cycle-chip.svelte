<!-- Read-only cycle chip (port of CycleChip in src/components/views/property-chips.tsx). -->
<script lang="ts">
  import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { cn } from '@/lib/utils';

  const CHIP =
    'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground';

  let { cycleId, class: className }: { cycleId: string | null; class?: string } = $props();

  const data = useProjectData();
  const cycle = $derived(cycleId ? data.cycles.find((c) => c.id === cycleId) : null);
  const name = $derived(cycle ? cycle.name || `Cycle ${cycle.number}` : '');
</script>

{#if cycle}
  <span title={`Cycle: ${name}`} class={cn(CHIP, className)}>
    <RefreshCcwIcon class="size-3 shrink-0" aria-hidden="true" />
    <span class="truncate">{name}</span>
  </span>
{/if}
