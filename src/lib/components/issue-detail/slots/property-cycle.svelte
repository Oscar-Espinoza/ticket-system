<!--
  Owner: B7. "Cycle" property row in IssueDetail. Hidden while cycles are off
  (unless the issue still points at a cycle); lists the current cycle, then
  upcoming ones, then recent past ones.
-->
<script lang="ts">
  import IterationCwIcon from '@lucide/svelte/icons/iteration-cw';

  import { projectHref } from '@/lib/components/app-shell/routes';
  import { cycleName, cycleStatus } from '@/lib/components/cycles/cycle-utils';
  import CycleGlyph from '@/lib/components/cycles/cycle-glyph.svelte';
  import CyclePicker from '@/lib/components/cycles/cycle-picker.svelte';
  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue, mutations }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const data = useProjectData();
  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  const cycle = $derived(issue.cycleId ? data.cycles.find((c) => c.id === issue.cycleId) : undefined);
</script>

{#snippet trigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" disabled={!canWrite} class="-ml-2 max-w-full gap-2 font-normal">
    {#if cycle}
      <CycleGlyph status={cycleStatus(cycle)} size={14} />
      <span class="truncate">{cycleName(cycle)}</span>
    {:else}
      <IterationCwIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">Add to cycle</span>
    {/if}
  </Button>
{/snippet}

{#if data.project.cyclesEnabled || cycle}
  <PropertyRow label="Cycle">
    <div class="flex min-w-0 items-center gap-1">
      {#if canWrite && data.project.cyclesEnabled}
        <CyclePicker value={issue.cycleId} onChange={(cycleId) => mutations.update(issue, { cycleId })}>
          {#snippet children({ props })}{@render trigger(props)}{/snippet}
        </CyclePicker>
      {:else}
        {@render trigger({})}
      {/if}
      {#if cycle}
        <a
          href={projectHref(data.project.id, `cycles/${cycle.id}`)}
          class="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`Open ${cycleName(cycle)}`}
        >
          Open
        </a>
      {/if}
    </div>
  </PropertyRow>
{/if}
