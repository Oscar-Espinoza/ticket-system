<!-- Read-only epic chip. -->
<script lang="ts">
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { cn } from '@/lib/utils';
  import { CHIP_CLASS } from './chip-class';

  let { epicId, class: className }: { epicId: string | null; class?: string } = $props();

  const data = useProjectData();
  const epic = $derived(epicId ? data.epics.find((e) => e.id === epicId) : null);
</script>

{#if epic}
  <span title={`Epic: ${epic.name}`} class={cn(CHIP_CLASS, className)}>
    <span
      aria-hidden="true"
      class="size-2 shrink-0 rounded-full bg-muted-foreground"
      style:background-color={epic.color || undefined}
    ></span>
    <span class="truncate">{epic.name}</span>
  </span>
{/if}
