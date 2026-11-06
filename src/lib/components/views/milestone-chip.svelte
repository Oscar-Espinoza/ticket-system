<!-- Read-only milestone chip. -->
<script lang="ts">
  import DiamondIcon from '@lucide/svelte/icons/diamond';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { cn } from '@/lib/utils';
  import { CHIP_CLASS } from './chip-class';

  let {
    epicId,
    milestoneId,
    class: className,
  }: { epicId: string | null; milestoneId: string | null; class?: string } = $props();

  const data = useProjectData();
  const milestone = $derived.by(() => {
    if (!milestoneId) return null;
    return (
      (epicId ? data.epics.filter((e) => e.id === epicId) : data.epics)
        .flatMap((e) => e.milestones)
        .find((m) => m.id === milestoneId) ?? null
    );
  });
</script>

{#if milestone}
  <span title={`Milestone: ${milestone.name}`} class={cn(CHIP_CLASS, className)}>
    <DiamondIcon class="size-3 shrink-0" aria-hidden="true" />
    <span class="truncate">{milestone.name}</span>
  </span>
{/if}
