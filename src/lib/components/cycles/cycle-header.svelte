<!-- Cycle page header: name, dates, status, favorite, edit / complete. -->
<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Pencil from '@lucide/svelte/icons/pencil';

  import { projectHref } from '@/components/app-shell/routes';
  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { LabelChip } from '@/lib/components/ui-icons';
  import {
    cycleName,
    daysLeft,
    daysUntil,
    formatCycleDay,
    formatCycleRange,
    type CycleStatus,
  } from '@/components/cycles/cycle-utils';
  import CompleteCycleDialog from './complete-cycle-dialog.svelte';
  import CycleFormDialog, { type EditableCycle } from './cycle-form-dialog.svelte';
  import CycleGlyph from './cycle-glyph.svelte';

  let {
    projectId,
    cycle,
    status,
    progress,
    unfinished,
    nextCycleName,
    canWrite,
  }: {
    projectId: string;
    cycle: EditableCycle & { id: string };
    status: CycleStatus;
    progress: number;
    unfinished: number;
    nextCycleName: string | null;
    canWrite: boolean;
  } = $props();

  let editing = $state(false);
  let completing = $state(false);

  const timing = $derived.by(() => {
    if (cycle.completedAt) return `Completed ${formatCycleDay(cycle.completedAt)}`;
    if (status === 'past') return 'Ended — completes automatically';
    if (status === 'upcoming') return `Starts in ${daysUntil(cycle)} days`;
    return daysLeft(cycle) === 0 ? 'Last day' : `${daysLeft(cycle)} days left`;
  });
</script>

<div class="flex flex-col gap-2">
  <a
    href={projectHref(projectId, 'cycles')}
    class="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
  >
    <ChevronLeft class="size-3.5" />
    Cycles
  </a>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <CycleGlyph {status} {progress} />
    <h2 class="text-lg font-medium">{cycleName(cycle)}</h2>
    <span class="text-sm text-muted-foreground">{formatCycleRange(cycle)}</span>
    <LabelChip dot={false}>{timing}</LabelChip>
    <div class="ml-auto flex items-center gap-1">
      <FavoriteButton targetType="cycle" targetId={cycle.id} />
      {#if canWrite}
        <Button size="sm" variant="ghost" onclick={() => (editing = true)}>
          <Pencil />
          Edit
        </Button>
      {/if}
      {#if canWrite && !cycle.completedAt && status !== 'upcoming'}
        <Button size="sm" variant="outline" onclick={() => (completing = true)}>
          <CircleCheck />
          Complete cycle
        </Button>
      {/if}
    </div>
  </div>
  {#if cycle.description}
    <p class="max-w-2xl text-sm whitespace-pre-line text-muted-foreground">{cycle.description}</p>
  {/if}

  <CycleFormDialog {projectId} bind:open={editing} {cycle} />
  {#if canWrite && !cycle.completedAt}
    <!-- React keyed this on `completing` so the rollover choice resets per open. -->
    {#key completing}
      <CompleteCycleDialog
        {projectId}
        {cycle}
        {unfinished}
        {nextCycleName}
        bind:open={completing}
      />
    {/key}
  {/if}
</div>
