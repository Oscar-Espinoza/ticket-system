<!-- Read-only epic chip (port of EpicChip in src/components/views/property-chips.tsx). -->
<script lang="ts">
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { cn } from '@/lib/utils';

  const CHIP =
    'inline-flex h-5 max-w-40 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground';

  let { epicId, class: className }: { epicId: string | null; class?: string } = $props();

  const data = useProjectData();
  const epic = $derived(epicId ? data.epics.find((e) => e.id === epicId) : null);
</script>

{#if epic}
  <span title={`Epic: ${epic.name}`} class={cn(CHIP, className)}>
    <span
      aria-hidden="true"
      class="size-2 shrink-0 rounded-full bg-muted-foreground"
      style:background-color={epic.color || undefined}
    ></span>
    <span class="truncate">{epic.name}</span>
  </span>
{/if}
